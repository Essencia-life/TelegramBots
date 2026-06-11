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
		return (await redis.json.get<List>(storageKey, '$.list.*')) ?? [];
	}

	async getCompletedList(): Promise<List> {
		const list = (await redis.json.get<List>(storageKey, '$.list.*')) ?? [];

		return list.map((category) => ({
			...category,
			items: category.items.filter((item) => item.checked)
		}));
	}

	async clearLists() {
		console.log('clearLists');
		await redis.json.clear(storageKey, '$.list..items');
	}

	async addCategory(category: CategoryCommand): Promise<void> {
		console.log('addCategory', { category });
		await redis.json.arrappend(storageKey, '$.list', { ...category, items: [] });
	}

	async updateCategory(category: CategoryCommand) {
		console.log('updateCategory', { category });

		await redis.json.mset(
			{
				key: storageKey,
				path: `$.list[?(@.id == "${category.id}")].emoji`,
				value: JSON.stringify(category.emoji)
			},
			{
				key: storageKey,
				path: `$.list[?(@.id == "${category.id}")].label`,
				value: JSON.stringify(category.label)
			}
		);
	}

	async deleteCategory(categoryId: UUID) {
		console.log('deleteCategory', { categoryId });
		await redis.json.del(storageKey, `$.list[?(@.id == "${categoryId}")]`);
	}

	async moveCategory(categoryId: UUID, insertIndex: number) {
		console.log('moveCategory', { categoryId, insertIndex });

		const [category] = await redis.json.get<Category[]>(storageKey, `$.list[?(@.id == "${categoryId}")]`) ?? [];

		if (!category) {
			return;
		}

		await redis.json.del(storageKey, `$.list[?(@.id == "${categoryId}")]`);
		await redis.json.arrinsert(storageKey, `$.list`, insertIndex, category);
	}

	async getItem(itemId: UUID): Promise<Item | undefined> {
		console.log('getItem', { itemId });
		const [item] =
			(await redis.json.get<Item[]>(storageKey, `$.list..items[?(@.id == "${itemId}")]`)) ?? [];
		return item;
	}

	async addItem(categoryId: string, item: Item): Promise<void> {
		console.log('addItem', { categoryId, item });
		await redis.json.arrappend(storageKey, `$.list[?(@.id == "${categoryId}")].items`, item);
	}

	async checkItem({ itemId, userAction }: CheckCommand): Promise<void> {
		console.log('checkItem', { itemId });
		const itemPath = `$.list..items[?(@.id == "${itemId}")]`;

		await redis.json.set(storageKey, `${itemPath}.lastModified`, JSON.stringify(userAction));
		await redis.json.toggle(storageKey, `${itemPath}.checked`);
	}

	async updateItem(item: Item): Promise<void> {
		console.log('updateItem', { item });
		await redis.json.set(
			storageKey,
			`$.list..items[?(@.id == "${item.id}")]`,
			JSON.stringify(item)
		);
	}

	async updateItemAndCategory(categoryId: string, newCategoryId: string, item: Item) {
		console.log('updateItemCategory', { categoryId, newCategoryId, item });
		await redis.json.arrappend(storageKey, `$.list[?(@.id == "${newCategoryId}")].items`, item);
		await redis.json.del(
			storageKey,
			`$.list[?(@.id == "${categoryId}")].items[?(@.id == "${item.id}")]`
		);
	}

	async deleteItem(itemId: UUID): Promise<void> {
		console.log('deleteItem', { itemId });
		await redis.json.del(storageKey, `$.list..items[?(@.id == "${itemId}")]`);
	}

	async deleteCheckedItems(): Promise<void> {
		console.log('deleteCheckedItems');
		await redis.json.del(storageKey, `$.list..items[?(@.checked == true)]`);
	}

	async moveItemInsideCategory(
		categoryId: UUID,
		itemId: UUID,
		insert: { before?: UUID; after?: UUID }
	) {
		console.log('moveItemInsideCategory', { categoryId, itemId, insert });

		const [items] =
			(await redis.json.get<Item[][]>(storageKey, `$.list[?(@.id == "${categoryId}")].items`)) ??
			[];

		if (!items?.length) {
			return;
		}

		const itemIndex = items.findIndex((item) => item.id === itemId);
		if (itemIndex === -1) {
			return;
		}

		const item = items[itemIndex];
		const targetId = insert.before ?? insert.after;
		if (!targetId) {
			return;
		}

		const targetIndex = items.findIndex((item) => item.id === targetId);
		if (targetIndex === -1) {
			return;
		}

		let insertIndex = insert.before ? targetIndex : targetIndex + 1;
		if (itemIndex < insertIndex) {
			insertIndex -= 1;
		}

		await redis.json.del(
			storageKey,
			`$.list[?(@.id == "${categoryId}")].items[?(@.id == "${itemId}")]`
		);

		await redis.json.arrinsert(
			storageKey,
			`$.list[?(@.id == "${categoryId}")].items`,
			insertIndex,
			item
		);
	}
}

export default new ListService();
