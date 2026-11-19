import type { Bot } from 'grammy';
import { BOT_HOME_GROUP_CHAT_ID } from '$env/static/private';
import type { TelegramUser } from '../users';

/** A job of an event occurrence, as referenced by buttons and inline queries. */
export interface SlotTarget {
	type: string;
	date: string;
	jobKey: string;
}

export const slotPattern = '(?<type>[a-z0-9-]+):(?<date>\\d{8}):(?<jobKey>[a-z0-9]+)';

export async function isChatAdmin(bot: Bot, userId: number) {
	try {
		const { status } = await bot.api.getChatMember(BOT_HOME_GROUP_CHAT_ID, userId);
		return status === 'administrator' || status === 'creator';
	} catch {
		return false;
	}
}

// A chosen inline result arrives as a plain message that only carries what the result had, so the
// slot and the person travel in a hidden link on the first name (the result id is not part of the message).
const LINK = /^https:\/\/t\.me\/EssenciaOrgaBot\?start=assign_([a-z0-9-]+)_(\d{8})_([a-z0-9]+)_(\d+)$/;

export function personResult(user: TelegramUser, { type, date, jobKey }: SlotTarget) {
	return {
		type: 'article' as const,
		id: String(user.id),
		title: [user.first_name, user.last_name].join(' ').trim(),
		description: user.username ? `@${user.username}` : undefined,
		input_message_content: {
			message_text: user.first_name,
			entities: [
				{
					type: 'text_link' as const,
					offset: 0,
					length: user.first_name.length,
					url: `https://t.me/EssenciaOrgaBot?start=assign_${type}_${date}_${jobKey}_${user.id}`
				}
			]
		}
	};
}

export function parseChosen(message: { text: string; entities?: { type: string; url?: string }[] }) {
	for (const { type: entity, url } of message.entities ?? []) {
		const [, type, date, jobKey, userId] = (entity === 'text_link' && url?.match(LINK)) || [];
		if (type) return { target: { type, date, jobKey }, userId: Number(userId), firstName: message.text };
	}
	return null;
}
