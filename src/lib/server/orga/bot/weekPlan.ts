import { GrammyError, type Bot } from 'grammy';
import type {
	InputRichBlock,
	InputRichMessage,
	RichText,
	RichMessageButton
} from 'grammy/types';
import { DateTime } from 'luxon';
import type { CalendarEvent } from '$lib/server/calendar';
import {
	calendarByName,
	dateKey,
	findPlanEvent,
	getWeekEvents,
	timeZone,
	type PlanEvent
} from '../week-plan-api';
import * as store from '../plan-store';
import type { Plan } from '../plan-store';
import users, { type TelegramUser } from '../users';
import { isChatAdmin, parseChosen, personResult, slotPattern } from './planMode';
import { BOT_HOME_GROUP_CHAT_ID, VERCEL_BRANCH_URL } from '$env/static/private';
import topics from '../utils/topics';

type PlannedEvent = PlanEvent & { plan: Plan };

const withPlans = (events: PlanEvent[]): Promise<PlannedEvent[]> =>
	Promise.all(events.map(async (e) => ({ ...e, plan: await store.getPlan(e.type, e.date) })));

const mondayOf = (d: DateTime) => d.setZone(timeZone).set({ weekday: 1 }).startOf('day');
/** Plan mode is for the current and coming weeks, not for the past */
const isPlannableWeek = (weekStart: DateTime) => weekStart >= mondayOf(DateTime.now());
const parseDate = (key: string) => DateTime.fromFormat(key, 'yyyyLLdd', { zone: timeZone });

export class WeekPlanBot {
	/** `onChange` lets the daily agenda post follow sign-ups (the calendar no longer changes with them) */
	constructor(
		private readonly bot: Bot,
		private readonly onChange: (date: DateTime) => Promise<void> = async () => {}
	) {
		this.setupCallbackHandler();
		this.setupStartHandler();
		this.setupPlanModeHandlers();
	}

	public async sendWeekPlan(nextWeek = true) {
		const weekStart = mondayOf(DateTime.now().plus({ weeks: nextWeek ? 1 : 0 }));

		console.info('Sending week plan starting from', weekStart);

		const events = await withPlans(await getWeekEvents(weekStart));
		if (!events.length) return console.info('No events with jobs in that week');

		const message = await this.bot.api.sendRichMessage(
			BOT_HOME_GROUP_CHAT_ID,
			this.buildWeekMessage(weekStart, events),
			{ message_thread_id: topics.weeklyJobs }
		);

		await store.setMessageId('week', dateKey(weekStart), message.message_id);
		await this.watchCalendar(weekStart).catch((error) => console.error('Could not watch the calendars', error));
	}

	/** The calendar changes the week plan shows (titles, times, jobs) update the message through a webhook. */
	private watchCalendar(weekStart: DateTime) {
		const end = weekStart.plus({ days: 6 }).endOf('day');
		return Promise.all(
			Object.values(calendarByName).map((calendar) =>
				calendar.watchEvents(weekStart.toJSDate(), end.toJSDate(), {
					id: crypto.randomUUID(),
					token: JSON.stringify({ weekStart: weekStart.toISODate() }),
					type: 'webhook',
					address: `https://${VERCEL_BRANCH_URL}/orga/api/telegram/week-plan`,
					expiration: end.toMillis().toString()
				})
			)
		);
	}

	public async updateWeekPlan(weekStart: DateTime) {
		const messageId = await store.getMessageId('week', dateKey(weekStart));
		if (!messageId) return;

		const events = await withPlans(await getWeekEvents(weekStart));
		try {
			await this.bot.api.editMessageText(
				BOT_HOME_GROUP_CHAT_ID,
				messageId,
				this.buildWeekMessage(weekStart, events)
			);
		} catch (error) {
			// two updates within the same second render the same text (the footer has the time); Telegram answers 400
			if (!(error instanceof GrammyError) || !/message is not modified/i.test(error.description)) throw error;
		}
	}

	/** after a sign-up change: refresh the week plan and the agenda of that day */
	private async changed(date: string) {
		const day = parseDate(date);
		await this.updateWeekPlan(mondayOf(day));
		await this.onChange(day);
	}

