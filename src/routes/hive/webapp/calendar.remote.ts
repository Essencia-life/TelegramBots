import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { query, command, getRequestEvent } from '$app/server';
import { decryptParam } from '$lib/server/encryption';
import { Calendar } from '$lib/server/calendar';
import { updateAgenda, updateInlineMessage } from '$lib/server/hive/bot';
import { CO_WORKING_CALENDAR_ID, HIVE_CALENDAR_ID } from '$env/static/private';

export const getBookings = query(z.iso.date(), async (date) => {
	const startDate = new Date(`${date} 00:00:00:000`);
	const endDate = new Date(`${date} 23:59:59:999`);

	const { cookies } = getRequestEvent();
	const userEncrypted = cookies.get('hive-session');
	const user = userEncrypted && decryptParam(userEncrypted);

	if (!user) {
		return error(401, 'Unauthorized');
	}

	const hiveCalendar = new Calendar(HIVE_CALENDAR_ID);
	return hiveCalendar.getEvents([], startDate, endDate);
});

export const checkAvailability = command(
	z.object({
		startDate: z.iso.datetime(),
		endDate: z.iso.datetime()
	}),
	async ({ startDate, endDate }) => {
		const hiveCalendar = new Calendar(HIVE_CALENDAR_ID);
		return hiveCalendar.getFreeBusy(startDate, endDate);
	}
);

export const createBooking = command(
	z.object({
		startDate: z.iso.datetime(),
		endDate: z.iso.datetime(),
		description: z.string()
	}),
	async ({ startDate, endDate, description }) => {
		const { cookies } = getRequestEvent();
		const userEncrypted = cookies.get('hive-session');
		const user = userEncrypted && decryptParam(userEncrypted);

		if (!user) {
			return error(401, 'Unauthorized');
		}

		const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);

		const res = await coWorkingCalendar.insertEvent({
			summary: user.first_name,
			description,
			start: {
				dateTime: startDate,
				timeZone: 'Europe/Lisbon'
			},
			end: {
				dateTime: endDate,
				timeZone: 'Europe/Lisbon'
			},
			attendees: [
				{
					email: HIVE_CALENDAR_ID,
					resource: true
				}
			],
			extendedProperties: {
				shared: {
					telegramUserId: String(user.id)
				}
			}
		});

		await updateAgenda(res.data);

		void getBookings(startDate.substring(0, 10)).refresh();

		return res.data.id!;
	}
);

export const deleteBooking = command(z.string(), async (id: string) => {
	const { cookies } = getRequestEvent();
	const userEncrypted = cookies.get('hive-session');
	const user = userEncrypted && decryptParam(userEncrypted);

	if (!user) {
		return error(401, 'Unauthorized');
	}

	const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);
	const booking = await coWorkingCalendar.getEvent(id);

	if (!booking) {
		return error(404, 'Booking not found');
	}

	const telegramInlineMessageId = booking.extendedProperties?.private?.telegramInlineMessageId;

	await coWorkingCalendar.deleteEvent(id);

	if (telegramInlineMessageId) {
		await updateInlineMessage(telegramInlineMessageId, booking, true);
	}

	await updateAgenda(booking);

	void getBookings(booking.start!.dateTime!.substring(0, 10)).refresh();
});

export const updateBooking = command(
	z.object({
		id: z.string(),
		startDate: z.iso.datetime(),
		endDate: z.iso.datetime(),
		description: z.string()
	}),
	async ({ id, startDate, endDate, description }) => {
		const { cookies } = getRequestEvent();
		const userEncrypted = cookies.get('hive-session');
		const user = userEncrypted && decryptParam(userEncrypted);

		if (!user) {
			return error(401, 'Unauthorized');
		}

		const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);

		const res = await coWorkingCalendar.updateEvent(id, {
			description,
			start: {
				dateTime: startDate,
				timeZone: 'Europe/Lisbon'
			},
			end: {
				dateTime: endDate,
				timeZone: 'Europe/Lisbon'
			}
		});

		const telegramInlineMessageId = res.data.extendedProperties?.private?.telegramInlineMessageId;

		if (telegramInlineMessageId) {
			await updateInlineMessage(telegramInlineMessageId, res.data);
		}

		await updateAgenda(res.data);

		void getBookings(startDate.substring(0, 10)).refresh();

		return res.data.id!;
	}
);
