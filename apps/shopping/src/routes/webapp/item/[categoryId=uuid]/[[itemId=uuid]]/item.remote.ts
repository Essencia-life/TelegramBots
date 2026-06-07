import { z } from 'zod';
import { command, form, getRequestEvent } from '$app/server';
import type { UUID } from 'crypto';
import listService from '$lib/server/list.service';
import { updateLastMessage } from '$lib/server/bot';
import { getList } from '../../../list.remote';
import { error } from '@sveltejs/kit';
import { getSession } from '$lib/server/session';

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
		const { cookies } = getRequestEvent();
		const { user } = getSession(cookies);

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
	const { cookies } = getRequestEvent();
	getSession(cookies);

	await listService.deleteItem(id);

	await updateLastMessage();
	void getList().refresh();
});
