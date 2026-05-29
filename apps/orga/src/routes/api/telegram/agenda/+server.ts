import { error, type RequestHandler } from '@sveltejs/kit';
import { agendaBot } from '$lib/server/bot';

export const GET: RequestHandler = async () => {
	try {
		await agendaBot.sendAgenda();
	} catch (err) {
		if (err instanceof Error && err.message === 'Missing configuration') {
			return error(412, err.message);
		}

		console.error(err);
		return error(500);
	}

	return new Response(null, { status: 201 });
};
