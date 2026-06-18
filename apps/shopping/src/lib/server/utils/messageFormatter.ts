import { units } from '$lib/config';
import type { Category, Item, List } from '$lib/schema';
import { fractionMapping } from '$lib/utils';

function formatAs<T>(formatter: (it: T) => string) {
	return (str: string, item: T) => str + formatter(item);
}

export function itemText(item: Item) {
	let text = '';

	if (item.amount) {
		if (fractionMapping.has(item.amount)) {
			text += fractionMapping.get(item.amount);
		} else {
			text += item.amount.toString();
		}

		text += `\u200A${item.unit || units[0]} `;
	}

	return text + item.label;
}

function itemRow(item: Item) {
	const text = itemText(item);
	let row = '';

	if (item.checked) {
		row += `<input type="checkbox" checked><s>${text}</s>`;
	} else {
		row += `<input type="checkbox">${text}`;
	}

	if (item.personal) {
		row += ` \u200B <mark><a href="tg://user?id=${item.added.by.id}">\uFE6B${item.added.by.name}</a></mark>`;
	}

	return `<li>${row}</li>`;
}

function category(category: Category) {
	if (category.items.length > 0) {
		const items = category.items.reduce(formatAs(itemRow), '');
		return `<details open><summary><b>${category.emoji} ${category.label}</b></summary><ul>${items}</ul></details>\n\n`;
	}

	return '';
}

export function shoppingList(list: List): string {
	return list
		.map((category) => ({
			...category,
			items: category.items.sort((a, b) => Number(b.checked) - Number(a.checked))
		}))
		.reduce(formatAs(category), '');
}
