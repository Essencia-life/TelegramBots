import { z } from 'zod';
import { command, form } from '$app/server';
import listService from '$lib/server/shopping/list.service';
import { storageKey } from '$lib/server/shopping/utils/config';
import { redis } from '$lib/server/redis';
import type { UUID } from 'crypto';
import { emojiRegex } from '$lib/client/shopping/utils';
import { getSession } from '$lib/server/session';
import { getList } from '../../../list.remote';
import { updateLastMessage } from '$lib/server/shopping/bot';
import { SHOPPING_BOT_TOKEN } from '$env/static/private';

const zUuid = z.uuid().transform((str) => str as UUID);

const zSetCategory = z.object({
	id: zUuid.optional(),
	emoji: z.string().regex(emojiRegex),
	label: z.string()
});

export type SetCategoryInput = z.input<typeof zSetCategory>;

export const setCategory = form(zSetCategory, async (category) => {
	getSession(SHOPPING_BOT_TOKEN);

	if (category.id) {
		await listService.updateCategory({
			id: category.id,
			...category
		});
	} else {
		const storageExists = await redis.exists(storageKey);

		if (!storageExists) {
			await listService.initList();
		}

		await listService.addCategory({
			...category,
			id: crypto.randomUUID()
		});
	}

	await updateLastMessage();
	void getList().refresh();
});

export const deleteCategory = command(zUuid, async (categoryId) => {
	getSession(SHOPPING_BOT_TOKEN);

	await listService.deleteCategory(categoryId);

	void getList().refresh();
});

export const moveCategory = command(
	z.object({ categoryId: zUuid, insertIndex: z.int() }),
	async ({ categoryId, insertIndex }) => {
		getSession(SHOPPING_BOT_TOKEN);

		await listService.moveCategory(categoryId, insertIndex);

		await updateLastMessage();
		void getList().refresh();
	}
);
