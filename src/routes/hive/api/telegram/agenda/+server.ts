import type { RequestHandler } from './$types';
import { bot } from '$lib/server/hive/bot';
import { InlineKeyboard } from 'grammy';
import { HIVE_BOT_GROUP_CHAT_ID, HIVE_BOT_TOPIC_ID, VERCEL_ENV } from '$env/static/private';
import { redis } from '$lib/server/redis';
import { generateAgenda } from '$lib/server/hive/agenda';

export const GET: RequestHandler = async () => {
	const text = await generateAgenda();

	if (!text) {
		console.info('agenda GET: no events, returning 204 without sending message');
		return new Response(null, { status: 204 });
	}

	console.info(
		'agenda GET: sending message to telegram group',
		HIVE_BOT_GROUP_CHAT_ID,
		'topic',
		HIVE_BOT_TOPIC_ID
	);

	// TODO check redis for existing message ID and update instead
	// TODO register agenda endpoint as webhook via calendar.events.watch
	const message = await bot.api.sendMessage(HIVE_BOT_GROUP_CHAT_ID, text, {
		parse_mode: 'HTML',
		message_thread_id: Number(HIVE_BOT_TOPIC_ID),
		reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
	});

	await redis.set(`essencia:${VERCEL_ENV}:hiveBotAgendaMessageId`, message.message_id, {
		exat: new Date().setHours(23, 59, 59, 999)
	});

	console.info('agenda GET: message sent successfully');
	return new Response(null, { status: 201 });
};
