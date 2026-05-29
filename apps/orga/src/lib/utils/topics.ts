import { BOT_TOPIC_ID } from '$env/static/private';

export default JSON.parse(BOT_TOPIC_ID) as {
	dailyInfo: number;
	weeklyJobs: number;
};
