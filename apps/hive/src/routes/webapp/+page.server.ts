import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return redirect(302, '/webapp/' + new Date().toISOString().substring(0, 10));
};
