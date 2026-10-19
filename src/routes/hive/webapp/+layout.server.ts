import { decryptParam } from '$lib/server/encryption';
import type { LayoutServerLoad } from './$types';

// TODO remove after switch to new auth system
export const load: LayoutServerLoad = async ({ url, cookies }) => {
	const userEncrypted = url.searchParams.get('user') ?? cookies.get('hive-session');
	const user = userEncrypted && decryptParam(userEncrypted);

	if (user) {
		cookies.set('hive-session', userEncrypted, { path: '/' });
	}
};
