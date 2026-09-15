import { BOT_ADMIN_CHAT_ID, ORGA_BOT_TOKEN } from '$env/static/private';
import { Bot } from 'grammy';
import { UsersBot } from './users';
import { AgendaBot } from './agenda';
import { WeekPlanBot } from './weekPlan';
import { SpamProtectionBot } from './spam-protection';
import { errorHandlerCallback } from '$lib/server/bot-utils';

export const bot = new Bot(ORGA_BOT_TOKEN);
export const usersBot = new UsersBot(bot);
export const agendaBot = new AgendaBot(bot);
export const weekPlanBot = new WeekPlanBot(bot);
export const spamProtectionBot = new SpamProtectionBot(bot);

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
