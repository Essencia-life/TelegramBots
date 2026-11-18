import type { Bot } from 'grammy';
import users, { type TelegramUser } from '../users';
import { takeInvite } from '../invites';
import { BOT_HOME_GROUP_CHAT_ID } from '$env/static/private';

export class UsersBot {
	constructor(private bot: Bot) {
		bot.on('chat_member', async (ctx) => {
			console.log(ctx.chatMember);

			if (ctx.chatMember.chat.id === parseInt(BOT_HOME_GROUP_CHAT_ID)) {
				const member = ctx.chatMember.new_chat_member;

				if (member.status === 'member' && !member.user.is_bot) {
					await this.join(member.user, ctx.chatMember.invite_link?.invite_link);
				} else if (member.status === 'left' || member.status === 'kicked') {
					await users.removeUser(ctx.chatMember.old_chat_member.user);
				}
			}
		});
	}

	private async join(user: TelegramUser, link?: string) {
		const invite = link ? await takeInvite(link) : null;
		await users.addUser({ ...user, ...invite });
		if (!invite) return;

		try {
			// Needs the admin right can_manage_tags.
			await this.bot.api.setChatMemberTag(BOT_HOME_GROUP_CHAT_ID, user.id!, invite.tag);
		} catch (err) {
			console.error('Failed to tag invited member', err);
		}
	}
}
