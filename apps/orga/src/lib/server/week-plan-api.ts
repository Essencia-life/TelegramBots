import type { TelegramUser } from '$lib/server/db/users.ts';
import calendar, { type CalendarEvent } from '$lib/server/calendar';
import { DateTime } from 'luxon';
import weeklyJobs from '$lib/config/weekly-jobs.json';
import {
	type LunarRelation,
	matchesRelationToLunarPhase,
	type Weekday
} from '$lib/utils/lunar-matching';
import lunarProvider, { type MoonPhase } from '$lib/utils/lunar-provider';
import type { calendar_v3 } from 'googleapis';

const timeZone = 'Europe/Lisbon';
const configs = weeklyJobs.config as WeeklyJobsConfigs;

interface BaseJobConfig {
	calendar: 'community' | 'events';
	name: string;
	title: string;
	description: string;
	location?: string;
	jobs: JobDefinition[];
}

interface JobDefinitionOnePerson {
	name: string;
	title: string;
	persons: 1;
	askDetails?: boolean;
}

interface JobDefinitionTwoPersons {
	name: string;
	title: string;
	persons: 2;
}

type JobDefinition = JobDefinitionOnePerson | JobDefinitionTwoPersons;

interface DailyJobConfig extends BaseJobConfig {
	type: 'daily';
	startTime: { hour: number; minute: number };
	endTime: { hour: number; minute: number };
	weekdays: Weekday[];
}

interface WeeklyJobConfig extends BaseJobConfig {
	type: 'weekly';
}

interface MoonCycleJobConfig extends BaseJobConfig {
	type: 'moon';
	startTime: { hour: number; minute: number };
	endTime: { hour: number; minute: number };
	weekday: Weekday;
	phase: MoonPhase;
	relation: LunarRelation;
}

type WeeklyJobsConfig = DailyJobConfig | WeeklyJobConfig | MoonCycleJobConfig;
export type WeeklyJobsConfigs = WeeklyJobsConfig[];

const locationRoomMapping = new Map<string, calendar_v3.Schema$EventAttendee>([
	[
		'Shala',
		{ email: 'c_1885fldmc9nuqjj3mjkeoq4b608h2@resource.calendar.google.com', resource: true }
	],
	[
		'Hive',
		{ email: 'c_1889c1tchb404ha0ilqe71f97m3ua@resource.calendar.google.com', resource: true }
	]
]);

export interface EventProps {
	source: 'week-plan';
	type: string;
	jobs: string;
	planMessageId?: string;
}

export type EventPropsJobs = Record<
	string,
	{ persons: TelegramUser[]; title: string; details: string }
>;

class WeekPlanApi {
	async createEvents(weekStart: DateTime) {
		console.info('Create events', weekStart);

		const events = [];

		for (const config of configs) {
			if (config.type === 'weekly') {
				const weekEnd = weekStart.plus({ days: 5 });

				events.push({
					summary: config.title,
					description: config.description,
					start: { date: weekStart.toISODate(), timeZone },
					end: { date: weekEnd.toISODate(), timeZone },
					extendedProperties: {
						private: {
							source: 'week-plan',
							type: config.name,
							jobs: JSON.stringify(
								Object.fromEntries(
									config.jobs.map((jobDef) => [jobDef.name, { title: jobDef.title, persons: [] }])
								)
							)
						} satisfies EventProps
					}
				});
			} else {
				for (let i = 0; i < 5; i++) {
					const date = weekStart.plus({ days: i });

					const dailyCondition = config.type === 'daily' && isWeekdays(config, date.toJSDate());
					const moonCondition = config.type === 'moon' && isWeekdayInMoon(config, date.toJSDate());

					if (dailyCondition || moonCondition) {
						const startDateTime = date.set(config.startTime);
						const endDateTime = date.set(config.endTime);

						const event: CalendarEvent = {
							summary: config.title,
							description: config.description,
							start: { dateTime: startDateTime.toISO(), timeZone },
							end: { dateTime: endDateTime.toISO(), timeZone },
							extendedProperties: {
								private: {
									source: 'week-plan',
									type: config.name,
									jobs: JSON.stringify(
										Object.fromEntries(
											config.jobs.map((jobDef) => [
												jobDef.name,
												{ title: jobDef.title, persons: [] }
											])
										)
									)
								}
							}
						};

						if (config.location) {
							if (locationRoomMapping.has(config.location)) {
								event.attendees = [locationRoomMapping.get(config.location)!];
							} else {
								event.location = config.location;
							}
						}

						events.push(event);
					}
				}
			}
		}

		// TODO get existing events of calendars with source=week-plan filter
		// TODO update events in calendars

		for (const event of events) {
			console.info('Create event ', event.summary, event.start!.date);
			const response = await calendar.insertEvent(event);
			Object.assign(event, response.data);
		}

		return events;
	}

	async getWeekEvents(weekStart: DateTime) {
		const weekEnd = weekStart.plus({ days: 5 });
		return calendar.getEvents(
			['source=week-plan'],
			weekStart.startOf('day').toJSDate(),
			weekEnd.endOf('day').toJSDate()
		);
	}

	async getEventsByPlanMessageId(messageId: number) {
		return calendar.getEvents([`planMessageId=${messageId}`]);
	}

	async getEventsProps(eventId: string) {
		const event = await calendar.getEvent(eventId);
		return event.extendedProperties!.private as unknown as EventProps;
	}

	async setPlanMessageId(eventId: string, messageId: number) {
		return calendar.updateEvent(eventId, {
			extendedProperties: {
				private: {
					planMessageId: messageId.toString()
				}
			}
		});
	}

	async assignToJob(
		eventId: string,
		assignedJobs: EventPropsJobs,
		jobName: string,
		user: TelegramUser
	) {
		// TODO validations ?

		assignedJobs[jobName].persons.push(user);

		return calendar.updateEvent(eventId, {
			extendedProperties: {
				private: {
					jobs: JSON.stringify(assignedJobs)
				}
			}
		});
	}

	async unassignFromJob(
		eventId: string,
		assignedJobs: EventPropsJobs,
		jobName: string,
		user: TelegramUser
	) {
		// TODO validations ?

		const index = assignedJobs[jobName].persons.findIndex((person) => person.id === user.id);

		if (index > -1) {
			assignedJobs[jobName].persons.splice(index, 1);

			return calendar.updateEvent(eventId, {
				extendedProperties: {
					private: {
						jobs: JSON.stringify(assignedJobs)
					}
				}
			});
		}
	}

	async addJobDetails(eventId: any, assignedJobs: any, jobName: any, details: string) {
		assignedJobs[jobName].details = details;

		return calendar.updateEvent(eventId, {
			extendedProperties: {
				private: {
					jobs: JSON.stringify(assignedJobs)
				}
			}
		});
	}
}

function isWeekdays(config: DailyJobConfig, date: Date) {
	return config.weekdays.includes(date.getDay() as Weekday);
}

function isWeekdayInMoon(config: MoonCycleJobConfig, date: Date) {
	return matchesRelationToLunarPhase(date, config, lunarProvider);
}

export default new WeekPlanApi();
