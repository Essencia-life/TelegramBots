import { error } from '@sveltejs/kit';
import { getRoom, getRoomForm, rooms } from '$lib/server/booking/rooms';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params }) => {
	const room = getRoom(params.room);
	if (!room) return error(404, 'Unknown room');

	return {
		room: { slug: room.slug, name: room.name, ...getRoomForm(room.slug) },
		rooms: rooms.map(({ slug, name }) => ({ slug, name }))
	};
};
