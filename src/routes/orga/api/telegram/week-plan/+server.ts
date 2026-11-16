import { error, type RequestHandler } from '@sveltejs/kit';
import { weekPlanBot } from '$lib/server/orga/bot';

export const GET: RequestHandler = async ({ url }) => {
	try {
		await weekPlanBot.sendWeekPlan(!url.searchParams.has('currentWeek'));
	} catch (err) {
		console.error(err);
		return error(500);
	}

	return new Response(null, { status: 201 });
};
