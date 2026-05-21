import { error, redirect } from '@sveltejs/kit';
import { decryptParam } from '$lib/server/encryption';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ url, cookies }) => {
	const userEncrypted = url.searchParams.get('user') ?? cookies.get('session');
	const user = userEncrypted && decryptParam(userEncrypted);

	if (!user) {
		return error(401, 'Unauthorized');
	}

	cookies.set('session', userEncrypted, { path: '/' });

	return { user };
};
