import { error, type RequestHandler } from '@sveltejs/kit';
import { ORGA_BOT_SECRET_TOKEN } from '$env/static/private';
import { runSpike } from '$lib/server/orga/spike-recurring-events';

// Temporärer Endpoint für den Serien-Spike, nach der Auswertung wieder löschen.
// Aufruf: curl -H "Authorization: Bearer $ORGA_BOT_SECRET_TOKEN" "<host>/orga/api/spike-recurring-events[?keep=1|?inspect=<masterId>]"
export const GET: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('authorization') !== `Bearer ${ORGA_BOT_SECRET_TOKEN}`) {
		return error(401, 'Unauthorized');
	}

	try {
		const report = await runSpike({
			keep: url.searchParams.has('keep'),
			inspect: url.searchParams.get('inspect') ?? ''
		});
		return new Response(report, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	} catch (err) {
		console.error(err);
		return error(500, err instanceof Error ? err.message : 'Spike failed');
	}
};
