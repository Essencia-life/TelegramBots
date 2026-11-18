import { error, type RequestHandler } from '@sveltejs/kit';
import { BOT_HOME_GROUP_CHAT_ID } from '$env/static/private';
import { bot } from '$lib/server/orga/bot';
import users from '$lib/server/orga/users';

const GRACE_DAYS = 14;

/** Removes users from the chat GRACE_DAYS after their expire_date, without banning them. */
export const GET: RequestHandler = async () => {
	const limit = Date.now() / 1000 - GRACE_DAYS * 24 * 60 * 60;

	try {
		const due = (await users.getAll()).filter((u) => u.expire_date && u.expire_date < limit);

		for (const user of due) {
			try {
				// Unban on a current member kicks them but leaves them free to rejoin.
				await bot.api.unbanChatMember(BOT_HOME_GROUP_CHAT_ID, user.id!);
				await users.removeUser(user);
			} catch (err) {
				console.error('Could not remove user', user.id, err);
			}
		}
	} catch (err) {
		console.error(err);
		return error(500);
	}

	return new Response(null, { status: 204 });
};
