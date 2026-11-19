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

// A chosen inline contact arrives as a plain message that only carries what the result had,
// so the slot and the person travel in the vCard (the result id is not part of the message).
const NOTE = /NOTE:essencia-plan:([a-z0-9-]+):(\d{8}):([a-z0-9]+):(\d+)/;

export function contactResult(user: TelegramUser, { type, date, jobKey }: SlotTarget) {
	return {
		type: 'contact' as const,
		id: String(user.id),
		phone_number: user.username ? `@${user.username}` : '-',
		first_name: user.first_name,
		last_name: user.last_name,
		vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${[user.first_name, user.last_name].join(' ').trim()}\nNOTE:essencia-plan:${type}:${date}:${jobKey}:${user.id}\nEND:VCARD`
	};
}

export function parseContact(vcard?: string) {
	const [, type, date, jobKey, userId] = vcard?.match(NOTE) ?? [];
	return type ? { target: { type, date, jobKey }, userId: Number(userId) } : null;
}
