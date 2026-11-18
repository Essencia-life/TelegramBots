import { DateTime } from 'luxon';
import { redis } from '$lib/server/redis';
import { VERCEL_ENV } from '$env/static/private';

export type VisitorType = 'guest' | 'volunteer';

// Telegram member tags: max 16 chars, no emoji
export const visitorTags: Record<VisitorType, string> = { guest: 'Guest', volunteer: 'Volunteer' };

const timeZone = 'Europe/Lisbon';
const key = (link: string) => `orgaBot:${VERCEL_ENV}:invite:${link.replace('https://t.me/', '')}`;

/** Unix seconds of the end of the given day (YYYY-MM-DD) in Lisbon. */
export const endOfDay = (date: string) =>
	Math.floor(DateTime.fromISO(date, { zone: timeZone }).endOf('day').toSeconds());

/** What a user inherits when joining via the invite link. */
export interface Invite {
	tag: string;
	expire_date: number;
}

export async function saveInvite(link: string, invite: Invite) {
	await redis.set(key(link), invite, { exat: invite.expire_date });
}

export async function takeInvite(link: string) {
	return redis.getdel<Invite>(key(link));
}