	private buildWeekMessage(
		weekStart: DateTime,
		events: PlannedEvent[],
		planMode = false
	): InputRichMessage {
		const blocks: InputRichBlock[] = [
			{
				type: 'heading',
				size: 1,
				text: `Week of ${weekStart.toLocaleString({ day: 'numeric' })}–${weekStart
					.plus({ days: 6 })
					.setLocale('en-DE')
					.toLocaleString({ day: 'numeric', month: 'numeric' })}`
			},
			{
				type: 'paragraph',
				text: planMode
					? '🛠 Plan mode: assign people with “Assign person” or remove them with ✖.'
					: '✍️ Please sign up for the upcoming week by tapping “I will do it” before Monday morning meeting.'
			}
		];
		const allWeekEvents: PlannedEvent[] = [];
		const eventsByWeekday = new Map<number, PlannedEvent[]>();

		for (const item of [...events].sort(
			(a, b) => getEventDate(a.event).toMillis() - getEventDate(b.event).toMillis()
		)) {
			if (isMultiDay(item.event)) {
				allWeekEvents.push(item);
				continue;
			}

			const weekday = getEventDate(item.event).weekday - 1;
			eventsByWeekday.set(weekday, [...(eventsByWeekday.get(weekday) ?? []), item]);
		}

		if (allWeekEvents.length > 0) {
			blocks.push({ type: 'heading', size: 2, text: 'All week' });
			blocks.push(...this.buildEventBlocks(allWeekEvents, planMode));
		}

		for (let weekday = 0; weekday < 7; weekday++) {
			// Saturday and Sunday only show up when something is planned
			if (weekday >= 5 && !eventsByWeekday.has(weekday)) continue;
			const date = weekStart.plus({ days: weekday });
			blocks.push({
				type: 'heading',
				size: 2,
				text: date
					.setLocale('en-DE')
					.toLocaleString({ weekday: 'long', day: 'numeric', month: 'numeric' })
			});
			blocks.push(...this.buildEventBlocks(eventsByWeekday.get(weekday) ?? [], planMode));
		}

		blocks.push({
			type: 'paragraph',
			text: ''
		});

		if (!planMode) {
			blocks.push({
				type: 'buttons',
				align: 'left',
				buttons: [
					{
						text: 'My Week',
						callback_data: `my_week:${dateKey(weekStart)}`
					}
				]
			});
		}

		blocks.push({
			type: 'footer',
			text: {
				type: 'subscript',
				text:
					'Updated at ' +
					DateTime.now().setZone(timeZone).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)
			}
		});

