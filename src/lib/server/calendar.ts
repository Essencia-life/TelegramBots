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

const calendar = google.calendar({ version: 'v3', auth });

export class Calendar {
	constructor(private readonly calendarId: string) {}

	async getEvents(filter: string[], start?: Date, end?: Date): Promise<CalendarEvent[]> {
		const res = await calendar.events.list({
			calendarId: this.calendarId,
			singleEvents: true,
			orderBy: 'startTime',
			timeMin: start?.toISOString(),
			timeMax: end?.toISOString(),
			sharedExtendedProperty: filter,
			fields: 'items(id,summary,description,start,end,extendedProperties)'
		});

		return res.data.items ?? [];
	}

	async getEvent(eventId: string) {
		try {
			const res = await calendar.events.get({
				fields: 'description,start,end',
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
