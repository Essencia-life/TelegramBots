import {
	BOT_ADMIN_CHAT_ID,
	BOT_HOME_GROUP_CHAT_ID,
	BOOKING_BOT_TOKEN,
	BOOKING_CALENDAR_ID,
	VERCEL_ENV
} from '$env/static/private';
import { Bot, GrammyError, InlineKeyboard, InlineQueryResultBuilder } from 'grammy';
import { DateTime } from 'luxon';
import { Calendar, type CalendarEvent } from '../calendar';
import { escapeHtml, generateAgenda, timeZone } from './agenda';
import {
	defaultRoom,
	emojiImageUrl,
	getRoom,
	getRoomByTopic,
	roomEmoji,
	roomOf,
	type Room
} from './rooms';
import { redis } from '$lib/server/redis';
import { errorHandlerCallback } from '$lib/server/bot-utils';

export const bot = new Bot(BOOKING_BOT_TOKEN);

/** The web app opens in the room of the button (`startapp` is the only thing it learns about the chat). */
export const openBookingsButton = (room: Room) =>
	InlineKeyboard.url('Manage bookings', `https://t.me/EssenciaBookingBot?startapp=${room.slug}`);

bot.on('my_chat_member', async (ctx) => {
	const { status } = ctx.myChatMember.new_chat_member;

	if (status === 'member' && ctx.chatId !== Number(BOT_HOME_GROUP_CHAT_ID)) {
		console.warn(`Chat Id ${ctx.chatId} is not allowed to use this bot.`);
		await bot.api.leaveChat(ctx.chatId);
	}
});

bot.on('inline_query', async (ctx) => {
	const coWorkingCalendar = new Calendar(BOOKING_CALENDAR_ID);

	if (ctx.inlineQuery.query !== '') {
		const id = ctx.inlineQuery.query.trim();
		const booking = await coWorkingCalendar.getEvent(id);

		// only the owner may post a booking, the id alone must not be enough
		if (booking && booking.extendedProperties?.shared?.telegramUserId === String(ctx.from.id)) {
			booking.id = id;
			return ctx.answerInlineQuery(createInlineQueryArticlesFromBookings([booking]), {
				cache_time: 0,
				is_personal: true
			});
		}
	}

	const myBookings = await coWorkingCalendar.getEvents(
		[`telegramUserId=${ctx.from.id}`],
		new Date()
	);

	return ctx.answerInlineQuery(createInlineQueryArticlesFromBookings(myBookings), {
		cache_time: 0,
		is_personal: true,
		button: {
			text: '🗓️ Add and manage my bookings',
			start_parameter: defaultRoom.slug
		}
	});
});

bot.command('start', async (ctx) => {
	// from the inline query button the room is the parameter, in a topic it is the topic
	const room = getRoom(ctx.match) ?? getRoomByTopic(ctx.message?.message_thread_id) ?? defaultRoom;

	await ctx.api.sendMessage(ctx.chatId, 'Use the button below to open the booking calendar.', {
		reply_markup: new InlineKeyboard().add(openBookingsButton(room)),
		message_thread_id: ctx.message?.message_thread_id
	});
	await ctx.api.deleteMessage(ctx.chatId, ctx.message!.message_id);
});

function generateBookingMessage(booking: CalendarEvent, deleted = false) {
	const startDate = new Date(booking.start!.dateTime!);
	const endDate = new Date(booking.end!.dateTime!);

	const tgTime = (date: Date, text: string) =>
		deleted ? text : `<tg-time unix="${date.getTime() / 1000}">${text}</tg-time>`;
	const strikethrough = (text: string) => (deleted ? `<s>${text}</s>` : text);
	const hours = (date: Date) =>
		date.toLocaleTimeString('en-gb', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone
		});

	const time = `${startDate
		.toLocaleDateString('en-gb', {
			weekday: 'long',
			day: '2-digit',
			month: '2-digit',
			year: '2-digit',
			timeZone
		})
		.replaceAll('/', '.')}\n${hours(startDate)} – ${hours(endDate)}`;

	// rooms without a privacy setting do not store one: nothing is shown then
	const isPrivate = booking.extendedProperties?.shared?.isPrivate;
	const privacy = isPrivate
		? `\n\n<i>${isPrivate === 'true' ? '🔒 Please respect the privacy and do not disturb.' : '🤫 Silent co-working is accepted'}</i>`
		: '';
	const room = roomOf(booking);
	const roomName = room?.name ?? 'a room';

	return strikethrough(
		`${roomEmoji(room)} I booked ${escapeHtml(roomName)} for ${escapeHtml(booking.description ?? '')}\n\non ${tgTime(startDate, time)}${privacy}`
	);
}

