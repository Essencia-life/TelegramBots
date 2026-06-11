import WebAppRaw from '@twa-dev/sdk';
import type { WebApp as WebAppType } from 'telegram-web-app';

// Handle ESM/CommonJS interop - @twa-dev/sdk kann .default oder direkt exportieren
const WebApp = (WebAppRaw as unknown as { default?: WebAppType })?.default || WebAppRaw;

export default WebApp;
