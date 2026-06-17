import { BOT_TOKEN, BOT_ADMIN_CHAT_ID } from '$env/static/private';
import { Bot } from 'grammy';
import { Calendar } from 'telegram-inline-calendar';
import { errorHandlerCallback } from '@repo/bot';

export const bot = new Bot(BOT_TOKEN);

const calendar = new Calendar(bot, {
    date_format: 'DD-MM-YYYY',
    language: 'en',
    bot_api: 'grammy'
});

bot.command('start', ctx => calendar.startNavCalendar(ctx))

bot.on("callback_query:data", (ctx) => {
    if (ctx.chat?.id && ctx.msg?.message_id == calendar.chats.get(ctx.chat?.id)) {
        var res;
        res = calendar.clickButtonCalendar(ctx);
        if (res !== -1) {
            ctx.reply("You selected: " + res);
        }
    }
});

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
