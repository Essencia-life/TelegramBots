import { BOT_HOME_GROUP_CHAT_ID } from '$env/static/private';
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	if (url.searchParams.get('tgWebAppStartParam') !== BOT_HOME_GROUP_CHAT_ID) {
		return error(401);
	}

	return redirect(302, '/hive/webapp/' + new Date().toISOString().substring(0, 10));
};
