import { z } from 'zod';
import { command } from '$app/server';
import listService from '$lib/server/list.service';
import { storageKey } from '$lib/server/utils/config';
import { redis } from '$lib/server/utils/redis';
import type { UUID } from 'crypto';

const createCategoryCommand = z.object({
	label: z.string(),
	emoji: z.string()
});

const updateCategoryCommand = z.object({
	id: z.uuid().transform((str) => str as UUID),
	label: z.string(),
	emoji: z.string()
});

export const createCategory = command(createCategoryCommand, async (createCategory) => {
	const storageExists = await redis.exists(storageKey);
	if (!storageExists) {
		await listService.initList();
	}

	const category = {
		id: crypto.randomUUID(),
		...createCategory
	};

	await listService.addCategory(category);
});

export const updateCategory = command(updateCategoryCommand, async (updateCategoryCommand) => {
	await listService.updateCategory(updateCategoryCommand);
});

export const deleteCategory = command(z.uuid(), async (categoryId) => {
	await listService.deleteCategory(categoryId);
});
