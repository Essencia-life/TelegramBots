import { bot } from '$lib/server/bot';
import { webhookCallback } from 'grammy';
import { BOT_SECRET_TOKEN } from '$env/static/private';
import { setupWebhookCallback } from '@repo/bot';

export const POST = webhookCallback(bot, 'sveltekit', {
	secretToken: BOT_SECRET_TOKEN
});

export const PUT = setupWebhookCallback(bot, BOT_SECRET_TOKEN, [
	// 'message',
	// 'edited_message',
	// "channel_post",
	// "edited_channel_post",
	// "business_connection",
	// "business_message",
	// "edited_business_message",
	// "deleted_business_messages",
	// 'inline_query',
	// 'chosen_inline_result',
	// 'callback_query',
	// "shipping_query",
	// "pre_checkout_query",
	// "purchased_paid_media",
	// "poll",
	// "poll_answer",
	// 'chat_member',
	// 'my_chat_member'
	// "chat_join_request",
	// "chat_boost",
	// "removed_chat_boost",
]);
