import type { Bot } from 'grammy';
import users from '../users';
import { takeInvite, visitorTags } from '../invites';
import { BOT_HOME_GROUP_CHAT_ID } from '$env/static/private';

type Raw = { setChatMemberTag(params: object): Promise<unknown> };

export class UsersBot {
	constructor(private bot: Bot) {
		bot.on('chat_member', async (ctx) => {
			console.log(ctx.chatMember);

			if (ctx.chatMember.chat.id === parseInt(BOT_HOME_GROUP_CHAT_ID)) {
				const member = ctx.chatMember.new_chat_member;

				if (member.status === 'member' && !member.user.is_bot) {
					await users.addUser(ctx.chatMember.new_chat_member.user);
					await this.tagVisitor(ctx.chatMember.invite_link?.invite_link, member.user.id);
				} else if (member.status === 'left' || member.status === 'kicked') {
					await users.removeUser(ctx.chatMember.old_chat_member.user);
				}
			}
		});
	}

	private async tagVisitor(link: string | undefined, userId: number) {
		if (!link) return;
		try {
			const type = await takeInvite(link);
			if (!type) return;
			// Bot API 9.5; not in the typings of the locked grammY version. Needs admin right can_manage_tags.
			await (this.bot.api.raw as unknown as Raw).setChatMemberTag({
				chat_id: BOT_HOME_GROUP_CHAT_ID,
				user_id: userId,
				tag: visitorTags[type]
			});
		} catch (err) {
			console.error('Failed to tag invited member', err);
		}
	}
}
