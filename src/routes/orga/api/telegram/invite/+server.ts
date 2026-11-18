import { error, json, type RequestHandler } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BOT_HOME_GROUP_CHAT_ID, ORGA_BOT_INVITE_SECRET_TOKEN } from '$env/static/private';
import { bot } from '$lib/server/orga/bot';
import { endOfDay, saveInvite, visitorTags } from '$lib/server/orga/invites';

const query = z.object({
	name: z.string().trim().min(1).max(32), // Telegram limit for invite link names
	departure: z.iso.date(),
	type: z.enum(['guest', 'volunteer'])
});

function validToken(token: string | null) {
	const a = Buffer.from(token ?? '');
	const b = Buffer.from(ORGA_BOT_INVITE_SECRET_TOKEN);
	return a.length === b.length && timingSafeEqual(a, b);
}

export const GET: RequestHandler = async ({ request, url }) => {
	if (!ORGA_BOT_INVITE_SECRET_TOKEN || !validToken(request.headers.get('x-secret-token'))) {
		return error(401);
	}

	const parsed = query.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return error(400, parsed.error.message);
	}
	const { name, departure, type } = parsed.data;

	const expire_date = endOfDay(departure);
	if (expire_date <= Date.now() / 1000) {
		return error(400, 'departure must not be in the past');
	}

	try {
		const { invite_link } = await bot.api.createChatInviteLink(BOT_HOME_GROUP_CHAT_ID, {
			name,
			expire_date,
			member_limit: 1
		});
		await saveInvite(invite_link, { tag: visitorTags[type], expire_date });
		return json({ invite_link });
	} catch (err) {
		console.error(err);
		return error(500);
	}
};
