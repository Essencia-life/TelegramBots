import { type Bot, InlineKeyboard } from 'grammy';
import { type CalendarEvent } from '$lib/server/calendar';
import { DateTime } from 'luxon';
import weekPlanApi, {
	type EventProps,
	type EventPropsJobs,
	type WeeklyJobsConfigs
} from '$lib/server/week-plan-api';
import weeklyJobs from '$lib/config/weekly-jobs.json';
import type { TelegramUser } from '$lib/server/db/users';
import { BOT_GROUP_CHAT_ID } from '$env/static/private';
import topics from '$lib/utils/topics';

const timeZone = 'Europe/Lisbon';
const configs = weeklyJobs.config as WeeklyJobsConfigs;

export class WeekPlanBot {
	constructor(private readonly bot: Bot) {
		this.setupCallbackHandler();
		this.setupStartHandler();
	}

	public async sendWeekPlan() {
		const weekStart = DateTime.now().setZone(timeZone).plus({ weeks: 1 }).set({ weekday: 1 });

		console.info('Sending week plan starting from', weekStart);

		const allEvents = await weekPlanApi.createEvents(weekStart);

		let firstMessage;

		for (const [title, events] of groupEvents(allEvents).entries()) {
			const [plan, keyboard] = this.buildMessage(title, events);
			const message = await this.bot.api.sendMessage(BOT_GROUP_CHAT_ID, plan.join('\n\n'), {
				message_thread_id: topics.weeklyJobs,
				parse_mode: 'HTML',
				reply_markup: keyboard
			});

			if (!firstMessage) {
				firstMessage = message;
			}

			for (const event of events) {
				await weekPlanApi.setPlanMessageId(event.id!, message.message_id);
			}
		}

		await this.bot.api.sendMessage(
			BOT_GROUP_CHAT_ID,
			'✍️ Please sign up for the upcoming week before the Monday morning planning meeting by tapping one of the buttons.',
			{
				message_thread_id: topics.weeklyJobs,
				reply_parameters: firstMessage && {
					message_id: firstMessage.message_id
				}
			}
		);
	}

	private async updateWeekPlanDay(messageId: number) {
		const events = await weekPlanApi.getEventsByPlanMessageId(messageId);
		const title = getEventGroupTitle(events[0]);
		const [plan, keyboard] = this.buildMessage(title, events);

		try {
			await this.bot.api.editMessageText(BOT_GROUP_CHAT_ID, messageId, plan.join('\n\n'), {
				parse_mode: 'HTML',
				reply_markup: keyboard
			});
		} catch (err) {
			console.warn(err);
		}
	}

	private buildMessage(title: string, events: CalendarEvent[]): [string[], InlineKeyboard] {
		const plan = [title];
		let keyboard = new InlineKeyboard();

		for (const event of events) {
			const props = event.extendedProperties!.private! as unknown as EventProps;
			const config = configs.find((config) => config.name === props.type);

			if (config) {
				const block = [`<u>${event.summary}</u>`];
				const assignedJobs: EventPropsJobs = JSON.parse(event.extendedProperties!.private!.jobs);

				for (const job of config.jobs) {
					const assignedJob = assignedJobs[job.name];

					if (job.persons === 1 && job.askDetails) {
						const {
							persons: [assignee],
							details
						} = assignedJob;
						if (!details) {
							block.push(`⤷ ${job.title}: ${formatTelegramUsers(assignedJob.persons)}`);
						} else {
							const [firstLine, rest] = details.split('\n', 2);

							if (!rest) {
								block.push(
									`⤷ ${job.title}: ${firstLine} with ${formatTelegramUsers(assignedJob.persons)}`
								);
							} else {
								block.push(
									`⤷ ${job.title}: ${firstLine} with ${formatTelegramUsers(assignedJob.persons)}`
								);
								block.push(`<blockquote expandable>${rest}</blockquote>`);
							}
						}

						keyboard = keyboard
							.row()
							.add(
								assignee
									? InlineKeyboard.text(
											buttonStatus(job.title, 1, 1),
											`plan:${event.id}:${job.name}`
										)
									: InlineKeyboard.url(
											buttonStatus(job.title, 1, 0),
											`https://t.me/EssenciaOrgaBot?start=plan_${event.id}_${job.name}`
										)
							);
					} else {
						block.push(`⤷ ${job.title}: ${formatTelegramUsers(assignedJob.persons)}`);

						keyboard = keyboard
							.row()
							.text(
								buttonStatus(job.title, job.persons, assignedJob.persons.length),
								`plan:${event.id}:${job.name}`
							);
					}
				}

				plan.push(block.join('\n'));
			}
		}

		return [plan, keyboard];
	}

