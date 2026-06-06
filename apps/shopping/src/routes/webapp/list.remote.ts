import { command, getRequestEvent, query } from '$app/server';
import type { User } from '$lib/schema';
import { updateLastMessage, sendNewList as sendNewListMessage } from '$lib/server/bot';
import inlineMessageIdService from '$lib/server/inlineMessageId.service';
import listService, { type CheckCommand } from '$lib/server/list.service';
import { error } from '@sveltejs/kit';
import type { UUID } from 'crypto';
import z from 'zod';

export const getList = query(() => listService.getList());

const zUuid = z.uuid().transform((str) => str as UUID);

export const checkListItem = command(zUuid, async (itemId) => {
	const { cookies } = getRequestEvent();
	const user: User = JSON.parse(cookies.get('user') ?? 'null');

	if (!user) {
		return error(401, 'Unauthorized');
	}

	await listService.checkItem({
		itemId,
		userAction: {
			at: new Date(),
			by: user
		}
	});

	await updateLastMessage();
	void getList().refresh();
});

export const completeList = command(z.boolean(), async (newList: boolean) => {
	await updateLastMessage(true, newList);
	await inlineMessageIdService.deleteId();
});

export const clearLists = command(async () => {
	await listService.clearLists();
});

export const deleteCheckedListItems = command(async () => {
	await listService.deleteCheckedItems();
});

export const sendNewList = command(async () => {
	await sendNewListMessage();
});
