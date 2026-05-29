import { BOT_ADMIN_CHAT_ID, BOT_TOKEN } from '$env/static/private';
import { Bot } from 'grammy';
import { UsersBot } from '$lib/server/bot/users';
import { AgendaBot } from '$lib/server/bot/agenda';
import { WeekPlanBot } from '$lib/server/bot/weekPlan';
import { errorHandlerCallback } from '@repo/bot';

export const bot = new Bot(BOT_TOKEN);
export const usersBot = new UsersBot(bot);
export const agendaBot = new AgendaBot(bot);
export const weekPlanBot = new WeekPlanBot(bot);

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
