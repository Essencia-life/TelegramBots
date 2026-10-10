import { BOT_HOME_GROUP_CHAT_ID } from '$env/static/private';
import { type Bot } from 'grammy';
import { DateTime } from 'luxon';
import { calendarByName } from '../week-plan-api';
import topics from '../utils/topics';

const timeZone = 'Europe/Lisbon';

export class LunchPollBot {
	constructor(private readonly bot: Bot) {}

	public async sendLunchPoll() {
		const tomorrow = DateTime.now().setZone(timeZone).plus({ day: 1 });
		const lunchEvent = await this.getLunchEvent(tomorrow);

		if (lunchEvent) {
			await this.bot.api.sendPoll(
				BOT_HOME_GROUP_CHAT_ID,
				`Who will join community lunch on ${tomorrow.setLocale('en').toLocaleString({ weekday: 'long' })}?`,
				[
					{ text: '😋️ Yes, I will join' },
					{ text: '🍱️ Pre-pare a lunch box / plate for me, I eat later' },
					{ text: '💤️ No, not this time' }
				],
				{
					message_thread_id: topics.dailyInfo,
					close_date: DateTime.fromISO(lunchEvent.start!.dateTime!)
						.setZone(timeZone)
						.minus({ hours: 2 })
						.toSeconds(),
					is_anonymous: false
				}
			);
		} else {
			console.info('No lunch event found for tomorrow');
		}
	}

	private async getLunchEvent(date: DateTime) {
		const startOfDay = date.startOf('day').toJSDate();
		const endOfDay = date.endOf('day').toJSDate();

		const events = await calendarByName.community.getEvents(['type=lunch'], startOfDay, endOfDay);

		return events[0];
	}
}
