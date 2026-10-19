import { z } from 'zod';
import { command, form } from '$app/server';
import type { UUID } from 'crypto';
import listService from '$lib/server/shopping/list.service'; // TODO move into route as list.server.ts?
import { updateLastMessage } from '$lib/server/shopping/bot';
import { getList } from '../../../list.remote';
import { error } from '@sveltejs/kit';
import { getSession } from '$lib/server/session';
import { SHOPPING_BOT_TOKEN } from '$env/static/private';

const zUuid = z.uuid().transform((str) => str as UUID);

const zSetItem = z.object({
	id: zUuid.optional(),
	categoryId: zUuid,
	previousCategoryId: zUuid.optional(),
	label: z.string().trim().min(1),
	amount: z.number().optional(),
	unit: z.string().optional(),
	personal: z.boolean().optional()
});

export type SetItemInput = z.input<typeof zSetItem>;

export const setItem = form(
	zSetItem,
	async ({ id, categoryId, previousCategoryId, ...updates }) => {
		const { user } = getSession(SHOPPING_BOT_TOKEN);

		if (id) {
			const item = await listService.getItem(id);

			if (!item) {
				return error(404, 'Item not found');
			}

			if (previousCategoryId && previousCategoryId !== categoryId) {
				await listService.updateItemAndCategory(previousCategoryId, categoryId, {
					...item,
					...updates,
					lastModified: {
						by: {
							id: user.id,
							name: user.first_name,
							username: user.username
						},
						at: new Date()
					}
				});
			} else {
				await listService.updateItem({
					...item,
					...updates,
					lastModified: {
						by: {
							id: user.id,
							name: user.first_name,
							username: user.username
						},
						at: new Date()
					}
				});
			}
		} else {
			await listService.addItem(categoryId, {
				id: crypto.randomUUID(),
				...updates,
				checked: false,
				added: {
					by: {
						id: user.id,
						name: user.first_name,
						username: user.username
					},
					at: new Date()
				}
			});
		}

		await updateLastMessage();
		void getList().refresh();
	}
);

export const deleteItem = command(zUuid, async (id) => {
	getSession(SHOPPING_BOT_TOKEN);

	await listService.deleteItem(id);

	await updateLastMessage();
	void getList().refresh();
});
