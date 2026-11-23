import type { RequestHandler } from './$types';
import { agendaMessageKey, bot, openBookingsButton, refreshAgenda } from '$lib/server/booking/bot';
import { generateAgenda, todayRange } from '$lib/server/booking/agenda';
import { getRoom, rooms, type Room } from '$lib/server/booking/rooms';
import { InlineKeyboard } from 'grammy';
import { DateTime } from 'luxon';
import { BOT_HOME_GROUP_CHAT_ID, VERCEL_BRANCH_URL } from '$env/static/private';
import { Calendar } from '$lib/server/calendar';
import { redis } from '$lib/server/redis';

async function sendAgenda(room: Room) {
	const text = await generateAgenda(room);

	if (!text) {
		console.info(`agenda GET: no bookings for ${room.slug}`);
		return false;
	}

	const message = await bot.api.sendMessage(BOT_HOME_GROUP_CHAT_ID, text, {
		parse_mode: 'HTML',
		message_thread_id: room.topicId,
		reply_markup: new InlineKeyboard().add(openBookingsButton(room))
	});

	await redis.set(agendaMessageKey(room), message.message_id, {
		exat: Math.floor(DateTime.now().setZone('Europe/Lisbon').endOf('day').toSeconds())
	});

	// bookings of today show up in the agenda when the calendar changes, also when the resource calendar is late
	const { start, end } = todayRange();
	await new Calendar(room.calendarId)
		.watchEvents(start, end, {
			id: crypto.randomUUID(),
			token: JSON.stringify({ room: room.slug }),
			type: 'webhook',
			address: `https://${VERCEL_BRANCH_URL}/booking/api/telegram/agenda`,
			expiration: end.getTime().toString()
		})
		.catch((err) => console.error(`agenda GET: could not watch the calendar of ${room.slug}`, err));

	return true;
}

/** Posts the agenda of every room that has bookings today to the topic of the room. */
export const GET: RequestHandler = async () => {
	const results = await Promise.all(
		rooms.map((room) =>
			sendAgenda(room).catch((err) => {
				// one room must not stop the others
				console.error(`agenda GET: failed for ${room.slug}`, err);
				return false;
			})
		)
	);

	return new Response(null, { status: results.some(Boolean) ? 201 : 204 });
};

/** Google calendar webhook: something changed in the calendar of a room today. */
export const POST: RequestHandler = async ({ request: { headers } }) => {
	// "sync" only confirms that the watch exists
	if (headers.get('x-goog-resource-state') !== 'sync') {
		try {
			const room = getRoom(JSON.parse(headers.get('x-goog-channel-token') ?? '{}').room);
			if (room) await refreshAgenda(room);
		} catch (err) {
			// not answering with an error: Google would only repeat the notification
			console.error(err);
		}
	}

	return new Response(null, { status: 202 });
};
