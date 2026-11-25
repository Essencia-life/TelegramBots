import { DateTime } from 'luxon';
import { Calendar, type CalendarEvent } from '$lib/server/calendar';
import type { Room } from './rooms';

export const timeZone = 'Europe/Lisbon';

export function todayRange() {
	const now = DateTime.now().setZone(timeZone);
	return { start: now.startOf('day').toJSDate(), end: now.endOf('day').toJSDate() };
}

export function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

const time = (date: Date) =>
	date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });

function formatEvent(event: CalendarEvent) {
	const start = event.start?.dateTime ?? event.start?.date;
	const end = event.end?.dateTime ?? event.end?.date;
	const startDate = start ? new Date(start) : undefined;
	const endDate = end ? new Date(end) : undefined;

	const timeString =
		startDate && endDate
			? `<tg-time unix="${Math.floor(startDate.getTime() / 1000)}">${time(startDate)} – ${time(endDate)}</tg-time>`
			: '';

	const isPersonalBooking = !!event.extendedProperties?.shared?.telegramUserId;
	const privacy = event.extendedProperties?.shared?.isPrivate;
	const description =
		event.description && isPersonalBooking ? escapeHtml(event.description) : '';
	// rooms without a privacy setting do not store one: nothing is shown then
	const suffix =
		isPersonalBooking && privacy
			? privacy === 'true'
				? '\n\n<i>🔒 Please respect the privacy and do not disturb.</i>'
				: '\n\n<i>🤫 Silent co-working is accepted</i>'
			: '';

	return `<blockquote>${timeString}\n<b>${escapeHtml(event.summary ?? '')}</b> ${description}${suffix}</blockquote>`;
}

/** The agenda of a room for today, undefined when nothing is booked. */
export async function generateAgenda(room: Room) {
	const { start, end } = todayRange();
	const events = await new Calendar(room.calendarId).getEvents([], start, end);
	if (events.length === 0) return;

	return `<b>Today's bookings: ${escapeHtml(room.name)}</b>\n\n${events.map(formatEvent).join('\n')}`;
}
