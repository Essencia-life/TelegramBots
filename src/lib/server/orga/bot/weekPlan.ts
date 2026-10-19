import { type Bot } from 'grammy';
import type {
	InputRichBlock,
	InputRichMessage,
	RichText,
	RichMessageButton
} from 'grammy/types';
import { type CalendarEvent } from '$lib/server/calendar';
import { DateTime } from 'luxon';
import weekPlanApi, {
	type EventProps,
	type EventPropsJobs,
	type WeeklyJobsConfigs
} from '../week-plan-api';
import weeklyJobs from '$lib/client/orga/config/weekly-jobs.json';
import type { TelegramUser } from '../users';
import { BOT_HOME_GROUP_CHAT_ID } from '$env/static/private';
import topics from '../utils/topics';

const timeZone = 'Europe/Lisbon';
const configs = weeklyJobs.config as WeeklyJobsConfigs;

export class WeekPlanBot {
	constructor(private readonly bot: Bot) {
		this.setupCallbackHandler();
		this.setupStartHandler();
	}

	public async sendWeekPlan(nextWeek = true, createEvents = true) {
		const weekStart = DateTime.now()
			.setZone(timeZone)
			.plus({ weeks: nextWeek ? 1 : 0 })
			.set({ weekday: 1 });

		console.info('Sending week plan starting from', weekStart);

		const allEvents = await (createEvents
			? weekPlanApi.createEvents(weekStart)
			: weekPlanApi.getWeekEvents(weekStart));
		const message = await this.bot.api.sendRichMessage(
			BOT_HOME_GROUP_CHAT_ID,
			this.buildWeekMessage(weekStart, allEvents),
			{ message_thread_id: topics.weeklyJobs }
		);

		for (const event of allEvents) {
			if (!event.id || !event.extendedProperties?.private?.type) {
				throw new Error('Cannot attach the weekly plan message to an event without an id or type.');
			}

			await weekPlanApi.setPlanMessageId(
				event.extendedProperties.private.type,
				event.id,
				message.message_id
			);
		}
	}

	private async updateWeekPlan(messageId: number) {
		const events = await weekPlanApi.getEventsByPlanMessageId(messageId);
		if (events.length === 0) return;

		const weekStart = getEventDate(events[0]).set({ weekday: 1 }).startOf('day');
		await this.bot.api.editMessageText(
			BOT_HOME_GROUP_CHAT_ID,
			messageId,
			this.buildWeekMessage(weekStart, events)
		);
	}