		return { blocks };
	}

	private buildEventBlocks(events: PlannedEvent[], planMode = false): InputRichBlock[] {
		const blocks: InputRichBlock[] = [];

		for (const { event, type, date, jobs, plan } of events) {
			blocks.push({
				type: 'heading',
				size: 5,
				text: event.summary ?? ''
			});

			for (const job of jobs) {
				const persons = plan[job.key]?.persons ?? [];
				const people = persons.flatMap((person, index): RichText[] => {
					const name: RichText = person.id
						? {
								type: 'url',
								text: person.first_name,
								url: `tg://user?id=${person.id}`
							}
						: person.first_name;
					const parts: RichText[] = planMode
						? [
								name,
								' ',
								{
									type: 'button',
									button: {
										text: '✖',
										callback_data: `rm:${type}:${date}:${job.key}:${person.id}`,
										style: 'danger'
									}
								}
							]
						: [name];
					return index === 0 ? parts : [' & ', ...parts];
				});
				const text: RichText[] = [job.title, ': '];

				if (people.length > 0) {
					text.push(...people);
				}

				if (persons.length < job.slots) {
					const button: RichMessageButton = planMode
						? {
								text: 'Assign person',
								switch_inline_query_current_chat: `${type}:${date}:${job.key} `
							}
						: job.askDetails
						? {
								text: 'I will do it',
								url: `https://t.me/EssenciaOrgaBot?start=plan_${type}_${date}_${job.key}`
							}
						: {
								text: 'I will do it',
								callback_data: `plan:${type}:${date}:${job.key}`
							};

					if (text.length > 2) {
						text.push(' & ');
					}

					text.push({
						type: 'button',
						button: {
							...button,
							style: 'primary'
						}
					});
				}

				blocks.push({
					type: 'paragraph',
					text
				});
			}
		}

		blocks.push({
			type: 'paragraph',
			text: ''
		});

		return blocks;
	}

	private async sendUserWeekSummary(
		weekStart: DateTime,
		user: TelegramUser,
		callbackQueryId?: string,
		replaceCallbackQueryMessage = false
	) {
		if (!user.id) return;

		const events = await withPlans(await getWeekEvents(weekStart));
		const blocks: InputRichBlock[] = [
			{ type: 'heading', size: 1, text: `Your week, ${user.first_name}` }
		];
		let hasAssignments = false;

		for (const { event, type, date, jobs, plan } of events) {
			const eventLabel =
				isMultiDay(event)
					? 'All week'
					: getEventDate(event).toLocaleString({ weekday: 'long', day: 'numeric', month: 'numeric' });
			let eventHeadingAdded = false;

			for (const job of jobs) {
				if (!plan[job.key]?.persons.some((person) => person.id === user.id)) continue;
				hasAssignments = true;

				if (!eventHeadingAdded) {
					blocks.push({ type: 'heading', size: 5, text: eventLabel });
					eventHeadingAdded = true;
				}

				blocks.push({
					type: 'paragraph',
					text: [
						{ type: 'bold', text: job.title },
						': ',
						{
							type: 'button',
							button: {
								style: 'danger',
								text: 'Handover',
								callback_data: `unassign:${type}:${date}:${job.key}`
							}
						}
					]
				});
			}
		}

		if (!hasAssignments) {
			blocks.push({
				type: 'paragraph' as const,
				text: { type: 'italic' as const, text: 'You have no sign-ups for this week.' }
			});
			blocks.push({
				type: 'paragraph' as const,
				text: ''
			});
		}

		const buttons: RichMessageButton[] = [
			{
				text: 'Back to the week',
				callback_data: 'back_to_week'
			}
		];
		if (isPlannableWeek(weekStart) && (await isChatAdmin(this.bot, user.id))) {
			buttons.push({
				text: 'Plan-Mode',
				url: `https://t.me/EssenciaOrgaBot?start=planmode_${dateKey(weekStart)}`
			});
		}
		blocks.push({ type: 'buttons', align: 'left', buttons });

		// Bot API 10.4: a reply to a callback query needs no receiver_user_id; passing it with
		// message_thread_id ended in REPLY_TO_INVALID.
		const send = (extra: object, asReply = false) =>
			this.bot.api.sendRichMessage(
				BOT_HOME_GROUP_CHAT_ID,
				{ blocks },
				asReply
					? { ephemeral_message_parameters: extra }
					: {
							message_thread_id: topics.weeklyJobs,
							ephemeral_message_parameters: { receiver_user_id: user.id, ...extra }
						}
			);

		if (replaceCallbackQueryMessage && callbackQueryId) {
			try {
				await send({ callback_query_id: callbackQueryId, replace_callback_query_message: true }, true);
				return;
			} catch (error) {
				if (!(error instanceof GrammyError) || error.error_code !== 400) throw error;
				console.warn('Replacing week plan failed, sending plain ephemeral', error.description);
			}
			// Fallback without callback_query_id: the query may already be consumed
			await send({});
			return;
		}

		await send(callbackQueryId ? { callback_query_id: callbackQueryId } : {});
	}

	/** Week plan with “Assign person” and ✖ buttons for admins, in the private chat with the bot */
	private async sendPlanMode(chatId: number, weekStart: DateTime) {
		const events = await withPlans(await getWeekEvents(weekStart));
		const message = await this.bot.api.sendRichMessage(
			chatId,
			this.buildWeekMessage(weekStart, events, true)
		);
		await store.setPlanModeMessage(chatId, message.message_id, dateKey(weekStart));
	}

	private async refreshPlanMode(chatId: number) {
		const shown = await store.getPlanModeMessage(chatId);
		if (!shown) return;

		const weekStart = parseDate(shown.date);
		const events = await withPlans(await getWeekEvents(weekStart));
		await this.bot.api
			.editMessageText(chatId, shown.id, this.buildWeekMessage(weekStart, events, true))
			.catch((error) => {
				if (!(error instanceof GrammyError) || !/message is not modified/i.test(error.description))
					throw error;
			});
	}

	private setupPlanModeHandlers() {
		// the people offered for an “Assign person” button; the query is `type:date:job [search]`
		this.bot.on('inline_query', async (ctx) => {
			const answer = (results: ReturnType<typeof personResult>[], next_offset = '') =>
				ctx.answerInlineQuery(results, { cache_time: 0, is_personal: true, next_offset });
			const match = ctx.inlineQuery.query.match(new RegExp(`^${slotPattern}(?:\\s+(?<search>.*))?$`, 's'));

			if (!match || !(await isChatAdmin(this.bot, ctx.from.id))) return answer([]);

			const { type, date, jobKey, search = '' } = match.groups!;
			const taken = new Set((await store.getPlan(type, date))[jobKey]?.persons.map((p) => p.id));
			const needle = search.trim().toLowerCase();
			const candidates = (await users.getAll())
				.filter(
					(user) =>
						user.id &&
						!taken.has(user.id) &&
						[user.first_name, user.last_name, user.username].join(' ').toLowerCase().includes(needle)
				)
				.sort((a, b) => a.first_name.localeCompare(b.first_name));

			const offset = Number(ctx.inlineQuery.offset) || 0;
			const page = candidates.slice(offset, offset + 50); // Telegram allows 50 results per answer
			return answer(
				page.map((user) => personResult(user, { type, date, jobKey })),
				offset + 50 < candidates.length ? String(offset + 50) : ''
			);
		});

		// a chosen person arrives as a message of the bot (via_bot) in the admin's private chat
		this.bot.on('message:text', async (ctx, next) => {
			const chosen = parseChosen(ctx.message);
			if (!chosen || ctx.message.via_bot?.id !== ctx.me.id) return next();

			await ctx.deleteMessage().catch(() => {});
			if (ctx.chat.type !== 'private' || !(await isChatAdmin(this.bot, ctx.from.id))) return;

			const { type, date, jobKey } = chosen.target;
			const job = (await findPlanEvent(type, date))?.jobs.find((item) => item.key === jobKey);
			if (!job) return ctx.reply('This job does not exist anymore.');

			const result = await store.assign(type, date, jobKey, job.slots, {
				id: chosen.userId,
				first_name: chosen.firstName
			});
			await this.changed(date);
			await this.refreshPlanMode(ctx.chat.id);

			if (result === 'full') return ctx.reply(`“${job.title}” is already full.`);
		});

		this.bot.callbackQuery(/^rm:(?<type>[a-z0-9-]+):(?<date>\d{8}):(?<jobKey>[a-z0-9]+):(?<userId>\d+)$/, async (ctx) => {
			if (!(await isChatAdmin(this.bot, ctx.from.id))) {
				return ctx.answerCallbackQuery({ text: 'Only chat admins can do this.', show_alert: true });
			}

			const { type, date, jobKey, userId } = (ctx.match as RegExpMatchArray).groups!;
			await store.unassign(type, date, jobKey, { id: Number(userId), first_name: '' });
			await this.changed(date);
			await this.refreshPlanMode(ctx.from.id);
			return ctx.answerCallbackQuery({ text: 'Removed.' });
		});
	}

	private setupCallbackHandler() {
		this.bot.callbackQuery(/^my_week(?::(?<date>\d{8}))?$/, async (ctx) => {
			const user = ctx.from;
			const date = (ctx.match as RegExpMatchArray).groups?.date;
			const weekStart = date ? parseDate(date) : mondayOf(DateTime.now());

			await this.sendUserWeekSummary(weekStart, user, ctx.callbackQuery.id, true);
			return ctx.answerCallbackQuery().catch(() => {});
		});

		this.bot.callbackQuery('back_to_week', async (ctx) => {
			await ctx.deleteEphemeralMessage();
			return ctx.answerCallbackQuery();
		});

		this.bot.callbackQuery(
			/^(?<action>plan|unassign):(?<type>[a-z0-9-]+):(?<date>\d{8}):(?<jobKey>[a-z0-9]+)$/,
			async (ctx) => {
				const { action, type, date, jobKey } = (ctx.match as RegExpMatchArray).groups!;
				const user = ctx.from;
				console.info('Received week-plan callbackQuery', { action, type, date, jobKey, user });

				const planEvent = await findPlanEvent(type, date);
				const job = planEvent?.jobs.find((item) => item.key === jobKey);
				if (!job) {
					return ctx.answerCallbackQuery({
						show_alert: true,
						text: 'This job does not exist anymore.'
					});
				}

				if (action === 'unassign') {
					await store.unassign(type, date, jobKey, user);
					await this.changed(date);
					return ctx.answerCallbackQuery({ text: 'You removed yourself from this job.' });
				}

				const result = await store.assign(type, date, jobKey, job.slots, user);
				await this.changed(date);

				if (result === 'already') {
					return ctx.answerCallbackQuery({ text: 'You have already signed up for this job.' });
				}

				if (result === 'full') {
					const { persons } = (await store.getPlan(type, date))[jobKey] ?? { persons: [] };
					return ctx.answerCallbackQuery({
						show_alert: true,
						text: `This job is already taken by ${persons.map((person) => person.first_name).join(', ')}.`
					});
				}

				return ctx.answerCallbackQuery({ text: "✅ you've signed up" });
			}
		);
	}

	private setupStartHandler() {
		const askDetailsReply = <R>(
			type: string,
			tag: (strings: TemplateStringsArray, ...values: unknown[]) => R = noopTag as unknown as (
				strings: TemplateStringsArray,
				...values: unknown[]
			) => R
		) =>
			tag`Please let us know more about what ${type} you want to offer. First line a short title and following lines optional details (e.g. are Kids welcome?).`;

		this.bot.command('start', async (ctx) => {
			const planMode = ctx.match.match(/^planmode_(\d{8})$/);

			if (planMode) {
				if (!isPlannableWeek(parseDate(planMode[1]))) {
					return ctx.reply('Plan mode is not available for past weeks.');
				}

				if (!(await isChatAdmin(this.bot, ctx.from!.id))) {
					return ctx.reply('Plan mode is only available for chat admins.');
				}

				return this.sendPlanMode(ctx.chat.id, parseDate(planMode[1]));
			}

			const match = ctx.match.match(
				/^plan_(?<type>[a-z0-9-]+)_(?<date>\d{8})_(?<jobKey>[a-z0-9]+)$/
			);

			if (match !== null && 'groups' in match) {
				const { type, date, jobKey } = match.groups!;
				const user = ctx.from!;

				console.info('Received week-plan start command', { type, date, jobKey, user });

				const planEvent = await findPlanEvent(type, date);
				const job = planEvent?.jobs.find((item) => item.key === jobKey);
				if (!job) return ctx.reply('This job does not exist anymore.');

				const result = await store.assign(type, date, jobKey, job.slots, user);
				await this.changed(date);

				if (result === 'full') {
					const [assignedPerson] = (await store.getPlan(type, date))[jobKey]?.persons ?? [];
					return ctx.reply(
						`This job is already taken by ${assignedPerson?.first_name}. If you want to takeover please ask them to remove themself by tapping the button again.`
					);
				}

				await this.sendUserWeekSummary(mondayOf(parseDate(date)), user);

				await ctx.reply(`${askDetailsReply(job.title)}\n\n#${type}_${date}_${jobKey}`, {
					reply_markup: { force_reply: true }
				});
			}
		});

		this.bot.on('message:text', async (ctx, next) => {
			const isAskDetails = askDetailsReply('.+', safeRegex);

			if (
				!ctx.message.reply_to_message?.text ||
				!isAskDetails.test(ctx.message.reply_to_message.text)
			) {
				return next();
			}

			const [, type, date, jobKey] =
				ctx.message.reply_to_message.text.match(/#([a-z0-9-]+)_(\d{8})_([a-z0-9]+)/) ?? [];
			if (!type || !date || !jobKey) return next();

			console.info('Save practise', { type, date, jobKey, details: ctx.message.text });

			await store.setDetails(type, date, jobKey, ctx.message.text);
			await this.changed(date);

			await ctx.react('👍');
		});
	}
}

