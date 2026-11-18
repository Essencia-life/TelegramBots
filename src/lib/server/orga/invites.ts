import { redis } from '$lib/server/redis';
import { VERCEL_ENV } from '$env/static/private';

export type VisitorType = 'guest' | 'volunteer';

// Telegram member tags: max 16 chars, no emoji
export const visitorTags: Record<VisitorType, string> = { guest: 'Guest', volunteer: 'Volunteer' };

const timeZone = 'Europe/Lisbon';
const key = (link: string) => `essencia:${VERCEL_ENV}:telegram:invite:${link}`;

/** Unix seconds of the end of the given day (YYYY-MM-DD) in Lisbon. */
export function endOfDay(date: string): number {
	const utc = Date.parse(`${date}T23:59:59Z`);
	// Offset of Lisbon at that moment, derived by formatting the UTC instant in Lisbon.
	const lisbon = new Date(utc).toLocaleString('sv-SE', { timeZone }).replace(' ', 'T') + 'Z';
	return Math.floor((utc - (Date.parse(lisbon) - utc)) / 1000);
}

/** What a user inherits when joining via the invite link. */
export interface Invite {
	memberTag: string;
	expire_date: number;
}

export async function saveInvite(link: string, invite: Invite) {
	await redis.set(key(link), invite, { exat: invite.expire_date });
}

export async function takeInvite(link: string) {
	return redis.getdel<Invite>(key(link));
}
