import { createHmac, timingSafeEqual } from 'node:crypto';
import { command } from '$app/server';
import { BOT_TOKEN } from '$env/static/private';
import { error } from '@sveltejs/kit';

export const verifyInitData = command('unchecked', async (initData: string): Promise<void> => {
	const params = new URLSearchParams(initData);
	const hash = params.get('hash');

	console.log(params);

	if (!hash) {
		console.error('Hash is missing in init data');
		return error(400);
	}

	params.delete('hash');

	const dataCheckString = [...params.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, v]) => `${k}=${v}`)
		.join('\n');

	const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();

	const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

	const valid = timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hash));

	if (!valid) {
		console.error('Invalid init data hash');
		return error(400);
	}

	const authDate = Number(params.get('auth_date'));
	if (Date.now() / 1000 - authDate > 86400) {
		console.error('Init data is too old');
		return error(410);
	}
});
