import { command, query } from '$app/server';
import { updateLastMessage, sendNewList as sendNewListMessage } from '$lib/server/shopping/bot';
import inlineMessageIdService from '$lib/server/shopping/inlineMessageId.service';
import listService from '$lib/server/shopping/list.service';
import type { UUID } from 'crypto';
import z from 'zod';
import { getSession } from '$lib/server/session';
import { SHOPPING_BOT_TOKEN } from '$env/static/private';

export const getList = query(() => {
	getSession(SHOPPING_BOT_TOKEN);

	return listService.getList();
});

const zUuid = z.uuid().transform((str) => str as UUID);

export const checkListItem = command(zUuid, async (itemId) => {
	const { user } = getSession(SHOPPING_BOT_TOKEN);

	await listService.checkItem({
		itemId,
		userAction: {
			at: new Date(),
			by: {
				id: user.id,
				name: user.first_name,
				username: user.username
			}
		}
	});

	await updateLastMessage();
	void getList().refresh();
});

const zMoveListItemInput = z.object({
	id: zUuid,
	categoryId: zUuid,
	before: zUuid.optional(),
	after: zUuid.optional()
});

export const moveListItem = command(zMoveListItemInput, async ({ id, categoryId, ...insert }) => {
	getSession(SHOPPING_BOT_TOKEN);

	await listService.moveItemInsideCategory(categoryId, id, insert);

	await updateLastMessage();
	void getList().refresh();
});

export const completeList = command(z.boolean(), async (newList: boolean) => {
	getSession(SHOPPING_BOT_TOKEN);

	await updateLastMessage(true, newList);
	await inlineMessageIdService.deleteId();
});

export const clearLists = command(async () => {
	getSession(SHOPPING_BOT_TOKEN);

	await listService.clearLists();
});

export const deleteCheckedListItems = command(async () => {
	getSession(SHOPPING_BOT_TOKEN);

	await listService.deleteCheckedItems();
});

export const sendNewList = command(async () => {
	getSession(SHOPPING_BOT_TOKEN);

	await sendNewListMessage();
});
