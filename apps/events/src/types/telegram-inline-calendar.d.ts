declare module 'telegram-inline-calendar' {
  import type { Bot } from 'grammy';
  export class Calendar {
    constructor(bot: Bot, options?: { date_format?: string; language?: string; bot_api?: string });
    startNavCalendar(ctx: any): any;
    clickButtonCalendar(ctx: any): any;
    chats: Map<number, number>;
  }
}