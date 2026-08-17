import type { PageServerLoad } from './$types';
import { VERCEL_BRANCH_URL } from '$env/static/private';

export const load: PageServerLoad = async () => {
	return {
		baseUrl: VERCEL_BRANCH_URL
	};
};
