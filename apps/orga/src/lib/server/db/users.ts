import { redis } from '$lib/server/db/redis.ts';
import { VERCEL_ENV } from '$env/static/private';

export interface TelegramUser {
	id?: number;
	first_name: string;
	last_name?: string;
	username?: string;
}

export const storageKeyPrefix = `essencia:${VERCEL_ENV}:telegram:user:`;

class Users {
	async getAll() {
		const keys = await this.getAllKeys();
		if (keys.length === 0) {
			return [];
		}

		const users = await redis.json.mget<TelegramUser[][]>(keys, '$');
		return users.map((u) => u?.[0]).filter(Boolean);
	}

	async addUser({ id, first_name, last_name, username }: TelegramUser) {
		return redis.json.set(
			storageKeyPrefix + id,
			'$',
			JSON.stringify({ id, first_name, last_name, username })
		);
	}

	async removeUser({ id }: TelegramUser) {
		return redis.json.del(storageKeyPrefix + id);
	}

	private async getAllKeys() {
		let cursor = 0;
		const keys: string[] = [];

		do {
			const [nextCursor, batch] = await redis.scan(cursor, {
				match: storageKeyPrefix + '*',
				count: 500
			});

			cursor = Number(nextCursor);
			keys.push(...batch);
		} while (cursor !== 0);

		return keys;
	}
}

export default new Users();
