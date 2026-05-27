import { errorHandlerCallback } from '@repo/bot';
import { BOT_GROUP_CHAT_ID, BOT_TOPIC_ID, BOT_TOKEN, BOT_ADMIN_CHAT_ID } from '$env/static/private';
import { Bot, Context, InlineKeyboard, InlineQueryResultBuilder } from 'grammy';
import { type EmojiFlavor, emojiParser, emoji } from '@grammyjs/emoji';

import { itemText, shoppingList } from '$lib/server/utils/messageFormatter';
import { emojiImageUrl } from '$lib/server/utils/emoji';
import { createItem } from '$lib/server/utils/createItem';
import listService from '../list.service';
import lastMessageIdService from '../inlineMessageId.service';
import type { InlineQueryResultsButton } from 'grammy/types';

type MyContext = EmojiFlavor<Context>;

export const bot = new Bot<MyContext>(BOT_TOKEN);

const addItemRegEx =
	/((?<amount>[0-9]+|half a|a|one)?\s?(?<unit>x|k?g|m?l|bags?|crate|heads?|jars?|bottles?)?( of)? )?(?<label>.+)/i;

const inlineKeyboardOpenListButton = InlineKeyboard.url(
	`${emoji('clipboard')} Open Shopping List`,
	'https://t.me/EssenciaShoppingBot?startapp=' + BOT_GROUP_CHAT_ID
);
const inlineKeyboard = new InlineKeyboard()
	.row(InlineKeyboard.switchInlineCurrent(`${emoji('shopping_cart')} Add Item to List`))
	.row(inlineKeyboardOpenListButton);

const inlineQueryResultsButton: InlineQueryResultsButton = {
	text: `${emoji('shopping_cart')} Open Shopping Bot`,
	start_parameter: BOT_GROUP_CHAT_ID
};

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
			reply_markup: new InlineKeyboard().add(inlineKeyboardOpenListButton)
		});
		await ctx.api.deleteMessage(ctx.chatId, ctx.message!.message_id);
	}
});

bot.inlineQuery(addItemRegEx, async (ctx) => {
	const list = await listService.getList();
	const item = createItem(ctx.inlineQuery.from, ctx.match as RegExpMatchArray);

	const results = list.map((category) =>
		InlineQueryResultBuilder.article(category.id, category.label, {
			description: `Add ${itemText(item)} to ${category.label}`,
			thumbnail_url: emojiImageUrl(category.emoji),
			thumbnail_height: 96,
			thumbnail_width: 96
		}).text(`Added ${itemText(item)} to ${category.emoji} ${category.label}`)
	);

	if (results.length) {
		await ctx.answerInlineQuery(results);
	} else {
		await ctx.answerInlineQuery([], { button: inlineQueryResultsButton });
	}
});

bot.on('inline_query', async (ctx, next) => {
	if (ctx.inlineQuery.query === '') {
		await ctx.answerInlineQuery([], {
			button: inlineQueryResultsButton,
			cache_time: 24 * 60 * 60 // 1 day
		});
	} else {
		next();
	}
});

bot.on('chosen_inline_result', async (ctx) => {
	const item = createItem(
		ctx.chosenInlineResult.from,
		ctx.chosenInlineResult.query.match(addItemRegEx)!
	);
	const categoryId = ctx.chosenInlineResult.result_id;

	console.log({ item, category: categoryId });

	await listService.addItem(categoryId, item);

	const list = await listService.getList();
	const { message_id } = await bot.api.sendMessage(
		parseInt(BOT_GROUP_CHAT_ID),
		shoppingList(list),
		{
			message_thread_id: parseInt(BOT_TOPIC_ID),
			parse_mode: 'HTML',
			reply_markup: inlineKeyboard
		}
	);

	const lastMessageId = await lastMessageIdService.getId();
	if (lastMessageId) {
		try {
			await bot.api.deleteMessage(BOT_GROUP_CHAT_ID, lastMessageId);
		} catch (err) {
			console.error(err);
		}
	}

	await lastMessageIdService.setId(message_id);
});

export async function updateLastMessage(complete?: boolean, newList?: boolean) {
	console.log('updateLastMessage', { complete, newList });

	const lastMessageId = await lastMessageIdService.getId();

	if (lastMessageId) {
		if (complete) {
			if (newList) {
				const list = await listService.getCompletedList();
				await bot.api.editMessageText(BOT_GROUP_CHAT_ID, lastMessageId, shoppingList(list), {
					parse_mode: 'HTML'
				});
			} else {
				await bot.api.editMessageReplyMarkup(BOT_GROUP_CHAT_ID, lastMessageId, {
					reply_markup: new InlineKeyboard().switchInlineCurrent(
						`${emoji('shopping_cart')} Add Item to new List`
					)
				});
			}

			await lastMessageIdService.deleteId();
		} else {
			const list = await listService.getList();

			if (list.every((category) => !category.items.length)) {
				await bot.api.deleteMessage(BOT_GROUP_CHAT_ID, lastMessageId);
				await lastMessageIdService.deleteId();
				return;
			}

			// FIXME: causes 400: Bad Request: message is not modified - if checked more than one in short time
			await bot.api.editMessageText(BOT_GROUP_CHAT_ID, lastMessageId, shoppingList(list), {
				parse_mode: 'HTML',
				reply_markup: inlineKeyboard
			});
		}
	} else {
		await sendNewList();
	}
}

export async function sendNewList() {
	console.log('sendNewList');

	const list = await listService.getList();
	const { message_id } = await bot.api.sendMessage(
		parseInt(BOT_GROUP_CHAT_ID),
		shoppingList(list),
		{
			message_thread_id: parseInt(BOT_TOPIC_ID),
			parse_mode: 'HTML',
			reply_markup: inlineKeyboard
		}
	);

	await lastMessageIdService.setId(message_id);
}

bot.catch(errorHandlerCallback(bot, BOT_ADMIN_CHAT_ID));
