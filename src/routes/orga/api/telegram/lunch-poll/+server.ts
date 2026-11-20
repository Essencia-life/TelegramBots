import { error, type RequestHandler } from '@sveltejs/kit';
import { lunchPollBot } from '$lib/server/orga/bot';

export const GET: RequestHandler = async () => {
	try {
		await lunchPollBot.sendLunchPoll();
	} catch (err) {
		console.error(err);
		return error(500);
	}

	return new Response(null, { status: 201 });
};
