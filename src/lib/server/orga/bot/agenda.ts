import { BOT_HOME_GROUP_CHAT_ID, VERCEL_BRANCH_URL } from '$env/static/private';
import { GrammyError, type Bot } from 'grammy';
import { type CalendarEvent } from '$lib/server/calendar';
import * as store from '../plan-store';
import type { Plan } from '../plan-store';
import { DateTime } from 'luxon';
import { calendarByName, dateKey, toPlanEvent, type PlanEvent } from '../week-plan-api';
import topics from '../utils/topics';
import type {
	InputRichBlock,
	InputRichMessage,
	RichMessageButton,
	RichText
} from 'grammy/types';
import type { TelegramUser } from '../users';

const timeZone = 'Europe/Lisbon';

export class AgendaBot {
	constructor(private readonly bot: Bot) {}

	public async sendAgenda() {
		const tomorrow = DateTime.now().setZone(timeZone).plus({ day: 1 });
		const events = await this.getEventsByDate(tomorrow);

		if (events.length) {
			const plans = await getPlans(events);
			const message = await this.bot.api.sendRichMessage(
				BOT_HOME_GROUP_CHAT_ID,
				buildAgenda(tomorrow, events, plans),
				{ message_thread_id: topics.dailyInfo }
			);

			await store.setMessageId('agenda', dateKey(tomorrow), message.message_id);
			await this.watchCalendar(tomorrow, message.message_id);
		} else {
			console.info('No agenda for today');
		}
	}

	public async updateAgenda(date: DateTime, messageId: number) {
		console.info(`Update agenda for date=${date.toISODate()} messageId=${messageId}`);

		const events = await this.getEventsByDate(date);
		const plans = await getPlans(events);

		try {
			await this.bot.api.editMessageText(
				BOT_HOME_GROUP_CHAT_ID,
				messageId,
				buildAgenda(date, events, plans)
			);
		} catch (err) {
			// two updates within the same second render the same footer, Telegram answers 400
			if (!(err instanceof GrammyError) || !/message is not modified/i.test(err.description)) console.error(err);
		}
	}

	/** Sign-ups do not touch the calendar, so the calendar watch does not fire for them. */
	public async refresh(date: DateTime) {
		const messageId = await store.getMessageId('agenda', dateKey(date));
		if (messageId) await this.updateAgenda(date, messageId);
	}

	private async getEventsByDate(date: DateTime) {
		const startOfDay = date.startOf('day').toJSDate();
		const endOfDay = date.endOf('day').toJSDate();

		const eventsPerCalendar = await Promise.all(
			Object.values(calendarByName).map((calendar) => calendar.getEvents([], startOfDay, endOfDay, { props: 'private' }))
		);

		return eventsPerCalendar.flat().sort(byStartDate);
	}

	private async watchCalendar(date: DateTime, messageId: number) {
		const startOfDay = date.startOf('day').toJSDate();
		const endOfDay = date.endOf('day').toJSDate();

		await Promise.all(
			Object.values(calendarByName).map((calendar) =>
				calendar.watchEvents(startOfDay, endOfDay, {
					id: crypto.randomUUID(),
					token: JSON.stringify({ date, messageId }),
					type: 'webhook',
					address: `https://${VERCEL_BRANCH_URL}/orga/api/telegram/agenda`,
					expiration: endOfDay.getTime().toString()
				})
			)
		);
	}
}

