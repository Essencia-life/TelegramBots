import { error, type RequestHandler } from '@sveltejs/kit';
import { weekPlanBot } from '$lib/server/orga/bot';
import { DateTime } from 'luxon';

export const GET: RequestHandler = async ({ url }) => {
	try {
		await weekPlanBot.sendWeekPlan(!url.searchParams.has('currentWeek'));
	} catch (err) {
		console.error(err);
		return error(500);
	}

	return new Response(null, { status: 201 });
};

/** Google calendar webhook (see WeekPlanBot.watchCalendar): something in the week changed. */
export const POST: RequestHandler = async ({ request: { headers } }) => {
	const { weekStart } = JSON.parse(headers.get('x-goog-channel-token') ?? '{}');

	// "sync" is only the confirmation that the watch exists
	if (weekStart && headers.get('x-goog-resource-state') !== 'sync') {
		try {
			await weekPlanBot.updateWeekPlan(DateTime.fromISO(weekStart, { zone: 'Europe/Lisbon' }));
		} catch (err) {
			// not answering with an error: Google would only repeat the notification
			console.error(err);
		}
	}

	return new Response(null, { status: 202 });
};
