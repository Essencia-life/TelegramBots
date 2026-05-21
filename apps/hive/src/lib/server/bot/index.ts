import {
    BOT_ADMIN_CHAT_ID,
    BOT_GROUP_CHAT_ID,
    BOT_TOKEN,
    CO_WORKING_CALENDAR_ID,
    VERCEL_ENV,
    VERCEL_URL
} from '$env/static/private';
import { Bot, InlineKeyboard, InlineQueryResultBuilder } from 'grammy';
import { encryptParam } from '../encryption';
import { Calendar, type CalendarEvent } from '../calendar';
import { generateAgenda } from '$lib/server/agenda';
import { redis } from '$lib/server/redis';
import { errorHandlerCallback } from '@repo/bot';

export const bot = new Bot(BOT_TOKEN);


bot.on('my_chat_member', async (ctx) => {
    const { status } = ctx.myChatMember.new_chat_member;

    if (status === 'member' && ctx.chatId !== Number(BOT_GROUP_CHAT_ID)) {
        console.warn(`Chat Id ${ctx.chatId} is not allowed to use this bot.`);
        await bot.api.leaveChat(ctx.chatId);
    }
});

bot.on('inline_query', async (ctx) => {
    const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);

    if (ctx.inlineQuery.query !== '') {
        const id = ctx.inlineQuery.query.trim();
        const booking = await coWorkingCalendar.getEvent(id);

        if (booking) {
            booking.id = id;
            return ctx.answerInlineQuery(createInlineQueryArticlesFromBookings([booking]), {
                cache_time: 0,
                is_personal: true
            });
        }
    }

    const myBookigns = await coWorkingCalendar.getEvents(
        [`telegramUserId=${ctx.from.id}`],
        new Date()
    );

    return ctx.answerInlineQuery(createInlineQueryArticlesFromBookings(myBookigns), {
        cache_time: 0,
        is_personal: true,
        button: {
            text: '🗓️ Add and manage my bookings',
            web_app: {
                url: `https://${VERCEL_URL}/webapp?user=${encryptParam(ctx.from)}`
            }
        }
    });
});

function generateBookingMessage(booking: CalendarEvent, deleted = false) {
    const startDate = new Date(booking.start!.dateTime!);
    const endDate = new Date(booking.end!.dateTime!);

    const tgTime = (date: Date, text: string) =>
        deleted ? text : `<tg-time unix="${date.getTime() / 1000}">${text}</tg-time>`;
    const strikethrough = (text: string) => (deleted ? `<s>${text}</s>` : text);

    const time = `${startDate
        .toLocaleDateString('en-gb', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            timeZone: 'Europe/Lisbon'
        })
        .replaceAll('/', '.')}\n${startDate.toLocaleTimeString('en-gb', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Lisbon'
        })} – ${endDate.toLocaleTimeString('en-gb', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Europe/Lisbon'
        })}`;

    return strikethrough(
        `💻 I booked the Hive for ${booking.description}\n\non ${tgTime(startDate, time)}`
    );
}

export async function updateInlineMessage(
    inlineMessageId: string,
    event: CalendarEvent,
    deleted = false
) {
    const text = generateBookingMessage(event, deleted);

    try {
        await bot.api.editMessageTextInline(inlineMessageId, text, {
            parse_mode: 'HTML',
            reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
        });
    } catch (err) {
        console.error('Failed to update inline message:', err);
    }
}

// TODO remove in favor of webhook via calendar.events.watch
export async function updateAgenda(event: CalendarEvent) {
    const today = new Date();
    const start = new Date(event.start!.dateTime!);

    if (
        today.getDate() === start.getDate() &&
        today.getMonth() === start.getMonth() &&
        today.getFullYear() === start.getFullYear()
    ) {
        const messageId = await redis.get<number>(`essencia:${VERCEL_ENV}:hiveBotAgendaMessageId`);

        console.log(messageId);

        if (!messageId) {
            return;
        }

        const text = await generateAgenda();

        if (text) {
            // FIXME message not updated - probably the resource calendar is delayed
            return bot.api.editMessageText(BOT_GROUP_CHAT_ID, messageId, text, {
                parse_mode: 'HTML',
                reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
            });
        }

        return bot.api.deleteMessage(BOT_GROUP_CHAT_ID, messageId);
    }
}

function createInlineQueryArticlesFromBookings(bookings: CalendarEvent[]) {
    return bookings.map((booking) => {
        const startDate = new Date(booking.start!.dateTime!);
        const endDate = new Date(booking.end!.dateTime!);

        const title =
            startDate
                .toLocaleString('en-gb', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Europe/Lisbon'
                })
                .replaceAll('/', '.') +
            ' - ' +
            endDate.toLocaleTimeString('en-gb', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Europe/Lisbon'
            });

        const message = generateBookingMessage(booking);

        return InlineQueryResultBuilder.article(booking.id!, title, {
            description: 'Click here to post your booking to this chat.',
            thumbnail_url: 'https://emojiapi.dev/api/v1/laptop/96.png',
            thumbnail_height: 96,
            thumbnail_width: 96,
            reply_markup: new InlineKeyboard().switchInlineCurrent('Manage bookings')
        }).text(message, {
            parse_mode: 'HTML'
        });
    });
}

bot.on('chosen_inline_result', async (ctx) => {
    const coWorkingCalendar = new Calendar(CO_WORKING_CALENDAR_ID);
    await coWorkingCalendar.updateEvent(ctx.chosenInlineResult.result_id, {
        extendedProperties: {
            private: {
                telegramInlineMessageId: String(ctx.chosenInlineResult.inline_message_id)
            }
        }
    });
});

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
