import { error } from '@sveltejs/kit';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { query, command } from '$app/server';
import { getSession } from '$lib/server/session';
import { Calendar } from '$lib/server/calendar';
import { getRoom, roomOf } from '$lib/server/booking/rooms';
import { timeZone } from '$lib/server/booking/agenda';
import { updateAgenda, updateInlineMessage } from '$lib/server/booking/bot';
import { BOOKING_CALENDAR_ID, BOOKING_BOT_TOKEN } from '$env/static/private';

/** Slug of a configured room, resolved to the room itself. */
const roomSchema = z
	.string()
	.refine((slug) => getRoom(slug), 'Unknown room')
	.transform((slug) => getRoom(slug)!);

const timeRange = z
	.object({ startDate: z.iso.datetime(), endDate: z.iso.datetime() })
	.refine(({ startDate, endDate }) => new Date(endDate) > new Date(startDate), {
		message: 'The end must be after the start',
		path: ['endDate']
	});

const bookingFields = z.object({
	description: z.string().max(1000),
	isPrivate: z.boolean()
});

/** Loads a booking and makes sure the logged-in user created it. */
async function getOwnBooking(id: string) {
	const { user } = getSession(BOOKING_BOT_TOKEN);

	const booking = await new Calendar(BOOKING_CALENDAR_ID).getEvent(id);
	if (!booking) return error(404, 'Booking not found');

	if (booking.extendedProperties?.shared?.telegramUserId !== String(user.id)) {
		return error(403, 'Only the creator of a booking can change it');
	}

	return booking;
}

export const getBookings = query(
	z.object({ room: roomSchema, date: z.iso.date() }),
	async ({ room, date }) => {
		getSession(BOOKING_BOT_TOKEN);

		const day = DateTime.fromISO(date, { zone: timeZone });

		return new Calendar(room.calendarId).getEvents(
			[],
			day.startOf('day').toJSDate(),
			day.endOf('day').toJSDate()
		);
	}
);

export const checkAvailability = command(
	z.intersection(
		z.object({
			room: roomSchema,
			/** the booking being edited: it must not block itself */
			excludeId: z.string().optional()
		}),
		timeRange
	),
	async ({ room, startDate, endDate, excludeId }) => {
		getSession(BOOKING_BOT_TOKEN);

		const roomCalendar = new Calendar(room.calendarId);
		if (!excludeId) return roomCalendar.getFreeBusy(startDate, endDate);

		const own = await new Calendar(BOOKING_CALENDAR_ID).getEvent(excludeId);
		return roomCalendar.getBusyExcept(startDate, endDate, own?.iCalUID);
	}
);

export const createBooking = command(
	z.intersection(z.object({ room: roomSchema }), z.intersection(timeRange, bookingFields)),
	async ({ room, startDate, endDate, description, isPrivate }) => {
		const { user } = getSession(BOOKING_BOT_TOKEN);

		const res = await new Calendar(BOOKING_CALENDAR_ID).insertEvent({
			summary: user.first_name,
			description,
			start: { dateTime: startDate, timeZone },
			end: { dateTime: endDate, timeZone },
			attendees: [{ email: room.calendarId, resource: true }],
			extendedProperties: {
				shared: {
					telegramUserId: String(user.id),
					isPrivate: String(isPrivate),
					room: room.slug
				}
			}
		});

		await updateAgenda(res.data);

		void getBookings({ room: room.slug, date: startDate.substring(0, 10) }).refresh();

		return res.data.id!;
	}
);

export const deleteBooking = command(z.string(), async (id) => {
	const booking = await getOwnBooking(id);

	const telegramInlineMessageId = booking.extendedProperties?.private?.telegramInlineMessageId;

	await new Calendar(BOOKING_CALENDAR_ID).deleteEvent(id);

	if (telegramInlineMessageId) {
		await updateInlineMessage(telegramInlineMessageId, booking, true);
	}

	await updateAgenda(booking);

	void getBookings({
		room: roomOf(booking)!.slug,
		date: booking.start!.dateTime!.substring(0, 10)
	}).refresh();
});

export const updateBooking = command(
	z.intersection(
		z.object({ id: z.string(), room: roomSchema }),
		z.intersection(timeRange, bookingFields)
	),
	async ({ id, room, startDate, endDate, description, isPrivate }) => {
		const booking = await getOwnBooking(id);

		// the room cannot be changed afterwards and must match the one the client is looking at
		if (roomOf(booking)?.slug !== room.slug) {
			return error(404, 'Booking not found');
		}

		const res = await new Calendar(BOOKING_CALENDAR_ID).updateEvent(id, {
			description,
			start: { dateTime: startDate, timeZone },
			end: { dateTime: endDate, timeZone },
			extendedProperties: {
				shared: { isPrivate: String(isPrivate) }
			}
		});

		const telegramInlineMessageId = res.data.extendedProperties?.private?.telegramInlineMessageId;

		if (telegramInlineMessageId) {
			await updateInlineMessage(telegramInlineMessageId, res.data);
		}

		await updateAgenda(res.data);

		void getBookings({ room: room.slug, date: startDate.substring(0, 10) }).refresh();

		return res.data.id!;
	}
);
