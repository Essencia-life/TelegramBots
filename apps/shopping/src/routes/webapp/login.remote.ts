import { createHmac, timingSafeEqual } from 'node:crypto';
import { command, getRequestEvent } from '$app/server';
import { BOT_TOKEN } from '$env/static/private';
import { error } from '@sveltejs/kit';
import z from 'zod';
import type { WebAppInitData, WebAppUser } from 'telegram-web-app';

interface InitData extends Omit<WebAppInitData, 'user'> {
	user?: string;
}

const zInitData = z
	.string()
	.transform((str) => Object.fromEntries(new URLSearchParams(str)) as unknown as InitData);

export const login = command(zInitData, async ({ hash, ...params }) => {
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

	if (params.user) {
		const user = JSON.parse(params.user) as WebAppUser;
		const { cookies } = getRequestEvent();

		cookies.set(
			'user',
			JSON.stringify({
				id: user.id,
				name: user.first_name,
				username: user.username
			}),
			{
				path: '/',
				httpOnly: true,
				sameSite: 'strict'
			}
		);
	}
});
