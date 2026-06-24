import { error, type RequestHandler } from "@sveltejs/kit";
import { DateTime } from 'luxon';
import { Calendar } from '$lib/server/calendar';
import { TEST_CALENDAR_ID } from '$env/static/private';

const calendar = new Calendar(TEST_CALENDAR_ID);
const timeZone = 'Europe/Lisbon';

export const GET: RequestHandler = async () => {
    try {
        const response = await calendar.insertEvent({
            summary: 'Test event',
            description: 'short description',
            start: { dateTime: DateTime.local(2026, 6, 1, 15).toISO(), timeZone },
            end: { dateTime: DateTime.local(2026, 6, 1, 21).toISO(), timeZone },
            status: 'tentative',
            visibility: 'private',
            transparency: 'opaque',
            source: {
                title: 'More information on our Website',
                url: 'https://essencia.life/events/2026-06-01-test-event'
            },
            guestsCanInviteOthers: false,
            guestsCanSeeOtherGuests: false,
            attendees: [
                { displayName: 'Shala', email: 'c_1885fldmc9nuqjj3mjkeoq4b608h2@resource.calendar.google.com', resource: true },
                { displayName: 'Benjamin Buhler', email: 'frufti@gmail.com', comment: 'Organizer', responseStatus: 'tentative' }
            ],
            attachments: [
                // TODO store as public Vercel Blob
                { 
                    title: 'Flyer',
                    mimeType: 'image/avif',
                    fileUrl: 'https://essencia.life/_app/immutable/assets/img_20260622_220818_182.cFe1t94M.avif',
                }
            ],
            extendedProperties: {
                private: {
                    source: 'event-management',
                    type: 'event',
                    slug: '2026-06-01-test-event',
                    jobs: JSON.stringify([
                        ['host', { title: 'Host', persons: [{ id: 123456789, first_name: 'Ben' }] }]
                    ]),
                },
                shared: {
                    details: 'detailed description',
                    links: JSON.stringify([
                        { label: 'More information', link: 'https://essencia.life' },
                        { label: 'Get your ticket', link: 'https://essencia.life' },
                        { label: 'Car sharing group', link: 'https://essencia.life' },
                    ])
                }
            }
        });

        console.log(response);
    } catch (err) {
        console.error(err);
        return error(500);
    }

    return new Response(null, { status: 201 });
};