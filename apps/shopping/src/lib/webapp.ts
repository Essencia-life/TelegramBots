import WebAppRaw from '@twa-dev/sdk';

// Handle ESM/CommonJS interop - @twa-dev/sdk kann .default oder direkt exportieren
const WebApp = (WebAppRaw as any)?.default || WebAppRaw;

export default WebApp;
