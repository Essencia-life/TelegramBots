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

const entities: Record<string, string> = { nbsp: ' ', lt: '<', gt: '>', quot: '"', amp: '&', apos: "'" };

function decodeEntities(text: string) {
	return text.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
		if (name[0] !== '#') return entities[name.toLowerCase()] ?? match;
		const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
		return String.fromCodePoint(code);
	});
}

const inlineTypes: Record<string, 'bold' | 'italic' | 'underline' | 'strikethrough'> = {
	b: 'bold',
	strong: 'bold',
	i: 'italic',
	em: 'italic',
	u: 'underline',
	s: 'strikethrough',
	strike: 'strikethrough',
	del: 'strikethrough'
};

const lineBreakTags = new Set(['br', 'p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

type Frame = { tag: string; url?: string; children: RichText[] };

function wrap({ tag, url, children }: Frame): RichText {
	if (tag === 'a' && url) return { type: 'url', text: children, url };
	return tag in inlineTypes ? { type: inlineTypes[tag], text: children } : children;
}

type DescriptionLine = { content: RichText[]; list?: { id: number; ordered: boolean } };

/**
 * Google descriptions are HTML: bold, italic, underline, strikethrough and links are kept, line breaks become lines,
 * list items are marked with their list, other tags are dropped.
 */
export function descriptionLines(description: string): DescriptionLine[] {
	const stack: Frame[] = [{ tag: '', children: [] }];
	const lists: { id: number; ordered: boolean }[] = [];
	let listCount = 0;
	let item: DescriptionLine['list'];
	const lines: DescriptionLine[] = [];

	const endLine = () => {
		// open formatting is closed and reopened, so a line break inside <b> keeps both lines bold
		for (let i = stack.length - 1; i > 0; i--) stack[i - 1].children.push(wrap(stack[i]));
		const children = stack[0].children;
		for (const frame of stack) frame.children = [];

		if (typeof children[0] === 'string') children[0] = children[0].trimStart();
		if (typeof children.at(-1) === 'string') children[children.length - 1] = (children.at(-1) as string).trimEnd();

		const content = children.filter((child) => child !== '');
		if (content.length) lines.push({ content, list: item });
	};

	for (const [token] of description.matchAll(/<\/?[a-z][^>]*>|<|[^<]+/gi)) {
		if (!token.startsWith('<') || token === '<') {
			const text = decodeEntities(token).replaceAll(/\s+/g, ' ');
			if (text) stack.at(-1)!.children.push(text);
			continue;
		}

		const closing = token[1] === '/';
		const tag = token.match(/^<\/?([a-z][a-z0-9]*)/i)![1].toLowerCase();

		if (lineBreakTags.has(tag)) endLine();

		if (closing) {
			if (tag === 'li') item = undefined;
			if (tag === 'ul' || tag === 'ol') lists.pop();
			const open = stack.findLastIndex((frame) => frame.tag === tag);
			// formatting tags that were never closed or closed out of order are ignored
			if (open > 0 && (tag === 'a' || tag in inlineTypes)) {
				for (let i = stack.length - 1; i >= open; i--) stack[i - 1].children.push(wrap(stack[i]));
				stack.length = open;
			}
		} else if (tag === 'ul' || tag === 'ol') {
			lists.push({ id: ++listCount, ordered: tag === 'ol' });
		} else if (tag === 'li') {
			item = lists.at(-1);
		} else if (tag === 'a') {
			const href = decodeEntities(token.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(Boolean) ?? '');
			stack.push({ tag, url: /^(https?:|mailto:|tel:)/i.test(href) ? href : undefined, children: [] });
		} else if (tag in inlineTypes) {
			stack.push({ tag, children: [] });
		}
	}

	endLine();
	return lines;
}

/** lines of the description as blocks: consecutive lines form a paragraph, list items form a list */
function descriptionBlocks(description: string): InputRichBlock[] {
	const blocks: InputRichBlock[] = [];
	let paragraph: RichText[] = [];
	let listId: number | undefined;

	const endParagraph = () => {
		if (paragraph.length) blocks.push({ type: 'paragraph', text: joinLines(paragraph) });
		paragraph = [];
	};

	for (const { content, list } of descriptionLines(description)) {
		if (!list) {
			listId = undefined;
			paragraph.push(content);
			continue;
		}

		endParagraph();
		const last = blocks.at(-1);
		let listBlock = listId === list.id && last?.type === 'list' ? last : undefined;
		if (!listBlock) {
			listBlock = { type: 'list', items: [] };
			blocks.push(listBlock);
			listId = list.id;
		}

		listBlock.items.push({
			blocks: [{ type: 'paragraph', text: content }],
			...(list.ordered && { type: '1' as const, value: listBlock.items.length + 1 })
		});
	}

	endParagraph();
	return blocks;
}

/** lines below each other inside one paragraph */
function joinLines(lines: RichText[]): RichText[] {
	return lines.flatMap((line, i) => (i ? ['\n', line] : [line]));
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

/** one entry per line, the lines of a job with details follow directly */
function jobLines(planEvent: PlanEvent | undefined, plan: Plan | undefined): RichText[] {
	const lines: RichText[] = [];

	for (const { key, title } of planEvent?.jobs ?? []) {
		const { persons = [], details } = plan?.[key] ?? {};
		if (!details) {
			lines.push([`${title}: `, ...people(persons)]);
		} else {
			const [firstLine, ...rest] = details.split('\n');
			lines.push([`${title}: ${firstLine} with `, ...people(persons)]);
			lines.push(...rest.filter(Boolean));
		}
	}

	return lines;
}

/** small blank line between the heading, the events and the footer (a footer block is smaller than a paragraph) */
const spacer: InputRichBlock = { type: 'footer', text: '\u2800' };

function eventBlocks(event: CalendarEvent, plans: Plans): InputRichBlock[] {
	// paragraphs: time and location / title and duration / jobs / description
	const firstLine: RichText[] = [];

	if (event.start?.dateTime) {
		const start = DateTime.fromISO(event.start.dateTime);
		firstLine.push({
			type: 'date_time',
			text: start
				.setZone(event.start.timeZone!)
				.setLocale('en')
				.toLocaleString({ hour12: false, hour: '2-digit', minute: '2-digit' }),
			unix_time: start.toUnixInteger(),
			date_time_format: 't'
		});
	}
	if (event.location) {
		if (firstLine.length) firstLine.push(' ');
		firstLine.push({ type: 'italic', text: `\uFE6B${parseLocation(event.location)}` });
	}

	const secondLine: RichText[] = [event.summary ?? ''];
	const duration = formatDuration(event);
	if (duration) secondLine.push(` ${duration}`);

	const entry = plans.get(event.id!);

	// a paragraph per group with line breaks inside: a paragraph per line would get the wide block spacing
	const blocks: InputRichBlock[] = [
		firstLine.length ? [firstLine] : [],
		[secondLine],
		jobLines(entry?.planEvent, entry?.plan)
	]
		.filter((lines) => lines.length)
		.map((lines): InputRichBlock => ({ type: 'paragraph', text: joinLines(lines) }));
	blocks.push(...descriptionBlocks(event.description ?? ''));

	const sos = sosButtons(event, plans);
	return [
		// only events with a description have something to fold away
		{ type: event.description?.trim() ? 'expandable_blockquote' : 'blockquote', blocks },
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
		...events.flatMap((event) => [spacer, ...eventBlocks(event, plans)])
	];

	blocks.push(spacer, {
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
