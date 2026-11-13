import { BOT_HOME_GROUP_CHAT_ID, VERCEL_BRANCH_URL } from '$env/static/private';
import { InlineKeyboard, type Bot } from 'grammy';
import { type CalendarEvent } from '$lib/server/calendar';
import * as store from '../plan-store';
import type { Plan } from '../plan-store';
import { DateTime } from 'luxon';
import { calendarByName, dateKey, toPlanEvent, type PlanEvent } from '../week-plan-api';
import { formatTelegramUsers } from './weekPlan';
import topics from '../utils/topics';
import type { InlineKeyboardMarkup } from 'grammy/types';

const timeZone = 'Europe/Lisbon';

export class AgendaBot {
	constructor(private readonly bot: Bot) {}

	public async sendAgenda() {
		const tomorrow = DateTime.now().setZone(timeZone).plus({ day: 1 });
		const events = await this.getEventsByDate(tomorrow);

		if (events.length) {
			const plans = await getPlans(events);
			const text = formatAgenda(tomorrow.toJSDate(), events, plans);
			const keyboard = generateAvailableJobButtons(events, plans);

			const message = await this.bot.api.sendMessage(BOT_HOME_GROUP_CHAT_ID, text, {
				parse_mode: 'HTML',
				reply_markup: keyboard,
				message_thread_id: topics.dailyInfo,
				link_preview_options: {
					is_disabled: true
				}
			});

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
		const text = formatAgenda(date.toJSDate(), events, plans);
		const keyboard = generateAvailableJobButtons(events, plans);

		try {
			await this.bot.api.editMessageText(BOT_HOME_GROUP_CHAT_ID, messageId, text, {
				parse_mode: 'HTML',
				reply_markup: keyboard,
				link_preview_options: {
					is_disabled: true
				}
			});
		} catch (err) {
			console.error(err);
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
			Object.values(calendarByName).map((calendar) => calendar.getEvents([], startOfDay, endOfDay))
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

function transformDescription(description: string): string {
	return (
		'\n' +
		description
			.replaceAll(/<(br|\/li|\/ul)>/g, '\n')
			.replaceAll('<li>', '• ')
			.replaceAll('<ul>', '')
	);
}

function formatLocation(location?: string | null) {
	return location ? `<i>\uFE6B${location.replace(/^(\w+)-\d+-\1 \(\d+\)$/, '$1')}</i>` : '';
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

function formatJobs(planEvent: PlanEvent | undefined, plan: Plan | undefined) {
	const block: string[] = [];

	for (const { key, title } of planEvent?.jobs ?? []) {
		const { persons = [], details } = plan?.[key] ?? {};
		if (!details) {
			block.push(`${title}: ${formatTelegramUsers(persons)}`);
		} else {
			const [firstLine, rest] = details.split('\n', 2);
			block.push(`${title}: ${firstLine} with ${formatTelegramUsers(persons)}`);
			if (rest) block.push(rest);
		}
	}

	return block.join('\n');
}

function formatEvent(event: CalendarEvent, plans: Plans): string {
	const firstLine = [event.summary];

	if (event.start?.dateTime) {
		const time = DateTime.fromISO(event.start.dateTime)
			.setZone(event.start.timeZone!)
			.setLocale('en')
			.toLocaleString({
				hour12: false,
				hour: '2-digit',
				minute: '2-digit'
			});
		firstLine.unshift(`<b>${time}</b>`);
		firstLine.push(formatDuration(event));
	}

	const lines = [
		firstLine.join(' '),
		formatLocation(event.location),
		formatJobs(plans.get(event.id!)?.planEvent, plans.get(event.id!)?.plan),
		transformDescription(event.description ?? '')
	].filter(Boolean);

	return `<blockquote expandable>${lines.join('\n')}</blockquote>`;
}

function byStartDate(a: CalendarEvent, b: CalendarEvent) {
	return (
		Date.parse(a.start?.dateTime ?? '2222-12-22') - Date.parse(b.start?.dateTime ?? '2222-12-22')
	);
}

function formatAgenda(date: Date, events: CalendarEvent[], plans: Plans) {
	return `🗓️ <b>Agenda for ${date.toLocaleDateString('en', { weekday: 'long' })}</b>

${events.map((event) => formatEvent(event, plans)).join('\n\n')}`;
}

function generateAvailableJobButtons(events: CalendarEvent[], plans: Plans): InlineKeyboardMarkup {
	let keyboard = new InlineKeyboard();

	for (const event of events) {
		const entry = plans.get(event.id!);
		// Skip weekly tasks
		if (!entry || !event.start?.dateTime) continue;

		const { type, date, jobs } = entry.planEvent;
		for (const { key, title, sos } of jobs) {
			if (sos && !entry.plan[key]?.persons.length) {
				keyboard = keyboard
					.row()
					.text(
						`🆘 I will do ${title} on ${new Date(event.start.dateTime).toLocaleDateString('en', { weekday: 'long' })}!`,
						`plan:${type}:${date}:${key}`
					);
			}
		}
	}

	return keyboard;
}
