import { error, type RequestHandler } from '@sveltejs/kit';
import { weekPlanBot } from '$lib/server/orga/bot';

export const GET: RequestHandler = async ({ url }) => {
	try {
		await weekPlanBot.sendWeekPlan(
			!url.searchParams.has('currentWeek'),
			!url.searchParams.has('useExisting')
		);
	} catch (err) {
		if (err instanceof Error && err.message === 'Missing configuration') {
			return error(412, err.message);
		}

		console.error(err);
		return error(500);
	}

	return new Response(null, { status: 201 });
};
