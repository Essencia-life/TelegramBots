import WebApp from '$lib/webapp';
import type { UUID } from 'crypto';

let collapsedCategories: Record<string, boolean> = $state({});

export function getCollapsedCategories() {
	return collapsedCategories;
}

export function toggleCategory(id: UUID) {
	collapsedCategories[id] = !collapsedCategories[id];

	try {
		WebApp.CloudStorage?.setItem('collapsedCategories', JSON.stringify(collapsedCategories));
	} catch (err) {
		console.warn(err);
	}
}

try {
	WebApp.CloudStorage?.getItem('collapsedCategories', (error, value) => {
		if (error) {
			console.error(error);
		}

		if (value) {
			collapsedCategories = JSON.parse(value);
		}
	});
} catch (err) {
	console.warn(err);
}
