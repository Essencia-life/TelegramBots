import { command, getRequestEvent, query } from '$app/server';
import { updateLastMessage, sendNewList as sendNewListMessage } from '$lib/server/bot';
import inlineMessageIdService from '$lib/server/inlineMessageId.service';
import listService from '$lib/server/list.service';
import type { UUID } from 'crypto';
import z from 'zod';
import { getSession } from '$lib/server/session';

export const getList = query(() => {
	const { cookies } = getRequestEvent();
	getSession(cookies);

	return listService.getList();
});

const zUuid = z.uuid().transform((str) => str as UUID);

export const checkListItem = command(zUuid, async (itemId) => {
	const { cookies } = getRequestEvent();
	const { user } = getSession(cookies);

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
	const { cookies } = getRequestEvent();
	getSession(cookies);

	await listService.moveItemInsideCategory(categoryId, id, insert);

	await updateLastMessage();
	void getList().refresh();
});

export const completeList = command(z.boolean(), async (newList: boolean) => {
	const { cookies } = getRequestEvent();
	getSession(cookies);

	await updateLastMessage(true, newList);
	await inlineMessageIdService.deleteId();
});

export const clearLists = command(async () => {
	const { cookies } = getRequestEvent();
	getSession(cookies);

	await listService.clearLists();
});

export const deleteCheckedListItems = command(async () => {
	const { cookies } = getRequestEvent();
	getSession(cookies);

	await listService.deleteCheckedItems();
});

export const sendNewList = command(async () => {
	const { cookies } = getRequestEvent();
	getSession(cookies);

	await sendNewListMessage();
});
