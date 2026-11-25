import { redirect, error } from '@sveltejs/kit';
import { DateTime } from 'luxon';
import { getRoom } from '$lib/server/booking/rooms';
import { timeZone } from '$lib/server/booking/agenda';
import type { PageServerLoad } from './$types';

/** The button that opens the web app puts the slug of the room into the start parameter. */
export const load: PageServerLoad = async ({ url }) => {
	const room = getRoom(url.searchParams.get('tgWebAppStartParam') ?? undefined);

	if (!room) {
		return error(401);
	}

	return redirect(302, `/booking/webapp/${room.slug}/${DateTime.now().setZone(timeZone).toISODate()}`);
};
