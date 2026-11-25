import { z } from 'zod';
import { BOOKING_ROOMS } from '$env/static/private';

const roomSchema = z.object({
	name: z.string().min(1),
	/** resource calendar of the room */
	calendarId: z.string().min(1),
	/** forum topic of the room in the home group, where its agenda is posted */
	topicId: z.number().int().positive(),
	/** shown in the booking message and as thumbnail of the inline result, the calendar if not set */
	emoji: z.emoji().optional()
});

/** `BOOKING_ROOMS='{"hive":{"name":"Hive","calendarId":"…","topicId":123,"emoji":"💻"}}'` (emoji is optional), the keys are the slugs of the web app paths */
export const roomsSchema = z
	.record(z.string().regex(/^[a-z0-9-]+$/), roomSchema)
	.refine((rooms) => Object.keys(rooms).length > 0, 'At least one room is required');

export type Room = z.infer<typeof roomSchema> & { slug: string };

export function parseRooms(json: string): Room[] {
	return Object.entries(roomsSchema.parse(JSON.parse(json))).map(([slug, room]) => ({
		slug,
		...room
	}));
}

export const rooms = parseRooms(BOOKING_ROOMS);

/** the first room, for everything that has no room in its context */
export const defaultRoom = rooms[0];

export const getRoom = (slug: string | undefined) => rooms.find((room) => room.slug === slug);

export const getRoomByTopic = (topicId: number | undefined) =>
	rooms.find((room) => room.topicId === topicId);

/** bookings made before rooms existed have no room property: they were all made for the Hive */
export const roomOf = (event: { extendedProperties?: { shared?: Record<string, string> | null } | null }) =>
	getRoom(event.extendedProperties?.shared?.room ?? 'hive');

/** what the booking form of a room offers; rooms without an entry get the defaults */
const roomForms: Record<string, { reasonPlaceholder: string; privacy: boolean }> = {
	hive: { reasonPlaceholder: 'e.g. Business Call', privacy: true },
	'community-yurt': { reasonPlaceholder: 'e.g. Healing Session', privacy: false }
};

export const getRoomForm = (slug: string) =>
	roomForms[slug] ?? { reasonPlaceholder: 'e.g. Meeting', privacy: false };

const defaultEmoji = '🗓️';

export const roomEmoji = (room?: Room) => room?.emoji ?? defaultEmoji;

/** emojiapi.dev image of an emoji, addressed by its hex code, e.g. as thumbnail of an inline result. */
export function emojiImageUrl(emoji: string, size = 96) {
	const hex = [...emoji]
		.map((char) => char.codePointAt(0)!.toString(16))
		// the variation selector is no part of the code
		.filter((code) => code !== 'fe0f')
		.join('-');

	return `https://emojiapi.dev/api/v1/${hex}/${size}.png`;
}
