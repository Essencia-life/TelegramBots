import type { TelegramUser } from '$lib/server/db/users.ts';
import { Calendar, type CalendarEvent } from '$lib/server/calendar';
import { DateTime } from 'luxon';
import weeklyJobs from '$lib/config/weekly-jobs.json';
import {
	type LunarRelation,
	matchesRelationToLunarPhase,
	type Weekday
} from '$lib/utils/lunar-matching';
import lunarProvider, { type MoonPhase } from '$lib/utils/lunar-provider';
import type { calendar_v3 } from 'googleapis';
import { COMMUNITY_CALENDAR_ID, EVENTS_CALENDAR_ID } from '$env/static/private';

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

type CalendarNames = 'community' | 'events';

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

export const calendarByName: Record<CalendarNames, Calendar> = {
	community: new Calendar(COMMUNITY_CALENDAR_ID),
	events: new Calendar(EVENTS_CALENDAR_ID)
};

export interface EventProps {
	source: 'week-plan';
	type: string;
	jobs: string;
	planMessageId?: string;
}

export type EventPropsJobs = Record<
	string,
	{ persons: TelegramUser[]; title: string; details?: string }
>;

class WeekPlanApi {
	async createEvents(weekStart: DateTime) {
		console.info('Create events', weekStart);

		const eventsByCalendarName: Record<CalendarNames, CalendarEvent[]> = {
			community: [],
			events: []
		};

		for (const config of configs) {
			if (config.type === 'weekly') {
				const weekEnd = weekStart.plus({ days: 5 });

				eventsByCalendarName[config.calendar].push({
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

						eventsByCalendarName[config.calendar].push(event);
					}
				}
			}
		}

		// TODO get existing events of calendars with source=week-plan filter
		// TODO update events in calendars

		for (const [calendarName, events] of Object.entries(eventsByCalendarName)) {
			for (const event of events) {
				console.info('Create event ', event.summary, event.start!.date);
				const response = await calendarByName[calendarName as CalendarNames].insertEvent(event);
				Object.assign(event, response.data);
			}
		}

		return Object.values(eventsByCalendarName).flat();
	}

	async getWeekEvents(weekStart: DateTime) {
		const weekEnd = weekStart.plus({ days: 5 });
		const eventsPerCalendar = await Promise.all(
			Object.values(calendarByName).map((calendar) =>
				calendar.getEvents(
					['source=week-plan'],
					weekStart.startOf('day').toJSDate(),
					weekEnd.endOf('day').toJSDate()
				)
			)
		);

		return eventsPerCalendar.flat();
	}

	async getEventsByPlanMessageId(messageId: number) {
		const eventsPerCalendar = await Promise.all(
			Object.values(calendarByName).map((calendar) =>
				calendar.getEvents([`planMessageId=${messageId}`])
			)
		);
		return eventsPerCalendar.flat();
	}

	async getEventsProps(eventId: string) {
		for (const calendar of Object.values(calendarByName)) {
			try {
				const event = await calendar.getEvent(eventId);
				return event.extendedProperties!.private as unknown as EventProps;
			} catch {
				// Not found?
			}
		}

		throw new Error(`Event with id ${eventId} was not found.`);
	}

	async setPlanMessageId(configName: string, eventId: string, messageId: number) {
		const config = configs.find((item) => item.name === configName)!;

		return calendarByName[config.calendar].updateEvent(eventId, {
			extendedProperties: {
				private: {
					planMessageId: messageId.toString()
				}
			}
		});
	}

	async assignToJob(
		configName: string,
		eventId: string,
		assignedJobs: EventPropsJobs,
		jobName: string,
		user: TelegramUser
	) {
		// TODO validations ?

		assignedJobs[jobName].persons.push(user);

		const config = configs.find((item) => item.name === configName)!;

		return calendarByName[config.calendar].updateEvent(eventId, {
			extendedProperties: {
				private: {
					jobs: JSON.stringify(assignedJobs)
				}
			}
		});
	}

	async unassignFromJob(
		configName: string,
		eventId: string,
		assignedJobs: EventPropsJobs,
		jobName: string,
		user: TelegramUser
	) {
		// TODO validations ?

		const index = assignedJobs[jobName].persons.findIndex((person) => person.id === user.id);

		if (index > -1) {
			assignedJobs[jobName].persons.splice(index, 1);

			if (assignedJobs[jobName].persons.length === 0) {
				delete assignedJobs[jobName].details;
			}

			const config = configs.find((item) => item.name === configName)!;

			return calendarByName[config.calendar].updateEvent(eventId, {
				extendedProperties: {
					private: {
						jobs: JSON.stringify(assignedJobs)
					}
				}
			});
		}
	}

	async addJobDetails(
		configName: string,
		eventId: any,
		assignedJobs: any,
		jobName: any,
		details: string
	) {
		assignedJobs[jobName].details = details;

		const config = configs.find((item) => item.name === configName)!;

		return calendarByName[config.calendar].updateEvent(eventId, {
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