/** All-day events over several days ("Fairy of the Week") belong to the whole week; a single all-day event to its day. */
function isMultiDay(event: CalendarEvent) {
	if (!event.start?.date || !event.end?.date) return false;
	return DateTime.fromISO(event.end.date).diff(DateTime.fromISO(event.start.date), 'days').days > 1;
}

function getEventDate(event: CalendarEvent) {
	const date = event.start?.dateTime ?? event.start?.date;
	if (!date) throw new Error(`Weekly-plan event "${event.summary}" has no start date.`);
	return DateTime.fromISO(date, { zone: event.start?.timeZone ?? timeZone }).setZone(timeZone);
}

export function formatTelegramUsers(users: TelegramUser[]) {
	if (users.length === 0) return '❓️';
	if (users.length === 1) return formatTelegramUser(users[0]);
	if (users.length === 2) return users.map(formatTelegramUser).join(' & ');

	return (
		users.slice(0, -1).map(formatTelegramUser).join(', ') +
		' & ' +
		formatTelegramUser(users[users.length - 1])
	);
}

function formatTelegramUser(user: TelegramUser) {
	if (user.id) {
		return `<a href="tg://user?id=${user.id}">${user.first_name}</a>`;
	}

	return user.first_name;
}

function noopTag(strings: TemplateStringsArray, ...values: unknown[]) {
	return String.raw(strings, ...values);
}

if (!('escape' in RegExp)) {
	// @ts-expect-error polyfills static method from NodeJS 26
	RegExp.escape = function (str: unknown) {
		return String(str).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
	};
}

function safeRegex(strings: TemplateStringsArray, ...values: unknown[]) {
	let pattern = '';

	for (let i = 0; i < strings.length; i++) {
		pattern += RegExp.escape(strings[i]);

		if (i < values.length) {
			pattern += values[i];
		}
	}

	return new RegExp(pattern, 'su');
}
