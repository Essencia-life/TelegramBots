import type { Item } from '$lib/schema';
import type { User } from 'grammy/types';

function amountMapping(amountStr: string): number | undefined {
	if (amountStr) {
		const amount = parseFloat(amountStr);

		if (!isNaN(amount)) {
			return amount;
		} else if (amountStr.toLocaleLowerCase() === 'a' || amountStr.toLocaleLowerCase() === 'one') {
			return 1;
		} else if (amountStr.toLocaleLowerCase() === 'half a') {
			return 0.5;
		}
	}

	return;
}

export function createItem(from: User, match: RegExpMatchArray): Item {
	const { id, username, first_name: name } = from;
	let { amount, unit, label } = match.groups ?? {};
	let personal;

	if (label.endsWith(' for me')) {
		[label] = label.split(' for me');
		personal = true;
	}

	return {
		id: crypto.randomUUID(),
		amount: amountMapping(amount),
		unit,
		label,
		personal,
		checked: false,
		added: {
			by: { id, name, username },
			at: new Date()
		}
	};
}
