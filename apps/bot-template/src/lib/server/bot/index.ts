import { BOT_TOKEN, BOT_ADMIN_CHAT_ID } from '$env/static/private';
import { Bot } from 'grammy';
import { errorHandlerCallback } from '@repo/bot';

export const bot = new Bot(BOT_TOKEN);

bot.command('start', async (ctx) => {
	await ctx.reply('Hallo');
});

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
