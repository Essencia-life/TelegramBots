import { VERCEL_ENV } from '$env/static/private';
import { redis } from '$lib/server/redis';

export const storageKey = `shoppingBot:${VERCEL_ENV}`;
const legacyStorageKey = `essencia-shopping-bot:${VERCEL_ENV}`;

/**
 * Moves the list from the legacy key. Runs once on server start (hooks.server.ts init),
 * is idempotent and never overwrites existing data. Remove with legacyStorageKey once every
 * environment has started with it.
 */
export async function migrateStorageKey() {
	if (!(await redis.exists(legacyStorageKey))) return;

	if ((await redis.renamenx(legacyStorageKey, storageKey)) === 0) {
		console.warn(`${storageKey} already exists, left ${legacyStorageKey} untouched`);
	}
}