export async function updateInlineMessage(
	inlineMessageId: string,
	event: CalendarEvent,
	deleted = false
) {
	const room = roomOf(event) ?? defaultRoom;

	try {
		await bot.api.editMessageTextInline(inlineMessageId, generateBookingMessage(event, deleted), {
			parse_mode: 'HTML',
			reply_markup: new InlineKeyboard().add(openBookingsButton(room))
		});
	} catch (err) {
		console.error('Failed to update inline message:', err);
	}
}

export const agendaMessageKey = (room: Room) =>
	`bookingBot:${VERCEL_ENV}:agendaMessageId:${room.slug}`;

/** Called after a booking changed. The calendar watch (see the agenda route) covers the delayed resource calendar. */
export async function updateAgenda(event: CalendarEvent) {
	const room = roomOf(event);
	const start = event.start?.dateTime;
	if (!room || !start) return;

	const today = DateTime.now().setZone(timeZone);
	if (DateTime.fromISO(start).setZone(timeZone).hasSame(today, 'day')) {
		await refreshAgenda(room);
	}
}

/** Renders today's agenda message of a room again from its calendar. */
export async function refreshAgenda(room: Room) {
	const messageId = await redis.get<number>(agendaMessageKey(room));
	if (!messageId) return;

	const text = await generateAgenda(room);

	if (!text) {
		return bot.api.deleteMessage(BOT_HOME_GROUP_CHAT_ID, messageId);
	}

	try {
		await bot.api.editMessageText(BOT_HOME_GROUP_CHAT_ID, messageId, text, {
			parse_mode: 'HTML',
			reply_markup: new InlineKeyboard().add(openBookingsButton(room))
		});
	} catch (err) {
		// the resource calendar is delayed, so the text can still be the same as before: Telegram answers 400
		if (!(err instanceof GrammyError) || !/message is not modified/i.test(err.description))
			throw err;
	}
}

function createInlineQueryArticlesFromBookings(bookings: CalendarEvent[]) {
	return bookings.map((booking) => {
		const startDate = new Date(booking.start!.dateTime!);
		const endDate = new Date(booking.end!.dateTime!);
		const room = roomOf(booking) ?? defaultRoom;

		const title =
			startDate
				.toLocaleString('en-gb', { dateStyle: 'short', timeStyle: 'short', timeZone })
				.replaceAll('/', '.') +
			' - ' +
			endDate.toLocaleTimeString('en-gb', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				timeZone
			});

		return InlineQueryResultBuilder.article(booking.id!, title, {
			description: `${room.name}: click here to post your booking to this chat.`,
			thumbnail_url: emojiImageUrl(roomEmoji(room)),
			thumbnail_height: 96,
			thumbnail_width: 96,
			reply_markup: new InlineKeyboard().add(openBookingsButton(room))
		}).text(generateBookingMessage(booking), { parse_mode: 'HTML' });
	});
}

bot.on('chosen_inline_result', async (ctx) => {
	await new Calendar(BOOKING_CALENDAR_ID).updateEvent(ctx.chosenInlineResult.result_id, {
		extendedProperties: {
			private: {
				telegramInlineMessageId: String(ctx.chosenInlineResult.inline_message_id)
			}
		}
	});
});

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
