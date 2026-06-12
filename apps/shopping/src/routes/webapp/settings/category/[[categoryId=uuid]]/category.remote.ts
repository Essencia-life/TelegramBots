import { z } from 'zod';
import { command, form, getRequestEvent } from '$app/server';
import listService from '$lib/server/list.service';
import { storageKey } from '$lib/server/utils/config';
import { redis } from '$lib/server/utils/redis';
import type { UUID } from 'crypto';
import { emojiRegex } from '$lib/utils';
import { getSession } from '$lib/server/session';
import { getList } from '../../../list.remote';
import { updateLastMessage } from '$lib/server/bot';

const zUuid = z.uuid().transform((str) => str as UUID);

const zSetCategory = z.object({
	id: zUuid.optional(),
	emoji: z.string().regex(emojiRegex),
	label: z.string()
});

export type SetCategoryInput = z.input<typeof zSetCategory>;

export const setCategory = form(zSetCategory, async (category) => {
	const { cookies } = getRequestEvent();
	getSession(cookies);

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
	const { cookies } = getRequestEvent();
	getSession(cookies);

	await listService.deleteCategory(categoryId);

	void getList().refresh();
});

export const moveCategory = command(
	z.object({ categoryId: zUuid, insertIndex: z.int() }),
	async ({ categoryId, insertIndex }) => {
		const { cookies } = getRequestEvent();
		getSession(cookies);

		await listService.moveCategory(categoryId, insertIndex);

		await updateLastMessage();
		void getList().refresh();
	}
);