	private setupCallbackHandler() {
		this.bot.callbackQuery(/^plan:(?<eventId>\w+):(?<jobName>\w+)$/, async (ctx) => {
			if (typeof ctx.match === 'object' && 'groups' in ctx.match) {
				const { eventId, jobName } = ctx.match.groups!;
				const user = ctx.from!;

				console.info('Received week-plan callbackQuery', { eventId, jobName, user });

				const eventProps = await weekPlanApi.getEventsProps(eventId);
				const messageId = parseInt(eventProps.planMessageId ?? '');
				const assignedJobs: EventPropsJobs = JSON.parse(eventProps.jobs);
				const assignedJob = assignedJobs[jobName];
				const jobDefinition = configs
					.find((config) => config.name === eventProps.type)
					?.jobs.find((job) => job.name === jobName);

				if (assignedJob.persons.length) {
					if (assignedJob.persons.some((person) => person.id === user.id)) {
						console.info(`Remove ${user.first_name} from ${jobName}`);

						await weekPlanApi.unassignFromJob(eventId, assignedJobs, jobName, user);
						await this.updateWeekPlanDay(messageId);

						return ctx.answerCallbackQuery({ text: '❎ you removed yourself' });
					} else if (jobDefinition && jobDefinition.persons === assignedJob.persons.length) {
						console.info(`Can not sign ${user.first_name} as ${jobName} is already taken`);

						await this.updateWeekPlanDay(messageId);

						return ctx.answerCallbackQuery({
							show_alert: true,
							text: `This job is already taken by ${assignedJob.persons.map((person) => person.first_name).join(', ')}. If you want to takeover please ask them to remove themself by tapping this button again.`
						});
					}
				}

				await weekPlanApi.assignToJob(eventId, assignedJobs, jobName, user);
				await this.updateWeekPlanDay(messageId);

				return ctx.answerCallbackQuery({ text: "✅ you've signed up" });
			}
		});
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

					await this.updateWeekPlanDay(messageId);
					return ctx.reply(
						`This job is already taken by ${assignedPerson.first_name}. If you want to takeover please ask them to remove themself by tapping the button again.`
					);
				}

				await weekPlanApi.assignToJob(eventId, assignedJobs, jobName, user);
				await this.updateWeekPlanDay(messageId);

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
			const eventProps = await weekPlanApi.getEventsProps(eventId);
			const messageId = parseInt(eventProps.planMessageId ?? '');
			const assignedJobs: EventPropsJobs = JSON.parse(eventProps.jobs);
			const details = ctx.message.text;

			console.info('Save practise', { messageId, eventId, details });

			await weekPlanApi.addJobDetails(eventId, assignedJobs, jobName, details);
			await this.updateWeekPlanDay(messageId);

			await ctx.react('👍');
		});
	}
}

function groupEvents(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
	return events
		.sort((a, b) =>
			DateTime.fromISO(a.start!.dateTime ?? a.start!.date!)
				.diff(DateTime.fromISO(b.start!.dateTime ?? b.start!.date!))
				.toMillis()
		)
		.reduce((groupedEvents, event) => {
			const title = getEventGroupTitle(event);

			if (groupedEvents.has(title)) {
				groupedEvents.get(title)!.push(event);
			} else {
				groupedEvents.set(title, [event]);
			}

			return groupedEvents;
		}, new Map<string, CalendarEvent[]>());
}

function getEventGroupTitle(event: CalendarEvent) {
	const start = DateTime.fromISO(event.start!.dateTime ?? event.start!.date!).setZone(
		event.start!.timeZone!
	);
	const end = DateTime.fromISO(event.end!.dateTime ?? event.end!.date!).setZone(
		event.start!.timeZone!
	);

	if (start.hasSame(end, 'day')) {
		return `<b>${start.setLocale('en').toLocaleString({ weekday: 'long' })}</b> / ${start.setLocale('pt').toLocaleString({ weekday: 'long', day: 'numeric', month: 'numeric' })}`;
	}

	return `<b>Week</b> ${start.setLocale('pt').toLocaleString({ day: 'numeric', month: 'numeric' })} - ${end.setLocale('pt').toLocaleString({ day: 'numeric', month: 'numeric' })}`;
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

function buttonStatus(title: string, persons: number, assignedPersons: number) {
	return `${'✅ '.repeat(assignedPersons)}${'⭕️ '.repeat(persons - assignedPersons)} ${title}`;
}

function noopTag(strings: TemplateStringsArray, ...values: unknown[]) {
	return String.raw(strings, ...values);
}

if (!('escape' in RegExp)) {
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
