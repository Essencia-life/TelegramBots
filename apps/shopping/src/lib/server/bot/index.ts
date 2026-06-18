import { errorHandlerCallback } from '@repo/bot';
import { BOT_GROUP_CHAT_ID, BOT_TOPIC_ID, BOT_TOKEN, BOT_ADMIN_CHAT_ID } from '$env/static/private';
import { Bot, Context, InlineKeyboard } from 'grammy';
import { type EmojiFlavor, emojiParser, emoji } from '@grammyjs/emoji';

import { shoppingList } from '$lib/server/utils/messageFormatter';
import listService from '../list.service';
import lastMessageIdService from '../inlineMessageId.service';

type MyContext = EmojiFlavor<Context>;

export const bot = new Bot<MyContext>(BOT_TOKEN);

async function getInlineKeyboardOpenListButton() {
	const botInfo = await bot.api.getMe();

	return InlineKeyboard.url(
		`${emoji('clipboard')} Open Shopping List`,
		`https://t.me/${botInfo.username}?startapp=${BOT_GROUP_CHAT_ID}`
	);
}

async function getInlineKeyboard() {
	return new InlineKeyboard().row(await getInlineKeyboardOpenListButton());
}

bot.use(emojiParser());

bot.on('my_chat_member', async (ctx) => {
	const { status } = ctx.myChatMember.new_chat_member;

	if (status === 'member' && ctx.chatId !== Number(BOT_GROUP_CHAT_ID)) {
		await bot.api.leaveChat(ctx.chatId);
	}
});

bot.command('start', async (ctx) => {
	if (ctx.match === BOT_GROUP_CHAT_ID) {
		await ctx.api.sendMessage(ctx.chatId, 'Use the button below to open the shopping list.', {
			reply_markup: new InlineKeyboard().add(await getInlineKeyboardOpenListButton())
		});
		await ctx.api.deleteMessage(ctx.chatId, ctx.message!.message_id);
	}
});

bot.on('inline_query', async (ctx, next) => {
	if (ctx.inlineQuery.query === '') {
		await ctx.answerInlineQuery([], {
			button: {
				text: `${emoji('shopping_cart')} Open Shopping Bot`,
				start_parameter: BOT_GROUP_CHAT_ID
			},
			cache_time: 24 * 60 * 60
		});
	} else {
		next();
	}
});

export async function updateLastMessage(complete?: boolean, newList?: boolean) {
	console.log('updateLastMessage', { complete, newList });

	const lastMessageId = await lastMessageIdService.getId();

	if (lastMessageId) {
		if (complete) {
			if (newList) {
				const list = await listService.getCompletedList();
				await bot.api.editMessageText(BOT_GROUP_CHAT_ID, lastMessageId, { html: shoppingList(list) });
			} else {
				await bot.api.editMessageReplyMarkup(BOT_GROUP_CHAT_ID, lastMessageId);
			}

			await bot.api.unpinChatMessage(BOT_GROUP_CHAT_ID, lastMessageId);

			await lastMessageIdService.deleteId();
		} else {
			const list = await listService.getList();

			if (list.every((category) => !category.items.length)) {
				await bot.api.deleteMessage(BOT_GROUP_CHAT_ID, lastMessageId);
				await lastMessageIdService.deleteId();
				return;
			}

			// FIXME: causes 400: Bad Request: message is not modified - if checked more than one in short time
			await bot.api.editMessageText(BOT_GROUP_CHAT_ID, lastMessageId, { html: shoppingList(list) }, {
				reply_markup: await getInlineKeyboard()
			});
		}
	} else {
		await sendNewList();
	}
}

export async function sendNewList() {
	console.log('sendNewList');

	const list = await listService.getList();
	const { message_id } = await bot.api.sendRichMessage(BOT_GROUP_CHAT_ID, { html: shoppingList(list) }, {
		message_thread_id: parseInt(BOT_TOPIC_ID),
		reply_markup: await getInlineKeyboard()
	});

	await lastMessageIdService.setId(message_id);

	await bot.api.pinChatMessage(BOT_GROUP_CHAT_ID, message_id);
}

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
