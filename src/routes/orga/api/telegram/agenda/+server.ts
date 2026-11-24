import { error, type RequestHandler } from '@sveltejs/kit';
import { agendaBot } from '$lib/server/orga/bot';
import { DateTime } from 'luxon';

const timeZone = 'Europe/Lisbon';

/** `?date=YYYY-MM-DD` sends the agenda of that day instead of tomorrow's */
export const GET: RequestHandler = async ({ url }) => {
	const param = url.searchParams.get('date');
	const date = param ? DateTime.fromISO(param, { zone: timeZone }) : undefined;

	if (param && (!/^\d{4}-\d{2}-\d{2}$/.test(param) || !date?.isValid)) {
		return error(400, 'date must be a valid date like 2026-11-25');
	}

	try {
		await agendaBot.sendAgenda(date);
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
