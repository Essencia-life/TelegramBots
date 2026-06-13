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
		row += `\n\u200A\u2713\u2004<s>${text}</s>`;
	} else {
		row += `\n\u3007 ${text}`;
	}

	if (item.personal) {
		row += ` <a href="tg://user?id=${item.added.by.id}">\uFE6B${item.added.by.name}</a>`;
	}

	return row;
}

function category(category: Category) {
	if (category.items.length > 0) {
		const items = category.items.reduce(formatAs(itemRow), '');
		return `<b>${category.emoji} ${category.label}</b><blockquote>${items}</blockquote>\n\n`;
	}

	return '';
}

export function shoppingList(list: List): string {
	return list.reduce(formatAs(category), '');
}
