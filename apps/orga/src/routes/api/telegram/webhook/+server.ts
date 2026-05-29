import { bot } from '$lib/server/bot';
import { webhookCallback } from 'grammy';
import { BOT_SECRET_TOKEN } from '$env/static/private';
import { checkWebhookCallback, setupWebhookCallback } from '@repo/bot';

export const POST = webhookCallback(bot, 'sveltekit', {
	secretToken: BOT_SECRET_TOKEN
});

export const GET = checkWebhookCallback(bot);

export const PUT = setupWebhookCallback(bot, BOT_SECRET_TOKEN, [
	'message',
	'callback_query',
	'chat_member',
	'my_chat_member'
]);
