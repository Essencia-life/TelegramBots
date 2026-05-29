import type { Bot } from 'grammy';
import users from '$lib/server/db/users';
import { BOT_GROUP_CHAT_ID } from '$env/static/private';

export class UsersBot {
	constructor(bot: Bot) {
		bot.on('chat_member', async (ctx) => {
			console.log(ctx.chatMember);

			if (ctx.chatMember.chat.id === parseInt(BOT_GROUP_CHAT_ID)) {
				const member = ctx.chatMember.new_chat_member;

				if (member.status === 'member' && !member.user.is_bot) {
					await users.addUser(ctx.chatMember.new_chat_member.user);
				} else if (member.status === 'left' || member.status === 'kicked') {
					await users.removeUser(ctx.chatMember.old_chat_member.user);
				}
			}
		});
	}
}
