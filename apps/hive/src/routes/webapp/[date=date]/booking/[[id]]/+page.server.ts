import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { Calendar } from '$lib/server/calendar';
import { CO_WORKING_CALENDAR_ID } from '$env/static/private';

export const load: PageServerLoad = async ({ params }) => {
	if (params.id) {
		const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);
		const booking = await coWorkingCalendar.getEvent(params.id);

		return { booking };
	}
};
