import { dev } from '$app/environment';
import { bot } from '$lib/server/bot';
import { startDevServer } from '@repo/bot';

if (dev) {
	startDevServer(bot);
}
