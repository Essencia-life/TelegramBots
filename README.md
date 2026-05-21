# TelegramBots — Essência Monorepo

This monorepo contains a collection of Telegram bots and their web frontends used by Essência. Each application under `apps/` is a standalone SvelteKit app and can include its own Telegram bot (webhook endpoint). Shared bot functionality lives in the `packages/bot` package.

Repository structure

- `apps/` — SvelteKit applications (each app can be its own bot). Example: `apps/bot-template`.
- `packages/` — shared libraries and integrations:
  - `packages/bot` — shared bot functionality (error handlers, webhook setup, helpers)
  - `packages/ui` — central Tailwind v4 theme & Flowbite overrides (`src/theme.css`)
  - `packages/integrations` — external services (Google Calendar, Upstash Redis, etc.)

Key utilities / dependencies

- `grammy` — Telegram bot framework
- `@sveltejs/kit` / `svelte` — SvelteKit web UI
- `flowbite-svelte` / `flowbite` — UI components
- `tailwindcss` (v4, CSS-based configuration via `@theme` / `@source`)
- `@twa-dev/sdk` — Telegram Web App SDK
- `@sentry/sveltekit` — Sentry integration for SvelteKit
- `@upstash/redis` — Upstash Redis REST client
- `googleapis` — Google REST APIs (Calendar scope)
- `turbo` (Turborepo) + npm workspaces — monorepo orchestration
- `typescript` — type safety

Note: The shared theme lives in `packages/ui/src/theme.css` and is imported into apps using `import '@repo/ui/theme.css'`.

Quick start

1. Install dependencies

```bash
npm install
```

2. Start development (Turbo orchestrates workspaces)

```bash
npm run dev
```

3. Environment variables: copy `.env.example` to `.env` and fill in the values (`BOT_TOKEN`, `BOT_SECRET_TOKEN`, `SENTRY_DSN`, `UPSTASH_*`, `GOOGLE_*`).

Tips

- If you want to use Tailwind classes inside an app, keep a minimal `tailwind.config.cjs` per app that includes `packages/ui/src` in its `content` so Tailwind scans both the app and the shared theme.
- For Vercel deployments you can switch an app to `@sveltejs/adapter-vercel`; otherwise `@sveltejs/adapter-node` works well for Docker/Node deployments.

See the individual `apps/` and `packages/` folders for more examples and implementation details.
