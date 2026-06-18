import {
	BOT_GROUP_CHAT_ID,
	COMMUNITY_CALENDAR_ID,
	EVENTS_CALENDAR_ID,
	VERCEL_BRANCH_URL
} from '$env/static/private';
import { type Bot } from 'grammy';
import { Calendar, type CalendarEvent } from '$lib/server/calendar';
import { DateTime } from 'luxon';
import { type EventPropsJobs } from '$lib/server/week-plan-api';
import { formatTelegramUsers } from '$lib/server/bot/weekPlan';
import topics from '$lib/utils/topics';

const timeZone = 'Europe/Lisbon';

const eventsCalendar = new Calendar(EVENTS_CALENDAR_ID);
const communityCalendar = new Calendar(COMMUNITY_CALENDAR_ID);

export class AgendaBot {
	constructor(private readonly bot: Bot) {
		// TODO depracated - remove in next version
		bot.callbackQuery(/^agenda:(?<date>\d{4}-\d{2}-\d{2}):(?<messageId>\d+)$/, async (ctx) => {
			if (typeof ctx.match === 'object' && 'groups' in ctx.match) {
				const date = DateTime.fromISO(ctx.match.groups!.date).setZone(timeZone);
				const messageId = parseInt(ctx.match.groups!.messageId);

				try {
					await this.updateAgenda(date, messageId);
					await this.bot.api.answerCallbackQuery(ctx.callbackQuery.id);
				} catch (err) {
					console.error(err);
				}

				await ctx.answerCallbackQuery();
			}
		});
	}

	public async sendAgenda() {
		const tomorrow = DateTime.now().setZone(timeZone).plus({ day: 1 });
		const tomorrowEvents = await this.getEventsByDate(tomorrow);

		if (tomorrowEvents.length) {
			const message = await this.bot.api.sendMessage(
				BOT_GROUP_CHAT_ID,
				formatAgenda(tomorrow.toJSDate(), tomorrowEvents),
				{
					parse_mode: 'HTML',
					message_thread_id: topics.dailyInfo,
					link_preview_options: {
						is_disabled: true
					}
				}
			);

			await this.watchCalendar(tomorrow, message.message_id);
		} else {
			console.info('No agenda for today');
		}
	}

	public async updateAgenda(date: DateTime, messageId: number) {
		console.info(`Update agenda for date=${date.toISODate()} messageId=${messageId}`);

		const events = await this.getEventsByDate(date);
		const text = formatAgenda(date.toJSDate(), events);

		try {
			await this.bot.api.editMessageText(BOT_GROUP_CHAT_ID, messageId, text, {
				parse_mode: 'HTML',
				link_preview_options: {
					is_disabled: true
				}
			});
		} catch (err) {
			console.error(err);
		}
	}

	private async getEventsByDate(date: DateTime) {
		const startOfDay = date.startOf('day').toJSDate();
		const endOfDay = date.endOf('day').toJSDate();

		const events = await eventsCalendar.getEvents([], startOfDay, endOfDay);
		const communityEvents = await communityCalendar.getEvents([], startOfDay, endOfDay);

		return communityEvents.concat(events).sort(byStartDate);
	}

	private async watchCalendar(date: DateTime, messageId: number) {
		const startOfDay = date.startOf('day').toJSDate();
		const endOfDay = date.endOf('day').toJSDate();

		await Promise.all(
			[communityCalendar, eventsCalendar].map((calendar) =>
				calendar.watchEvents(startOfDay, endOfDay, {
					id: crypto.randomUUID(),
					token: JSON.stringify({ date, messageId }),
					type: 'webhook',
					address: `https://${VERCEL_BRANCH_URL}/api/telegram/agenda`,
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

function formatJobs(eventProps?: Record<string, string>) {
	console.log(eventProps);
	if (eventProps && eventProps.jobs) {
		const assignedJobs: EventPropsJobs = JSON.parse(eventProps.jobs);
		const block = [];

		for (const { title, persons, details } of Object.values(assignedJobs)) {
			console.log(title, details);
			if (!details) {
				block.push(`${title}: ${formatTelegramUsers(persons)}`);
			} else {
				const [firstLine, rest] = details.split('\n', 2);

				if (!rest) {
					block.push(`${title}: ${firstLine} with ${formatTelegramUsers(persons)}`);
				} else {
					block.push(`${title}: ${firstLine} with ${formatTelegramUsers(persons)}`);
					block.push(rest);
				}
			}
		}

		return block.join('\n');
	}

	return '';
}

function formatEvent(event: CalendarEvent): string {
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
		formatJobs(event.extendedProperties?.private),
		transformDescription(event.description ?? '')
	].filter(Boolean);

	return `<blockquote expandable>${lines.join('\n')}</blockquote>`;
}

function byStartDate(a: CalendarEvent, b: CalendarEvent) {
	return (
		Date.parse(a.start?.dateTime ?? '2222-12-22') - Date.parse(b.start?.dateTime ?? '2222-12-22')
	);
}

function formatAgenda(date: Date, events: CalendarEvent[]) {
	return `🗓️ <b>Agenda for ${date.toLocaleDateString('en', { weekday: 'long' })}</b>

${events.map(formatEvent).join('\n\n')}`;
}
