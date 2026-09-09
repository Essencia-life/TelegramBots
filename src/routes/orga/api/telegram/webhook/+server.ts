import { bot } from '$lib/server/orga/bot';
import { webhookCallback } from 'grammy';
import { ORGA_BOT_SECRET_TOKEN } from '$env/static/private';
import { checkWebhookCallback, setupWebhookCallback } from '$lib/server/bot-utils';

export const POST = webhookCallback(bot, 'sveltekit', {
	secretToken: ORGA_BOT_SECRET_TOKEN
});

export const GET = checkWebhookCallback(bot);

export const PUT = setupWebhookCallback(bot, ORGA_BOT_SECRET_TOKEN, [
	'message',
	'callback_query',
	'chat_member',
	'my_chat_member'
]);
