import { bot } from '$lib/server/booking/bot';
import { webhookCallback } from 'grammy';
import { BOOKING_BOT_SECRET_TOKEN } from '$env/static/private';
import { checkWebhookCallback, setupWebhookCallback } from '$lib/server/bot-utils';

export const POST = webhookCallback(bot, 'sveltekit', {
	secretToken: BOOKING_BOT_SECRET_TOKEN
});

export const GET = checkWebhookCallback(bot);

export const PUT = setupWebhookCallback(bot, BOOKING_BOT_SECRET_TOKEN, [
	'message',
	'inline_query',
	'chosen_inline_result',
	'my_chat_member'
]);
