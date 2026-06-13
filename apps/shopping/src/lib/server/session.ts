import { type Cookies, error } from '@sveltejs/kit';
import type { WebAppInitData, WebAppUser } from 'telegram-web-app';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BOT_TOKEN } from '$env/static/private';

interface InitData extends Omit<WebAppInitData, 'user'> {
	user?: string;
}

interface Session extends Omit<WebAppInitData, 'hash' | 'user'> {
	user: WebAppUser;
}

export function getSession(cookies: Cookies): Session {
	const initData = cookies.get('session');

	if (!initData) {
		return error(401, 'Unauthorized');
	}

	const { hash, ...params } = Object.fromEntries(
		new URLSearchParams(initData)
	) as unknown as InitData;

	console.log(params);

	if (!hash) {
		console.error('Hash is missing in init data');
		return error(400, 'Invalid init data');
	}

	const dataCheckString = Object.entries(params)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('\n');

	const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

	const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

	const valid = timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hash));

	if (!valid) {
		console.error('Invalid init data hash');
		return error(400, 'Invalid init data');
	}

	const authDate = Number(params.auth_date);
	if (Date.now() / 1000 - authDate > 86400) {
		console.error('Init data is too old');
		return error(410, 'Init data has been expired');
	}

	if (!params.user) {
		console.error('No user in init data');
		return error(400, 'Invalid init data');
	}

	return {
		...params,
		user: JSON.parse(params.user) as WebAppUser
	};
}
