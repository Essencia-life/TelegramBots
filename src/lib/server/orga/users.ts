import { redis } from '$lib/server/redis';
import { VERCEL_ENV } from '$env/static/private';

export interface TelegramUser {
	id?: number;
	first_name: string;
	last_name?: string;
	username?: string;
	/** Telegram member tag shown in the chat */
	tag?: string;
	/** Unix seconds. The user is removed from the chat shortly after; unset/null keeps them forever. */
	expire_date?: number | null;
}

export const storageKeyPrefix = `orgaBot:${VERCEL_ENV}:member:`;
const legacyKeyPrefix = `essencia:${VERCEL_ENV}:telegram:user:`;

class Users {
	private migration?: Promise<void>;

	/**
	 * Moves users from the legacy key prefix on first use of this instance. Safe to run
	 * concurrently and repeatedly. Remove together with legacyKeyPrefix once every environment has run it.
	 */
	private migrate() {
		this.migration ??= this.moveLegacyKeys().catch((err) => {
			this.migration = undefined; // try again on the next call
			console.error('User key migration failed', err);
		});
		return this.migration;
	}

	private async moveLegacyKeys() {
		for (const key of await this.scan(legacyKeyPrefix)) {
			const newKey = storageKeyPrefix + key.slice(legacyKeyPrefix.length);
			// RENAMENX does not overwrite: a user that already exists under the new key is newer
			if ((await redis.renamenx(key, newKey)) === 0) {
				await redis.del(key);
			}
		}
	}

	async getAll() {
		await this.migrate();
		const keys = await this.scan(storageKeyPrefix);
		if (keys.length === 0) {
			return [];
		}

		const users = await redis.json.mget<TelegramUser[][]>(keys, '$');
		return users.map((u) => u?.[0]).filter(Boolean);
	}

	async addUser({ id, first_name, last_name, username, tag, expire_date }: TelegramUser) {
		await this.migrate();
		return redis.json.set(
			storageKeyPrefix + id,
			'$',
			JSON.stringify({ id, first_name, last_name, username, tag, expire_date })
		);
	}

	async removeUser({ id }: TelegramUser) {
		await this.migrate();
		return redis.json.del(storageKeyPrefix + id);
	}

	private async scan(prefix: string) {
		let cursor = 0;
		const keys: string[] = [];

		do {
			const [nextCursor, batch] = await redis.scan(cursor, {
				match: prefix + '*',
				count: 500
			});

			cursor = Number(nextCursor);
			keys.push(...batch);
		} while (cursor !== 0);

		return keys;
	}
}

export default new Users();
