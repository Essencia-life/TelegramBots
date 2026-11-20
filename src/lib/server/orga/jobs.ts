import * as z from 'zod';

// Copy of the job format the Masterplan app writes into the event's private extended properties:
// `jobs` (JSON array of Job) and `type` (stable event key). Keep both in sync.
// The length limits keep Telegram's 64 byte callback_data / deep link payload: "unassign:{type}:{yyyymmdd}:{key}".

export const jobSchema = z.object({
	key: z.string().regex(/^[a-z0-9]{1,16}$/),
	title: z.string().min(1),
	slots: z.number().int().min(1).max(20),
	askDetails: z.boolean().default(false),
	sos: z.boolean().default(true)
});

const jobsSchema = z.array(jobSchema).max(12);

export const typeSchema = z
	.string()
	.max(24)
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export type Job = z.infer<typeof jobSchema>;

/** Anything unreadable (also the bot's former object format) counts as "no jobs". */
export function parseJobs(raw?: string | null): Job[] {
	try {
		const r = jobsSchema.safeParse(JSON.parse(raw || '[]'));
		return r.success ? r.data : [];
	} catch {
		return [];
	}
}
