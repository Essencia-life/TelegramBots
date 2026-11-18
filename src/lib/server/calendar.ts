import { google, type calendar_v3 } from 'googleapis';
import { GOOGLE_API_USER, GOOGLE_API_KEY, GOOGLE_API_SUBJECT } from '$env/static/private';
import { GaxiosError } from 'gaxios';
import { constants } from 'node:http2';

const auth = new google.auth.JWT({
	email: GOOGLE_API_USER,
	key: GOOGLE_API_KEY,
	subject: GOOGLE_API_SUBJECT,
	scopes: ['https://www.googleapis.com/auth/calendar']
});

export type CalendarEvent = calendar_v3.Schema$Event;
export type TimePeriod = calendar_v3.Schema$TimePeriod;
export type CalendarChannel = calendar_v3.Schema$Channel;

const calendar = google.calendar({ version: 'v3', auth });

/**
 * Busy times of a resource calendar from its events, without the booking that is being edited
 * (the resource's copy of an event has the same iCalUID as the organizer's event).
 */
export function busyPeriods(events: CalendarEvent[], resourceId: string, excludeICalUID?: string | null): TimePeriod[] {
	return events
		.filter((e) => e.status !== 'cancelled' && e.transparency !== 'transparent')
		.filter((e) => !excludeICalUID || e.iCalUID !== excludeICalUID)
		.filter((e) => !e.attendees?.some((a) => a.email === resourceId && a.responseStatus === 'declined'))
		.map((e) => ({ start: e.start?.dateTime ?? e.start?.date, end: e.end?.dateTime ?? e.end?.date }));
}

export class Calendar {
	constructor(private readonly calendarId: string) {}

	/** `props` selects which extended properties `filter` matches against. */
	async getEvents(
		filter: string[],
		start?: Date,
		end?: Date,
		{ props = 'shared' }: { props?: 'shared' | 'private' } = {}
	): Promise<CalendarEvent[]> {
		const res = await calendar.events.list({
			calendarId: this.calendarId,
			singleEvents: true,
			orderBy: 'startTime',
			timeMin: start?.toISOString(),
			timeMax: end?.toISOString(),
			timeZone: 'Europe/Lisbon',
			...(props === 'private' ? { privateExtendedProperty: filter } : { sharedExtendedProperty: filter }),
			fields: 'items(id,summary,description,location,start,end,recurringEventId,iCalUID,extendedProperties)'
		});

		return res.data.items ?? [];
	}

	async getEvent(eventId: string) {
		try {
			const res = await calendar.events.get({
				// extendedProperties: the inline message id (private) and the privacy flag (shared) are read from it
				fields: 'summary,description,start,end,iCalUID,extendedProperties',
				calendarId: this.calendarId,
				eventId
			});

			return res.data;
		} catch (err) {
			if (err instanceof GaxiosError && err.status === constants.HTTP_STATUS_NOT_FOUND) {
				console.error(err);
			} else {
				throw err;
			}
		}
		return;
	}

	async insertEvent(requestBody: CalendarEvent) {
		return calendar.events.insert({
			calendarId: this.calendarId,
			requestBody
		});
	}

	async updateEvent(eventId: string, requestBody: CalendarEvent) {
		return calendar.events.patch({
			calendarId: this.calendarId,
			eventId,
			requestBody
		});
	}

	async deleteEvent(eventId: string) {
		return calendar.events.delete({
			calendarId: this.calendarId,
			eventId
		});
	}

	/** Like getFreeBusy, but a booking can be left out (to check an edit against the other bookings). */
	async getBusyExcept(start: string, end: string, excludeICalUID?: string | null): Promise<TimePeriod[]> {
		const res = await calendar.events.list({
			calendarId: this.calendarId,
			singleEvents: true,
			timeMin: start,
			timeMax: end,
			timeZone: 'Europe/Lisbon',
			fields: 'items(iCalUID,status,transparency,start,end,attendees(email,responseStatus))'
		});

		return busyPeriods(res.data.items ?? [], this.calendarId, excludeICalUID);
	}

	/** Google calls the channel's webhook when an event in the range changes. */
	async watchEvents(start: Date, end: Date, requestBody: CalendarChannel) {
		return calendar.events.watch({
			calendarId: this.calendarId,
			singleEvents: true,
			orderBy: 'startTime',
			timeMin: start.toISOString(),
			timeMax: end.toISOString(),
			timeZone: 'Europe/Lisbon',
			requestBody
		});
	}

	async getFreeBusy(start: string, end: string): Promise<TimePeriod[]> {
		const res = await calendar.freebusy.query({
			requestBody: {
				items: [{ id: this.calendarId }],
				timeMin: start,
				timeMax: end,
				timeZone: 'Europe/Lisbon'
			}
		});

		const { busy } = res.data.calendars![this.calendarId];

		return busy ?? [];
	}
}
