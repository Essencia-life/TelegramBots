import { error, type RequestHandler } from '@sveltejs/kit';
import { runSpike } from '$lib/server/orga/spike-recurring-events';

// Temporärer Endpoint für den Serien-Spike, nach der Auswertung wieder löschen.
// Aufruf: GET /orga/api/spike-recurring-events[?keep=1|?inspect=<masterId>|?rdate[&keep=1]]
export const GET: RequestHandler = async ({ url }) => {
	try {
		const report = await runSpike({
			keep: url.searchParams.has('keep'),
			rdate: url.searchParams.has('rdate'),
			inspect: url.searchParams.get('inspect') ?? ''
		});
		return new Response(report, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
	} catch (err) {
		console.error(err);
		return error(500, err instanceof Error ? err.message : 'Spike failed');
	}
};
