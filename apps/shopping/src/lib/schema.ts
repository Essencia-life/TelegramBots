import type { UUID } from "crypto";

export interface UserAction {
	by: {
		id: number;
		name: string;
		username?: string;
	};
	at: Date;
}

export interface Item {
	id: UUID;
	label: string;
	amount?: number;
	unit?: string;
	personal?: boolean;
	added: UserAction;
	lastModified?: UserAction;
	checked: boolean;
}

export interface Category {
	id: UUID;
	label: string;
	emoji: string;
	items: Item[];
}

export type List = Category[];

// export const list = $state<List>([
// 	{
// 		id: 'groceries',
// 		label: 'Groceries',
// 		emoji: '🍅',
// 		items: [
// 			{
// 				label: 'Apples',
// 				amount: 2,
// 				unit: 'x',
// 				added: {
// 					by: { name: 'Ben', id: 1 },
// 					at: new Date()
// 				},
// 				lastModified: {
// 					by: { name: 'Ben', id: 1 },
// 					at: new Date()
// 				}
// 			},
// 			{
// 				label: 'Rice',
// 				amount: 5,
// 				unit: 'kg',
// 				added: {
// 					by: { name: 'Ben', id: 1 },
// 					at: new Date()
// 				},
// 				lastModified: {
// 					by: { name: 'Ben', id: 1 },
// 					at: new Date()
// 				}
// 			},
// 			{
// 				label: 'Aplro Soy Yogurt',
// 				amount: 1,
// 				unit: 'x',
// 				personal: true,
// 				added: {
// 					by: { name: 'Nadine', id: 2, username: 'NadineEmmert' },
// 					at: new Date()
// 				},
// 				lastModified: {
// 					by: { name: 'Nadine', id: 2 },
// 					at: new Date()
// 				}
// 			}
// 		]
// 	},
// 	{
// 		id: 'homewares',
// 		label: 'Homewares',
// 		emoji: '🧻',
// 		items: [
// 			{
// 				label: 'Toiletpaper',
// 				amount: 2,
// 				unit: 'bags',
// 				added: {
// 					by: { name: 'Ben', id: 1 },
// 					at: new Date()
// 				}
// 			},
// 			{
// 				label: 'Dishwashing Detergent',
// 				added: {
// 					by: { name: 'Ben', id: 1 },
// 					at: new Date()
// 				},
// 				checked: {
// 					by: { name: 'Bridie', id: 3 },
// 					at: new Date()
// 				}
// 			}
// 		]
// 	},
// 	{
// 		id: 'office',
// 		label: 'Office Supplies',
// 		emoji: '🖇',
// 		items: []
// 	},
// 	{
// 		id: 'garden',
// 		label: 'Garden Supplies',
// 		emoji: '🌾',
// 		items: []
// 	},
// 	{
// 		id: 'tools',
// 		label: 'Tools & Material',
// 		emoji: '🔩',
// 		items: []
// 	}
// ]);
