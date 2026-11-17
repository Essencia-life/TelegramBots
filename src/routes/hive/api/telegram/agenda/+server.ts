import type { RequestHandler } from './$types';
import { bot, getInlineKeyboardOpenBookingsButton, refreshAgenda } from '$lib/server/hive/bot';
import { InlineKeyboard } from 'grammy';
import {
	BOT_HOME_GROUP_CHAT_ID,
	HIVE_BOT_TOPIC_ID,
	HIVE_CALENDAR_ID,
	VERCEL_BRANCH_URL,
	VERCEL_ENV
} from '$env/static/private';
import { Calendar } from '$lib/server/calendar';
import { redis } from '$lib/server/redis';
import { buildIsoRangeForToday, generateAgenda } from '$lib/server/hive/agenda';

export const GET: RequestHandler = async () => {
	const text = await generateAgenda();

	if (!text) {
		console.info('agenda GET: no events, returning 204 without sending message');
		return new Response(null, { status: 204 });
	}

	console.info(
		'agenda GET: sending message to telegram group',
		BOT_HOME_GROUP_CHAT_ID,
		'topic',
		HIVE_BOT_TOPIC_ID
	);

	// TODO check redis for existing message ID and update instead
	const message = await bot.api.sendMessage(BOT_HOME_GROUP_CHAT_ID, text, {
		parse_mode: 'HTML',
		message_thread_id: Number(HIVE_BOT_TOPIC_ID),
		reply_markup: new InlineKeyboard().add(await getInlineKeyboardOpenBookingsButton())
	});

	await redis.set(`essencia:${VERCEL_ENV}:hiveBotAgendaMessageId`, message.message_id, {
		exat: new Date().setHours(23, 59, 59, 999)
	});

	// bookings of today show up in the agenda when the calendar changes, also when the resource calendar is late
	const { start, end } = buildIsoRangeForToday();
	await new Calendar(HIVE_CALENDAR_ID)
		.watchEvents(start, end, {
			id: crypto.randomUUID(),
			type: 'webhook',
			address: `https://${VERCEL_BRANCH_URL}/hive/api/telegram/agenda`,
			expiration: end.getTime().toString()
		})
		.catch((err) => console.error('agenda GET: could not watch the calendar', err));

	console.info('agenda GET: message sent successfully');
	return new Response(null, { status: 201 });
};

/** Google calendar webhook: something changed in the Hive calendar today. */
export const POST: RequestHandler = async ({ request: { headers } }) => {
	// "sync" only confirms that the watch exists
	if (headers.get('x-goog-resource-state') !== 'sync') {
		try {
			await refreshAgenda();
		} catch (err) {
			// not answering with an error: Google would only repeat the notification
			console.error(err);
		}
	}

	return new Response(null, { status: 202 });
};
