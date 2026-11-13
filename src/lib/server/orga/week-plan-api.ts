import { Calendar, type CalendarEvent } from './calendar';
import { DateTime } from 'luxon';
import { COMMUNITY_CALENDAR_ID, EVENTS_CALENDAR_ID } from '$env/static/private';
import { parseJobs, typeSchema, type Job } from './jobs';

export const timeZone = 'Europe/Lisbon';

export const calendarByName = {
	community: new Calendar(COMMUNITY_CALENDAR_ID),
	events: new Calendar(EVENTS_CALENDAR_ID)
};

/** An occurrence of a calendar series (or single event) that has jobs. Sign-ups are keyed by `type` + `date`. */
export interface PlanEvent {
	event: CalendarEvent;
	type: string;
	/** local start day, yyyymmdd */
	date: string;
	jobs: Job[];
}

export const dateKey = (d: DateTime) => d.toFormat('yyyyLLdd');

export function toPlanEvent(event: CalendarEvent): PlanEvent | null {
	const props = event.extendedProperties?.private;
	const jobs = parseJobs(props?.jobs);
	const start = event.start?.dateTime ?? event.start?.date;
	if (!event.id || !start || !jobs.length || !typeSchema.safeParse(props?.type).success) return null;
	return {
		event,
		type: props!.type,
		date: dateKey(DateTime.fromISO(start, { zone: timeZone }).setZone(timeZone)),
		jobs
	};
}

/** Events with jobs between two instants; the calendar can not filter on "has a jobs property". */
async function getPlanEvents(filter: string[], start: Date, end: Date) {
	const perCalendar = await Promise.all(
		Object.values(calendarByName).map((calendar) => calendar.getEvents(filter, start, end))
	);
	return perCalendar.flat().flatMap((event) => toPlanEvent(event) ?? []);
}

/** Monday to Friday, like the week plan message. */
export const getWeekEvents = (weekStart: DateTime) =>
	getPlanEvents([], weekStart.startOf('day').toJSDate(), weekStart.plus({ days: 4 }).endOf('day').toJSDate());

/** The occurrence of a kind of event on a day, as referenced by buttons (`type` + yyyymmdd). */
export async function findPlanEvent(type: string, date: string) {
	const day = DateTime.fromFormat(date, 'yyyyLLdd', { zone: timeZone });
	const [found] = await getPlanEvents([`type=${type}`], day.startOf('day').toJSDate(), day.endOf('day').toJSDate());
	return found;
}
