import { BOT_TOKEN } from '$env/static/private';
import { bot } from '$lib/server/bot';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	await bot.init();
	const { photos } = await bot.api.getUserProfilePhotos(bot.botInfo.id, { limit: 1 });
	const file = await bot.api.getFile(photos[0][0].file_id);
	const url = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
	const response = await fetch(url);
	const body = await response.arrayBuffer();
	return new Response(body);
};
