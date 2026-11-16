import { error, type RequestHandler } from '@sveltejs/kit';
import { agendaBot } from '$lib/server/orga/bot';
import { DateTime } from 'luxon';

const timeZone = 'Europe/Lisbon';

export const GET: RequestHandler = async () => {
	try {
		await agendaBot.sendAgenda();
	} catch (err) {
		console.error(err);
		return error(500);
	}

	return new Response(null, { status: 201 });
};

export const POST: RequestHandler = async ({ request: { headers } }) => {
	const channelId = headers.get('x-goog-channel-id');
	const token = headers.get('x-goog-channel-token') ?? '{}';
	const { date, messageId } = JSON.parse(token);

	console.log({ channelId, date, messageId });

	if (date && messageId) {
		try {
			await agendaBot.updateAgenda(DateTime.fromISO(date).setZone(timeZone), messageId);
		} catch (err) {
			console.error(err);
			return error(500);
		}
	}

	return new Response(null, { status: 202 });
};
