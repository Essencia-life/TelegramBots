import { GrammyError, HttpError, type Bot, type Context, type ErrorHandler } from 'grammy';
import { error, type RequestHandler } from '@sveltejs/kit';
import type { Update } from 'grammy/types';

export function startDevServer<C extends Context>(bot: Bot<C>) {
  bot
    .start({
      onStart: async () => {
        await bot.api.setMyShortDescription('development');
      }
    })
    .catch((err) => {
      if (!(err instanceof GrammyError && err.error_code === 409)) {
        console.error(err);
      }
    });
}

export function errorHandlerCallback<C extends Context>(
  bot: Bot<C>,
  adminChatId: string
): ErrorHandler<C> {
  return async (err) => {
    const ctx = err.ctx;
    const e = err.error;

    let message = `🚨 * Bot Error *\n`;

    message += `\n• Environment: \`${process.env.VERCEL_ENV}\``;

    if (ctx) {
      message += `\n• Update ID: \`${ctx.update.update_id}\``;
      if (ctx.chat) message += `\n• Chat ID: \`${ctx.chat.id}\``;
      if (ctx.from) message += `\n• User ID: \`${ctx.from.id} (${ctx.from.first_name})\``;
    }

    if (e instanceof GrammyError) {
      message += `\n\n*GrammyError*\n\`${e.description}\``;
    } else if (e instanceof HttpError) {
      message += `\n\n*HttpError*\n\`${String(e.error)}\``;
    } else {
      message += `\n\n*Unknown Error*\n\`${String(e)}\``;
    }

    const stack =
      e instanceof Error && e.stack
        ? e.stack.slice(0, 3500) // Telegram Limit-Schutz
        : 'no stacktrace';

    message += `\n\n*Stacktrace*\n\`\`\`\n${stack}\n\`\`\``;

    try {
      console.error(err);
      await bot.api.sendMessage(adminChatId, message, {
        parse_mode: 'Markdown',
        link_preview_options: {
          is_disabled: true
        }
      });
    } catch (err) {
      console.error(err);
    }
  };
}

export function checkWebhookCallback<C extends Context>(bot: Bot<C>): RequestHandler {
  return async ({ url }) => {
    const webhookInfo = await bot.api.getWebhookInfo();

    if (url.toString() !== webhookInfo.url) {
      error(404);
    }

    return new Response(null, { status: 204 });
  };
}

export function setupWebhookCallback<C extends Context>(
  bot: Bot<C>,
  secretToken: string,
  allowedUpdates: ReadonlyArray<Exclude<keyof Update, 'update_id'>>
): RequestHandler {
  return async ({ url }) => {
    await bot.api.deleteWebhook();

    const success = await bot.api.setWebhook(url.toString(), {
      secret_token: secretToken,
      allowed_updates: allowedUpdates
    });

    if (!success) {
      error(500, 'Failed setting webhook');
    }

    if (process.env.VERCEL_ENV) {
      void bot.api.setMyShortDescription(process.env.VERCEL_ENV);
    }

    return new Response(null, { status: 201 });
  };
}