	private buildWeekMessage(weekStart: DateTime, events: CalendarEvent[]): InputRichMessage {
		const blocks: InputRichBlock[] = [
			{
				type: 'heading',
				size: 1,
				text: `Week of ${weekStart.toLocaleString({ day: 'numeric' })}–${weekStart
					.plus({ days: 4 })
					.setLocale('en-DE')
					.toLocaleString({ day: 'numeric', month: 'numeric' })}`
			},
			{
				type: 'paragraph',
				text: '✍️ Please sign up for the upcoming week by tapping “I will do it” before Monday morning meeting.'
			}
		];
		const allWeekEvents: CalendarEvent[] = [];
		const eventsByWeekday = new Map<number, CalendarEvent[]>();

		for (const event of [...events].sort(
			(a, b) => getEventDate(a).toMillis() - getEventDate(b).toMillis()
		)) {
			if (event.start?.date && !event.start.dateTime) {
				allWeekEvents.push(event);
				continue;
			}

			const weekday = getEventDate(event).weekday - 1;
			const dayEvents = eventsByWeekday.get(weekday) ?? [];
			dayEvents.push(event);
			eventsByWeekday.set(weekday, dayEvents);
		}

		if (allWeekEvents.length > 0) {
			blocks.push({ type: 'heading', size: 2, text: 'All week' });
			blocks.push(...this.buildEventBlocks(allWeekEvents));
		}

		for (let weekday = 0; weekday < 5; weekday++) {
			const date = weekStart.plus({ days: weekday });
			blocks.push({
				type: 'heading',
				size: 2,
				text: date
					.setLocale('en-DE')
					.toLocaleString({ weekday: 'long', day: 'numeric', month: 'numeric' })
			});
			blocks.push(...this.buildEventBlocks(eventsByWeekday.get(weekday) ?? []));
		}

		blocks.push({
			type: 'paragraph',
			text: ''
		});

		blocks.push({
			type: 'buttons',
			align: 'left',
			buttons: [
				{
					text: 'My Week',
					callback_data: 'my_week'
				}
			]
		});

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

	private buildEventBlocks(events: CalendarEvent[]): InputRichBlock[] {
		const blocks: InputRichBlock[] = [];

		for (const event of events) {
			const props = event.extendedProperties?.private as unknown as EventProps | undefined;
			const config = configs.find((item) => item.name === props?.type);
			if (!props || !config) continue;

			if (!event.id) {
				throw new Error(`Cannot render weekly plan event "${event.summary}" without an id.`);
			}

			const assignedJobs: EventPropsJobs = JSON.parse(props.jobs);
			blocks.push({
				type: 'heading',
				size: 5,
				text: event.summary ?? ''
			});

			for (const job of config.jobs) {
				const assignedJob = assignedJobs[job.name] ?? { title: job.title, persons: [] };
				const people = assignedJob.persons.flatMap((person, index): RichText[] => {
					const name: RichText = person.id
						? {
								type: 'url',
								text: person.first_name,
								url: `tg://user?id=${person.id}`
							}
						: person.first_name;
					return index === 0 ? [name] : [' & ', name];
				});
				const text: RichText[] = [job.title, ': '];

				if (people.length > 0) {
					text.push(...people);
				}

				if (assignedJob.persons.length < job.persons) {
					const button: RichMessageButton =
						'askDetails' in job && job.askDetails
							? {
									text: 'I will do it',
									url: `https://t.me/EssenciaOrgaBot?start=plan_${event.id}_${job.name}`
								}
							: {
									text: 'I will do it',
									callback_data: `plan:${event.id}:${job.name}`
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
		messageId: number,
		user: TelegramUser,
		callbackQueryId?: string,
		replaceCallbackQueryMessage = false
	) {
		if (!user.id) return;

		const events = await weekPlanApi.getEventsByPlanMessageId(messageId);
		const blocks: InputRichBlock[] = [
			{ type: 'heading', size: 1, text: `Your week, ${user.first_name}` }
		];
		let hasAssignments = false;

		for (const event of events) {
			const props = event.extendedProperties?.private as unknown as EventProps | undefined;
			const config = configs.find((item) => item.name === props?.type);
			if (!props || !config || !event.id) continue;

			const assignedJobs: EventPropsJobs = JSON.parse(props.jobs);
			const eventLabel =
				event.start?.date && !event.start.dateTime
					? 'All week'
					: getEventDate(event).toLocaleString({ weekday: 'long', day: 'numeric', month: 'numeric' });
			let eventHeadingAdded = false;

			for (const job of config.jobs) {
				const assignedJob = assignedJobs[job.name];
				if (!assignedJob?.persons.some((person) => person.id === user.id)) continue;
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
								callback_data: `unassign:${event.id}:${job.name}`
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

		blocks.push({
			type: 'buttons',
			align: 'left',
			buttons: [
				{
					text: 'Back to the week',
					callback_data: `back_to_week:${messageId}`
				}
			]
		});

		if (replaceCallbackQueryMessage && callbackQueryId) {
			await this.bot.api.sendRichMessage(
				BOT_HOME_GROUP_CHAT_ID,
				{ blocks },
				{
					message_thread_id: topics.weeklyJobs,
					ephemeral_message_parameters: {
						receiver_user_id: user.id,
						callback_query_id: callbackQueryId,
						replace_callback_query_message: true
					}
				}
			);
			return;
		}

		await this.bot.api.sendRichMessage(
			BOT_HOME_GROUP_CHAT_ID,
			{ blocks },
			{
				message_thread_id: topics.weeklyJobs,
				ephemeral_message_parameters: {
					receiver_user_id: user.id,
					...(callbackQueryId && { callback_query_id: callbackQueryId })
				}
			}
		);
	}

	private setupCallbackHandler() {
		this.bot.callbackQuery(/^my_week$/, async (ctx) => {
			const user = ctx.from;
			const messageId = Number(ctx.callbackQuery.message?.message_id);

			if (!user || !Number.isInteger(messageId)) {
				return ctx.answerCallbackQuery({ text: 'Could not open your week.' });
			}

			await this.sendUserWeekSummary(messageId, user, ctx.callbackQuery.id, true);
			return ctx.answerCallbackQuery();
		});

		this.bot.callbackQuery(/^back_to_week:(?<messageId>\d+)$/, async (ctx) => {
			if (typeof ctx.match !== 'object' || !('groups' in ctx.match)) return;

			const { messageId } = ctx.match.groups!;
			await this.updateWeekPlan(Number(messageId));
			return ctx.answerCallbackQuery();
		});

		this.bot.callbackQuery(
			/^(?<action>plan|unassign):(?<eventId>[\w-]+):(?<jobName>[\w-]+)$/,
			async (ctx) => {
				if (typeof ctx.match !== 'object' || !('groups' in ctx.match)) return;

				const { action, eventId, jobName } = ctx.match.groups!;
				const user = ctx.from;
				console.info('Received week-plan callbackQuery', { action, eventId, jobName, user });

				const eventProps = await weekPlanApi.getEventsProps(eventId);
				const messageId = Number(eventProps.planMessageId);
				const assignedJobs: EventPropsJobs = JSON.parse(eventProps.jobs);
				const assignedJob = assignedJobs[jobName];
				const jobDefinition = configs
					.find((config) => config.name === eventProps.type)
					?.jobs.find((job) => job.name === jobName);

				if (!Number.isInteger(messageId) || !assignedJob || !jobDefinition) {
					throw new Error(
						`Invalid weekly-plan callback data for event ${eventId}, job ${jobName}.`
					);
				}

				if (action === 'unassign') {
					await weekPlanApi.unassignFromJob(eventProps.type, eventId, assignedJobs, jobName, user);
					await this.updateWeekPlan(messageId);
					return ctx.answerCallbackQuery({ text: 'You removed yourself from this job.' });
				}

				if (assignedJob.persons.some((person) => person.id === user.id)) {
					await this.updateWeekPlan(messageId);
					return ctx.answerCallbackQuery({ text: 'You have already signed up for this job.' });
				}

				if (assignedJob.persons.length >= jobDefinition.persons) {
					await this.updateWeekPlan(messageId);
					return ctx.answerCallbackQuery({
						show_alert: true,
						text: `This job is already taken by ${assignedJob.persons.map((person) => person.first_name).join(', ')}.`
					});
				}

				await weekPlanApi.assignToJob(eventProps.type, eventId, assignedJobs, jobName, user);
				await this.updateWeekPlan(messageId);
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
			const match = ctx.match.match(/^plan_(?<eventId>\w+)_(?<jobName>\w+)$/);

			if (match !== null && 'groups' in match) {
				const { eventId, jobName } = match.groups!;
				const user = ctx.from!;

				console.info('Received week-plan start command', { eventId, jobName, user });

				const eventProps = await weekPlanApi.getEventsProps(eventId);
				const messageId = parseInt(eventProps.planMessageId ?? '');
				const assignedJobs: EventPropsJobs = JSON.parse(eventProps.jobs);
				const assignedJob = assignedJobs[jobName];
				const [assignedPerson] = assignedJob.persons;
				const config = configs.find((config) => config.name === eventProps.type);

				if (assignedPerson && assignedPerson.id !== user.id) {
					console.info(
						`Can not sign ${user.first_name} as ${jobName} is already taken by ${assignedPerson.first_name}`
					);

					await this.updateWeekPlan(messageId);
					return ctx.reply(
						`This job is already taken by ${assignedPerson.first_name}. If you want to takeover please ask them to remove themself by tapping the button again.`
					);
				}

				if (!assignedPerson) {
					await weekPlanApi.assignToJob(eventProps.type, eventId, assignedJobs, jobName, user);
				}
				await this.updateWeekPlan(messageId);
				await this.sendUserWeekSummary(messageId, user);

				await ctx.reply(`${askDetailsReply(config?.title ?? jobName)}\n\n#${eventId}_${jobName}`, {
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

			const [, eventId, jobName] = ctx.message.reply_to_message.text.match(/#(\w+)_(\w+)/) ?? [];
			if (!eventId || !jobName) return next();
			const eventProps = await weekPlanApi.getEventsProps(eventId);
			const messageId = parseInt(eventProps.planMessageId ?? '');
			const assignedJobs: EventPropsJobs = JSON.parse(eventProps.jobs);
			const details = ctx.message.text;

			console.info('Save practise', { messageId, eventId, details });

			await weekPlanApi.addJobDetails(eventProps.type, eventId, assignedJobs, jobName, details);
			await this.updateWeekPlan(messageId);

			await ctx.react('👍');
		});
	}
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
