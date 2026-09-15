import type { Bot } from 'grammy';
import { createHash } from 'node:crypto';
import { BOT_HOME_GROUP_CHAT_ID, VERCEL_ENV } from '$env/static/private';
import { redis } from '$lib/server/redis';
import ms from 'ms';

const moreThanThreeWords = (text: string) => text.trim().split(/\s+/, 4).length > 3;

export class SpamProtectionBot {
	constructor(bot: Bot) {
		bot.on('message', async (ctx) => {
			if (ctx.chatId === parseInt(BOT_HOME_GROUP_CHAT_ID) && ctx.message.text && moreThanThreeWords(ctx.message.text)) {
				const user = ctx.message.from;
				const hash = createHash('sha256').update(ctx.message.text, 'utf8').digest('hex');

				const created = await redis.set(
					`orgaBot:${VERCEL_ENV}:message:${user.id}:${hash}`,
					ctx.message.message_thread_id,
					{
						nx: true,
						ex: ms('4h')
					}
				);

				if (!created) {
					await ctx.reply(
						`Hi ${user.first_name}, your message has been automatically deleted by spam protection.\n\nKindly avoid sending the same message multiple times or posting it across different chat topics. This helps keep conversations clear, organized and relevant. Thank you.`,
						{
							message_thread_id: ctx.message.message_thread_id,
							ephemeral_message_parameters: {
								receiver_user_id: user.id
							},
						}
					);

					await ctx.deleteMessage();
				}
			}
		});
	}
}
