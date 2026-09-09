import { Calendar, type CalendarEvent } from '$lib/server/calendar';
import { HIVE_CALENDAR_ID } from '$env/static/private';

const hiveCalendar = new Calendar(HIVE_CALENDAR_ID);

function buildIsoRangeForToday() {
	const now = new Date();
	const lisbonTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));

	const start = new Date(lisbonTime);
	start.setHours(0, 0, 0, 0);

	const end = new Date(lisbonTime);
	end.setHours(23, 59, 59, 999);

	return { start, end };
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatEvent(event: CalendarEvent) {
	const start = event.start?.dateTime ?? event.start?.date;
	const end = event.end?.dateTime ?? event.end?.date;

	const startDate = start ? new Date(start) : undefined;
	const endDate = end ? new Date(end) : undefined;

	const timeString =
		startDate && endDate
			? `<tg-time unix="${Math.floor(startDate.getTime() / 1000)}">${startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })} – ${endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })}</tg-time>`
			: '';

	const isPersonalBooking = !!event.extendedProperties?.shared?.telegramUserId;
	const title = escapeHtml(event.summary!);
	const description = event.description && isPersonalBooking ? escapeHtml(event.description) : '';

	return `<blockquote>${timeString}\n<b>${title}</b> ${description}</blockquote>`;
}

export async function generateAgenda() {
	console.info('agenda GET: fetching today events for hive calendar');
	const { start, end } = buildIsoRangeForToday();

	const events = await hiveCalendar.getEvents([], start, end);
	console.info('agenda GET: found', events.length, 'events');

	if (events.length === 0) {
		console.info('agenda GET: no events, returning 204 without sending message');
		return;
	}

	return `<b>Today's Hive Bookings:</b>\n\n${events.map(formatEvent).join('\n')}`;
}
