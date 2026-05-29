import { google, type calendar_v3 } from 'googleapis';
import {
	GOOGLE_API_USER,
	GOOGLE_API_KEY,
	COMMUNITY_CALENDAR_ID,
	GOOGLE_API_SUBJECT
} from '$env/static/private';

const auth = new google.auth.JWT({
	email: GOOGLE_API_USER,
	key: GOOGLE_API_KEY,
	subject: GOOGLE_API_SUBJECT,
	scopes: ['https://www.googleapis.com/auth/calendar']
});

export type CalendarEvent = calendar_v3.Schema$Event;

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
			privateExtendedProperty: filter
		});

		return res.data.items ?? [];
	}

	async getEvent(eventId: string) {
		const res = await calendar.events.get({
			calendarId: this.calendarId,
			eventId
		});

		return res.data;
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
}

export default new Calendar(COMMUNITY_CALENDAR_ID);
