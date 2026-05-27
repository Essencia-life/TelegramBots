import * as v from 'valibot';
import { command, query } from '$app/server';
import { updateLastMessage, sendNewList as sendNewListMessage } from '$lib/server/bot';
import inlineMessageIdService from '$lib/server/inlineMessageId.service';
import listService, { type CheckCommand } from '$lib/server/list.service';
import type { Item } from '$lib/schema';
import type { UUID } from 'crypto';

export const getList = query(() => listService.getList());

const checkItemCommandValidation = v.object({
    itemId: v.pipe(v.string(), v.uuid()),
    userAction: v.object({
        at: v.date(),
        by: v.object({
            id: v.number(),
            name: v.string(),
            username: v.optional(v.string())
        }),
    }),
});

const addItemCommandValidation = v.object({
    categoryId: v.string(),
    item: v.object({
        label: v.string(),
        amount: v.optional(v.number()),
        unit: v.optional(v.string()),
        personal: v.optional(v.boolean()),
        added: v.object({
            at: v.date(),
            by: v.object({
                id: v.number(),
                name: v.string(),
                username: v.optional(v.string())
            }),
        }),
    }),
});

const updateItemCommandValidation = v.object({
    categoryId: v.string(),
    newCategoryId: v.string(),
    item: v.object({
        id: v.pipe(v.string(), v.uuid()),
        label: v.string(),
        amount: v.optional(v.number()),
        unit: v.optional(v.string()),
        personal: v.optional(v.boolean()),
        checked: v.boolean(),
        added: v.object({
            at: v.date(),
            by: v.object({
                id: v.number(),
                name: v.string(),
                username: v.optional(v.string())
            }),
        }),
        lastModified: v.object({
            at: v.date(),
            by: v.object({
                id: v.number(),
                name: v.string(),
                username: v.optional(v.string())
            }),
        }),
    }),
});

export const checkListItem = command(checkItemCommandValidation, async (checkCommand: CheckCommand) => {
    await listService.checkItem(checkCommand);
    await updateLastMessage();
});

export const addListItem = command(addItemCommandValidation, async (addCommand) => {
    const item: Item = {
        id: crypto.randomUUID(),
        ...addCommand.item,
        checked: false
    }

    await listService.addItem(addCommand.categoryId, item);
    await updateLastMessage();
});

export const updateListItem = command(updateItemCommandValidation, async ({ categoryId, newCategoryId, item: { id: itemId, ...item } }) => {
    item.label = item.label.trim();

    if (!item.amount) {
        delete item.amount;
    }

    if (!item.unit) {
        delete item.unit;
    }

    if (!item.personal) {
        delete item.personal;
    }

    if (categoryId !== newCategoryId) {
        await listService.updateItemCategory(categoryId, newCategoryId, {
            id: itemId as UUID,
            ...item,
        });
    } else {
        await listService.updateItem({
            id: itemId as UUID,
            ...item,
        });
    }

    await updateLastMessage();
});

export const deleteListItem = command(v.pipe(v.string(), v.uuid()), async (itemId) => {
    await listService.deleteItem(itemId as UUID);
    await updateLastMessage();
});

export const completeList = command(v.boolean(), async (newList: boolean) => {
    await updateLastMessage(true, newList);
    await inlineMessageIdService.deleteId();
});

export const clearLists = command(async () => {
    await listService.clearLists()
})

export const deleteCheckedListItems = command(async () => {
    await listService.deleteCheckedItems();
});

export const sendNewList = command(async () => {
    await sendNewListMessage();
});
