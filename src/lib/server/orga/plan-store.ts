import { redis } from '$lib/server/redis';
import type { TelegramUser } from './users';

/**
 * Sign-ups live in Redis, not in the calendar: calendar series cannot keep them safely
 * (time changes and "this and following" edits drop or move per-instance data).
 * One hash per event occurrence, keyed by event `type` and local date (yyyymmdd):
 *   p:{job}:{userId} = "{timestamp}|{first_name}"   d:{job} = details
 */

export interface JobPlan {
	persons: TelegramUser[];
	details?: string;
}
export type Plan = Record<string, JobPlan>;

const planKey = (type: string, date: string) => `essencia:orga:plan:${type}:${date}`;
const TTL = 60 * 24 * 3600;

// Returns 1 = signed up, 2 = was already signed up, 0 = job is full
const ASSIGN = `
local prefix = 'p:' .. ARGV[1] .. ':'
local n = 0
for _, k in ipairs(redis.call('HKEYS', KEYS[1])) do
	if k == prefix .. ARGV[3] then return 2 end
	if string.sub(k, 1, #prefix) == prefix then n = n + 1 end
end
if n >= tonumber(ARGV[2]) then return 0 end
redis.call('HSET', KEYS[1], prefix .. ARGV[3], ARGV[4])
redis.call('EXPIRE', KEYS[1], ${TTL})
return 1`;

// Removes the sign-up; the details go with the last person
const UNASSIGN = `
redis.call('HDEL', KEYS[1], 'p:' .. ARGV[1] .. ':' .. ARGV[2])
local prefix = 'p:' .. ARGV[1] .. ':'
for _, k in ipairs(redis.call('HKEYS', KEYS[1])) do
	if string.sub(k, 1, #prefix) == prefix then return 1 end
end
redis.call('HDEL', KEYS[1], 'd:' .. ARGV[1])
return 1`;

export type AssignResult = 'assigned' | 'already' | 'full';

export async function assign(type: string, date: string, job: string, slots: number, user: TelegramUser) {
	const r = await redis.eval<string[], number>(
		ASSIGN,
		[planKey(type, date)],
		[job, String(slots), String(user.id), `${Date.now()}|${user.first_name}`]
	);
	return (['full', 'assigned', 'already'] as const)[r] satisfies AssignResult;
}

export async function unassign(type: string, date: string, job: string, user: TelegramUser) {
	await redis.eval(UNASSIGN, [planKey(type, date)], [job, String(user.id)]);
}

export async function setDetails(type: string, date: string, job: string, details: string) {
	await redis.hset(planKey(type, date), { [`d:${job}`]: details });
}

export function parsePlan(hash: Record<string, unknown> | null): Plan {
	const plan: Plan = {};
	const people: Record<string, [number, TelegramUser][]> = {};
	for (const [field, value] of Object.entries(hash ?? {})) {
		const [kind, job, id] = field.split(':');
		if (kind === 'd') (plan[job] ??= { persons: [] }).details = String(value);
		if (kind !== 'p') continue;
		const [ts, ...name] = String(value).split('|');
		(people[job] ??= []).push([Number(ts), { id: Number(id), first_name: name.join('|') }]);
	}
	for (const [job, list] of Object.entries(people)) {
		(plan[job] ??= { persons: [] }).persons = list.sort((a, b) => a[0] - b[0]).map(([, u]) => u);
	}
	return plan;
}

export async function getPlan(type: string, date: string): Promise<Plan> {
	return parsePlan(await redis.hgetall(planKey(type, date)));
}

// message ids, to edit the posts after a sign-up (the calendar no longer changes when people sign up)
export const setMessageId = (kind: 'week' | 'agenda', date: string, id: number) =>
	redis.set(`essencia:orga:${kind}msg:${date}`, id, { ex: TTL });
export const getMessageId = (kind: 'week' | 'agenda', date: string) =>
	redis.get<number>(`essencia:orga:${kind}msg:${date}`);
