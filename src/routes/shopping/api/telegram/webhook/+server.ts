import { bot } from '$lib/server/shopping/bot';
import { webhookCallback } from 'grammy';
import { SHOPPING_BOT_SECRET_TOKEN } from '$env/static/private';
import { checkWebhookCallback, setupWebhookCallback } from '$lib/server/bot-utils';

export const POST = webhookCallback(bot, 'sveltekit', {
	secretToken: SHOPPING_BOT_SECRET_TOKEN
});

export const GET = checkWebhookCallback(bot);

export const PUT = setupWebhookCallback(bot, SHOPPING_BOT_SECRET_TOKEN, [
	'message',
	'inline_query',
	'chosen_inline_result',
	'my_chat_member'
]);