/** Google descriptions are HTML: lists and line breaks become lines, other tags are dropped (links are lost) */
function descriptionLines(description: string) {
	return description
		.replaceAll(/<(br|\/li|\/ul)>/g, '\n')
		.replaceAll('<li>', '• ')
		.replaceAll(/<[^>]+>/g, '')
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&amp;', '&')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

/**
 * Resource calendars are named "{group}-{floor}-{name} (capacity)", e.g. "Farmhouse-1-Room A (4)": only the name is shown.
 * Other locations (free text, no capacity) stay as they are. Several rooms arrive separated by commas.
 */
export function parseLocation(location: string) {
	return location
		.split(', ')
		.map((room) => {
			const capacity = /\s*\(\d+\)\s*$/;
			const parts = room.replace(capacity, '').trim().split(/\s*-\s*/);
			if (parts.length >= 3 && /^\d+$/.test(parts[1])) return parts.slice(2).join('-');
			// without a floor it is only a resource name when the capacity is there, so "Hive - back door" stays
			if (parts.length >= 2 && capacity.test(room)) return parts.slice(1).join('-');
			return room;
		})
		.join(', ');
}

function formatDuration(event: CalendarEvent) {
	if (!event.start?.dateTime || !event.end?.dateTime) return '';

	const start = DateTime.fromISO(event.start.dateTime);
	const end = DateTime.fromISO(event.end.dateTime);

	const dur = end.diff(start).shiftTo('hours', 'minutes');

	const h = Math.floor(dur.hours);
	const m = Math.round(dur.minutes);

	const parts = [];

	if (h) parts.push(`${h}h`);
	if (m) parts.push(`${m}m`);

	return parts.length ? `(${parts.join(' ')})` : '';
}

/** sign-ups of the events that have jobs, by event id */
async function getPlans(events: CalendarEvent[]) {
	const planEvents = events.flatMap((event) => toPlanEvent(event) ?? []);
	const plans = await Promise.all(planEvents.map(({ type, date }) => store.getPlan(type, date)));
	return new Map(planEvents.map((planEvent, i) => [planEvent.event.id!, { planEvent, plan: plans[i] }]));
}

type Plans = Awaited<ReturnType<typeof getPlans>>;

function people(persons: TelegramUser[]): RichText[] {
	if (persons.length === 0) return ['❓️'];

	return persons.flatMap((person, index): RichText[] => {
		const name: RichText = person.id
			? { type: 'url', text: person.first_name, url: `tg://user?id=${person.id}` }
			: person.first_name;
		if (index === 0) return [name];
		return [index === persons.length - 1 ? ' & ' : ', ', name];
	});
}

function jobBlocks(planEvent: PlanEvent | undefined, plan: Plan | undefined): InputRichBlock[] {
	const blocks: InputRichBlock[] = [];

	for (const { key, title } of planEvent?.jobs ?? []) {
		const { persons = [], details } = plan?.[key] ?? {};
		if (!details) {
			blocks.push({ type: 'paragraph', text: [`${title}: `, ...people(persons)] });
		} else {
			const [firstLine, ...rest] = details.split('\n');
			blocks.push({ type: 'paragraph', text: [`${title}: ${firstLine} with `, ...people(persons)] });
			blocks.push(...rest.filter(Boolean).map((text): InputRichBlock => ({ type: 'paragraph', text })));
		}
	}

	return blocks;
}

function eventBlocks(event: CalendarEvent, plans: Plans): InputRichBlock[] {
	const title: RichText[] = [];

	if (event.start?.dateTime) {
		const time = DateTime.fromISO(event.start.dateTime)
			.setZone(event.start.timeZone!)
			.setLocale('en')
			.toLocaleString({ hour12: false, hour: '2-digit', minute: '2-digit' });
		title.push({ type: 'bold', text: time }, ' ');
	}
	title.push(event.summary ?? '');
	const duration = formatDuration(event);
	if (duration) title.push(` ${duration}`);

	const blocks: InputRichBlock[] = [{ type: 'paragraph', text: title }];

	if (event.location) {
		blocks.push({
			type: 'paragraph',
			text: { type: 'italic', text: `\uFE6B${parseLocation(event.location)}` }
		});
	}

	const entry = plans.get(event.id!);
	blocks.push(...jobBlocks(entry?.planEvent, entry?.plan));
	blocks.push(
		...descriptionLines(event.description ?? '').map(
			(text): InputRichBlock => ({ type: 'paragraph', text })
		)
	);

	const sos = sosButtons(event, plans);
	return [
		{ type: 'blockquote', blocks },
		...(sos.length ? [{ type: 'buttons' as const, align: 'left' as const, buttons: sos }] : [])
	];
}

function byStartDate(a: CalendarEvent, b: CalendarEvent) {
	return (
		Date.parse(a.start?.dateTime ?? '2222-12-22') - Date.parse(b.start?.dateTime ?? '2222-12-22')
	);
}

function buildAgenda(date: DateTime, events: CalendarEvent[], plans: Plans): InputRichMessage {
	const blocks: InputRichBlock[] = [
		{ type: 'heading', size: 1, text: `🗓️ Agenda for ${date.setLocale('en').toFormat('cccc')}` },
		...events.flatMap((event) => eventBlocks(event, plans))
	];

	blocks.push({
		type: 'footer',
		text: {
			type: 'subscript',
			text:
				'Last updated ' +
				DateTime.now().setZone(timeZone).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)
		}
	});

	return { blocks };
}

/** open jobs of an event that are marked as urgent (sos) */
function sosButtons(event: CalendarEvent, plans: Plans) {
	const entry = plans.get(event.id!);
	// Skip weekly tasks
	if (!entry || !event.start?.dateTime) return [];

	const { type, date, jobs } = entry.planEvent;
	const weekday = new Date(event.start.dateTime).toLocaleDateString('en', { weekday: 'long' });

	return jobs
		.filter(({ key, sos }) => sos && !entry.plan[key]?.persons.length)
		.map(({ key, title }): RichMessageButton => ({
			text: `🆘 I will do ${title} on ${weekday}!`,
			callback_data: `plan:${type}:${date}:${key}`,
			style: 'danger'
		}));
}
