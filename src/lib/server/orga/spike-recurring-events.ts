/**
 * Spike: Google Calendar Serien + extendedProperties.private.
 * Läuft ausschließlich gegen TEST_CALENDAR_ID, Ergebnis ist ein Textreport.
 * Aufruf über GET /orga/api/spike-recurring-events (siehe +server.ts dort).
 */
import { randomBytes } from 'node:crypto';
import { google, type calendar_v3 } from 'googleapis';
import { DateTime } from 'luxon';
import { env } from '$env/dynamic/private';

type Ev = calendar_v3.Schema$Event;

const TZ = 'Europe/Lisbon';
const priv = (e?: Ev) => (e?.extendedProperties?.private ?? {}) as Record<string, string>;
const errMsg = (e: any) =>
	`${e?.code ?? e?.status ?? ''} ${e?.errors?.[0]?.message ?? e?.message ?? e}`.trim();

export async function runSpike({ keep = false, inspect = '' } = {}): Promise<string> {
	const calendarId = env.TEST_CALENDAR_ID;
	if (!calendarId) throw new Error('TEST_CALENDAR_ID ist nicht gesetzt');
	if ([env.COMMUNITY_CALENDAR_ID, env.EVENTS_CALENDAR_ID].includes(calendarId)) {
		throw new Error('TEST_CALENDAR_ID darf nicht der echte community/events-Kalender sein');
	}

	const cal = google.calendar({
		version: 'v3',
		auth: new google.auth.JWT({
			email: env.GOOGLE_API_USER,
			key: env.GOOGLE_API_KEY,
			subject: env.GOOGLE_API_SUBJECT,
			scopes: ['https://www.googleapis.com/auth/calendar']
		})
	});

	const out: string[] = [];
	const log = (line = '') => out.push(line);
	const ok = (name: string, text = '') => log(`✅ ${name}${text ? ' – ' + text : ''}`);
	const bad = (name: string, text = '') => log(`❌ ${name}${text ? ' – ' + text : ''}`);
	const info = (name: string, text = '') => log(`ℹ️  ${name}${text ? ' – ' + text : ''}`);
	const check = (cond: boolean, name: string, text = '') => (cond ? ok : bad)(name, text);

	const monday = DateTime.now().setZone(TZ).plus({ weeks: 1 }).startOf('week');

	const list = async (filter: string[] = []) =>
		(
			await cal.events.list({
				calendarId,
				singleEvents: true,
				orderBy: 'startTime',
				timeMin: monday.toISO()!,
				timeMax: monday.plus({ days: 5 }).toISO()!,
				timeZone: TZ,
				privateExtendedProperty: filter
			})
		).data.items ?? [];
	const get = async (eventId: string) => (await cal.events.get({ calendarId, eventId })).data;
	const patch = async (eventId: string, requestBody: Ev, etag?: string) =>
		(
			await cal.events.patch(
				{ calendarId, eventId, requestBody },
				etag ? { headers: { 'If-Match': etag } } : undefined
			)
		).data;

	if (inspect) {
		const items = (await list()).filter((e) => e.recurringEventId === inspect);
		log(`${items.length} Instanzen von ${inspect} (nächste Woche):`);
		for (const e of items) log(`- ${e.id}\n  ${e.start?.dateTime}  ${e.status}\n  ${JSON.stringify(priv(e))}`);
		return out.join('\n');
	}

	const masterId = 'spk' + randomBytes(5).toString('hex'); // base32hex-konform (0-9a-f)
	let created = false;

	try {
		// 1. Serie anlegen
		const master = (
			await cal.events.insert({
				calendarId,
				requestBody: {
					id: masterId,
					summary: 'SPIKE Lunch (kann gelöscht werden)',
					start: { dateTime: monday.set({ hour: 14 }).toISO()!, timeZone: TZ },
					end: { dateTime: monday.set({ hour: 15 }).toISO()!, timeZone: TZ },
					recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=15'],
					extendedProperties: {
						private: {
							source: 'week-plan',
							type: 'spike',
							v: '2',
							'job.chef': JSON.stringify({ title: 'Lunch Chef', persons: 2 }),
							'job.cleaning': JSON.stringify({ title: 'Lunch Cleaning', persons: 1 })
						}
					}
				}
			})
		).data;
		created = true;
		check(master.id === masterId, 'Eigene Master-ID wird akzeptiert', master.id ?? '');

		// 2. Instanzen + Filter
		const instances = await list(['source=week-plan', 'type=spike']);
		check(instances.length === 5, 'Filter source+type liefert 5 Instanzen (Mo–Fr)', `${instances.length} gefunden`);
		if (instances.length < 5) throw new Error('Zu wenige Instanzen – Rest des Tests nicht sinnvoll');

		const [, tue, wed, thu, fri] = instances;
		info('Beispiel Instanz-ID', tue.id ?? '');
		check(tue.recurringEventId === masterId, 'Instanz verweist per recurringEventId auf Master');
		check(!!priv(tue)['job.chef'], 'Instanz erbt job.* vom Master');

		// 3. Telegram-Längen
		const sample = `plan:${tue.id}:cleaning`;
		const deep = `plan_${tue.id}_cleaning`;
		const bytes = Buffer.byteLength(sample);
		check(
			bytes <= 64,
			'callback_data passt in 64 Bytes',
			`"${sample}" = ${bytes} Bytes (echte Google-Master-IDs sind länger als die Spike-ID!)`
		);
		info('Deep-Link-Payload', `${deep.length} Zeichen (Telegram-Limit 64, nur A-Za-z0-9_-)`);
		check(
			deep.match(/^plan_(\w+)_(\w+)$/)?.[1] !== tue.id,
			'Alte Regex plan_(\\w+)_(\\w+) zerlegt Instanz-ID FALSCH (erwartet: ja, wegen "_")',
			'Regex/Kodierung muss geändert werden'
		);

		// 4. Instanz patchen (Ausnahme)
		await patch(tue.id!, {
			extendedProperties: {
				private: {
					planMessageId: '123',
					'assign.chef': JSON.stringify({ persons: [{ id: 1, first_name: 'Test' }] })
				}
			}
		});
		const tueAfter = await get(tue.id!);
		const masterAfter = await get(masterId);
		check(!!priv(tueAfter)['assign.chef'], 'Assignment auf Instanz gespeichert');
		check(!!priv(tueAfter)['job.chef'], 'Ausnahme behält geerbte job.*-Keys (Patch merged auf Key-Ebene)');
		check(!priv(masterAfter)['assign.chef'], 'Master bleibt frei von Assignments');
		info('Props Dienstag (Ausnahme)', JSON.stringify(priv(tueAfter)));

		// 5. Master-Template ändern: Was sehen Ausnahme vs. unberührte Instanz?
		await patch(masterId, {
			extendedProperties: {
				private: {
					'job.chef': JSON.stringify({ title: 'CHANGED', persons: 2 }),
					'job.dessert': JSON.stringify({ title: 'Dessert', persons: 1 })
				}
			}
		});
		const tue2 = await get(tue.id!);
		const wed2 = await get(wed.id!);
		info(
			'Template-Änderung → gepatchte Instanz (Di)',
			priv(tue2)['job.chef']?.includes('Lunch Chef') ? 'EINGEFROREN (alter Wert)' : 'sieht neuen Wert (live)'
		);
		info(
			'Template-Änderung → unberührte Instanz (Mi)',
			priv(wed2)['job.chef']?.includes('CHANGED') ? 'sieht neuen Wert (live)' : 'sieht alten Wert'
		);
		info('Neuer job.dessert auf Di?', priv(tue2)['job.dessert'] ? 'ja' : 'nein');

		// 6. Filter findet Ausnahmen weiterhin?
		const afterFilter = await list(['source=week-plan', 'type=spike']);
		check(afterFilter.length === 5, 'Filter findet Ausnahmen + normale Instanzen weiterhin', `${afterFilter.length}`);
		const byAssign = await list(['planMessageId=123']);
		check(byAssign.length === 1, 'Filter planMessageId=123 findet genau die Ausnahme', `${byAssign.length}`);

		// 7. Wertgrenzen
		const tryLimit = async (label: string, key: string, value: string) => {
			try {
				await patch(masterId, { extendedProperties: { private: { [key]: value } } });
				ok(label, 'akzeptiert');
			} catch (e) {
				bad(label, 'abgelehnt: ' + errMsg(e));
			}
			await patch(masterId, { extendedProperties: { private: { [key]: null as any } } }).catch(() => {});
		};
		await tryLimit('Value 1024 Zeichen', 'lim1', 'x'.repeat(1024));
		await tryLimit('Value 1025 Zeichen', 'lim2', 'x'.repeat(1025));
		await tryLimit('Value 2000 Zeichen', 'lim3', 'x'.repeat(2000));
		await tryLimit('Key 44 Zeichen', 'k'.repeat(44), 'v');
		await tryLimit('Key 45 Zeichen', 'k'.repeat(45), 'v');

		// 8. ETag / If-Match
		const thuBefore = await get(thu.id!);
		await patch(thu.id!, { extendedProperties: { private: { race: 'A' } } }); // ändert die ETag
		try {
			await patch(thu.id!, { extendedProperties: { private: { race: 'B' } } }, thuBefore.etag!);
			bad('If-Match mit veralteter ETag wird abgelehnt (412)', 'wurde aber akzeptiert');
		} catch (e: any) {
			check(e?.code === 412 || e?.status === 412, 'If-Match mit veralteter ETag → 412', errMsg(e));
		}

		// 9. Instanz absagen
		await patch(fri.id!, { status: 'cancelled' });
		const afterCancel = await list(['type=spike']);
		check(afterCancel.length === 4, 'Abgesagte Instanz verschwindet aus singleEvents-Liste', `${afterCancel.length}`);

		// 10. Zeitänderung am Master (nur per API; UI-Verhalten manuell testen!)
		await patch(masterId, {
			start: { dateTime: monday.set({ hour: 15 }).toISO()!, timeZone: TZ },
			end: { dateTime: monday.set({ hour: 16 }).toISO()!, timeZone: TZ }
		});
		const afterTime = await list(['type=spike']);
		const tueNow = afterTime.find((e) => e.start?.dateTime?.startsWith(tue.start!.dateTime!.slice(0, 10)));
		info('Nach Zeitänderung: Anzahl Instanzen', `${afterTime.length} (vorher 4, Freitag war abgesagt)`);
		check(
			!!tueNow && !!priv(tueNow)['assign.chef'],
			'Dienstags-Assignment überlebt Zeitänderung am Master (per API)',
			tueNow ? `Start jetzt ${tueNow.start?.dateTime}` : 'Dienstags-Instanz nicht gefunden'
		);
		info('Abgesagter Freitag nach Zeitänderung', afterTime.length === 4 ? 'bleibt abgesagt' : 'wieder da!');

		log('\n--- Manueller UI-Test (wichtigster Punkt!) ---');
		log('Rufe den Endpoint mit ?keep=1 auf, öffne den SPIKE-Termin im Kalender, wähle "Alle Termine"');
		log('und ändere Uhrzeit bzw. Titel. Danach prüfen mit:');
		log(`  GET /orga/api/spike-recurring-events?inspect=${masterId}`);
		log('Erwartung prüfen: Ist assign.chef am Dienstag noch da? Ist der Freitag noch abgesagt?');
	} catch (e) {
		log('\nSpike abgebrochen: ' + errMsg(e));
	} finally {
		if (created && keep) {
			log(`\nkeep: Master ${masterId} bleibt im Test-Kalender bestehen.`);
		} else if (created) {
			await cal.events.delete({ calendarId, eventId: masterId }).catch(() => {});
			log(`\nAufgeräumt: Master ${masterId} (inkl. Instanzen) gelöscht.`);
		}
	}

	return out.join('\n');
}
