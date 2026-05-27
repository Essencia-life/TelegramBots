import { redis } from '$lib/server/utils/redis';
import type { Category, Item, List, UserAction } from '$lib/schema';
import { storageKey } from '$lib/server/utils/config';
import type { UUID } from 'crypto';

export interface CheckCommand {
    itemId: string;
    userAction: UserAction;
}

export type CategoryCommand = Omit<Category, 'items'>;

class ListService {
    async initList(): Promise<void> {
        await redis.json.set(storageKey, '$', { list: [] }, { nx: true });
    }

    async getList(): Promise<List> {
        const list = await redis.json.get<List>(storageKey, '$.list.*') ?? [];

        return list.map(category => ({
            ...category,
            items: category.items.sort((a, b) => Number(b.checked) - Number(a.checked))
        }));
    }

    async getCompletedList(): Promise<List> {
        const list = await redis.json.get<List>(storageKey, '$.list.*') ?? [];

        return list.map(category => ({
            ...category,
            items: category.items.filter(item => item.checked)
        }));
    }

    async clearLists() {
        console.log('clearLists');
        await redis.json.clear(storageKey, '$.list..items');
    }

    async existsCategory(categoryId: string): Promise<boolean> {
        const [categoryExists] = await redis.json.type(storageKey, `$.list[?(@.id == "${categoryId}")]`)
        return !!categoryExists;
    }

    async addCategory(category: CategoryCommand): Promise<void> {
        await redis.json.arrappend(storageKey, '$.list', { ...category, items: [] });
    }

    async updateCategory(category: CategoryCommand) {
        await redis.json.mset({
            key: storageKey, path: `$.list[?(@.id == "${category.id}")].emoji`, value: JSON.stringify(category.emoji),
        }, {
            key: storageKey, path: `$.list[?(@.id == "${category.id}")].label`, value: JSON.stringify(category.label),
        });
    }

    async deleteCategory(categoryId: string) {
        await redis.json.del(storageKey, `$.list[?(@.id == "${categoryId}")]`);
    }

    async addItem(categoryId: string, item: Item): Promise<void> {
        console.log('addItem');
        await redis.json.arrappend(storageKey, `$.list[?(@.id == "${categoryId}")].items`, item);
    }

    async checkItem({ itemId, userAction }: CheckCommand): Promise<void> {
        console.log('checkItem');
        const itemPath = `$.list..items[?(@.id == "${itemId}")]`;

        await redis.json.set(storageKey, `${itemPath}.lastModified`, JSON.stringify(userAction));
        await redis.json.toggle(storageKey, `${itemPath}.checked`);
    }

    async updateItem(item: Item): Promise<void> {
        console.log('updateItem');
        await redis.json.set(storageKey, `$.list..items[?(@.id == "${item.id}")]`, JSON.stringify(item));
    }

    async updateItemCategory(categoryId: string, newCategoryId: string, item: Item) {
        console.log('updateItemCategory');
        await redis.json.arrappend(storageKey, `$.list[?(@.id == "${newCategoryId}")].items`, item);
        await redis.json.del(storageKey, `$.list[?(@.id == "${categoryId}")].items[?(@.id == "${item.id}")]`);
    }

    async deleteItem(itemId: UUID): Promise<void> {
        console.log('deleteItem', itemId);
        await redis.json.del(storageKey, `$.list..items[?(@.id == "${itemId}")]`);
    }

    async deleteCheckedItems(): Promise<void> {
        console.log('deleteCheckedItems');
        await redis.json.del(storageKey, `$.list..items[?(@.checked == true)]`);
    }
}

export default new ListService();