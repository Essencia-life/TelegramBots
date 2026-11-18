import type { ServerInit } from '@sveltejs/kit';
import { migrateStorageKey } from '$lib/server/shopping/utils/config';

export const init: ServerInit = async () => {
	await migrateStorageKey().catch((err) => console.error('Shopping key migration failed', err));
};

