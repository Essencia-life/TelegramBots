/**
 * Spike: Google Calendar Serien + extendedProperties.private.
 * Läuft ausschließlich gegen TEST_CALENDAR_ID, Ergebnis ist ein Textreport.
 * Aufruf über GET /orga/api/spike-recurring-events (siehe +server.ts dort).
 */
import { randomBytes } from 'node:crypto';
import { google, type calendar_v3 } from 'googleapis';
import { DateTime } from 'luxon';
import { env } from '$env/dynamic/private';
import { matchesRelationToLunarPhase } from './utils/lunar-matching';
import lunarProvider from './utils/lunar-provider';

type Ev = calendar_v3.Schema$Event;

const TZ = 'Europe/Lisbon';
const priv = (e?: Ev) => (e?.extendedProperties?.private ?? {}) as Record<string, string>;
const errMsg = (e: any) =>
	`${e?.code ?? e?.status ?? ''} ${e?.errors?.[0]?.message ?? e?.message ?? e}`.trim();

export async function runSpike({ keep = false, inspect = '', rdate = false } = {}): Promise<string> {
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

	const list = async (filter: string[] = [], from = monday, to = monday.plus({ days: 5 })) =>
		(
			await cal.events.list({
				calendarId,
				singleEvents: true,
				orderBy: 'startTime',
				timeMin: from.toISO()!,
				timeMax: to.toISO()!,
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
		const items = (await list([], monday, monday.plus({ days: 300 }))).filter(
			(e) => inspect === 'all' || e.recurringEventId === inspect
		);
		log(`${items.length} Instanzen von ${inspect} (nächste 300 Tage):`);
		for (const e of items)
			log(`- ${e.id} (Serie ${e.recurringEventId ?? '-'})\n  ${e.start?.dateTime}  ${e.status}\n  ${JSON.stringify(priv(e))}`);
		return out.join('\n');
	}

	if (rdate) {
		// Moon-Regel aus dem echten Code: letzter Freitag vor Vollmond, 14:00 Lisbon
		const rule = { weekday: 5, phase: 'FULL_MOON', relation: 'LAST_BEFORE' } as const;
		const days: DateTime[] = [];
		for (let i = 1; i <= 260; i++) {
			const d = DateTime.now().setZone(TZ).plus({ days: i }).set({ hour: 14, minute: 0, second: 0, millisecond: 0 });
			if (matchesRelationToLunarPhase(d.toJSDate(), rule, lunarProvider)) days.push(d);
		}
		if (days.length < 4) throw new Error(`Nur ${days.length} Mond-Termine berechnet`);

		const extra = days.pop()!; // wird später angehängt, wie bei einer jährlichen Nachpflege
		const fmt = (d: DateTime) => d.toFormat("yyyyLLdd'T'HHmmss");
		const rdateLine = (ds: DateTime[]) => `RDATE;TZID=${TZ}:${ds.map(fmt).join(',')}`;
		const from = DateTime.now().setZone(TZ);
		const to = from.plus({ days: 300 });
		const dateOf = (e: Ev) => DateTime.fromISO(e.start!.dateTime!).setZone(TZ).toISODate();
		const moonId = 'spkm' + randomBytes(5).toString('hex');
		let moonCreated = false;

		try {
			await cal.events.insert({
				calendarId,
				requestBody: {
					id: moonId,
					summary: 'SPIKE Mond (kann gelöscht werden)',
					start: { dateTime: days[0].toISO()!, timeZone: TZ },
					end: { dateTime: days[0].plus({ hours: 1 }).toISO()!, timeZone: TZ },
					recurrence: [rdateLine(days.slice(1))],
					extendedProperties: {
						private: {
							source: 'week-plan',
							type: 'spike-moon',
							v: '2',
							'job.fire': JSON.stringify({ title: 'Fire Keeper', persons: 1 })
						}
					}
				}
			});
			moonCreated = true;
			ok('Serie nur mit RDATE (ohne RRULE) wird akzeptiert', rdateLine(days.slice(1)));

			const expected = days.map((d) => d.toISODate());
			const inst = await list(['type=spike-moon'], from, to);
			const got = inst.map(dateOf);
			check(
				JSON.stringify(got) === JSON.stringify(expected),
				`Instanzen entsprechen den ${expected.length} berechneten Mond-Terminen`,
				`erwartet ${expected.join(' ')} | erhalten ${got.join(' ')}`
			);
			check(!!priv(inst[1])['job.fire'], 'Instanzen erben job.* auch bei RDATE-Serie');
			info('Beispiel Instanz-ID', inst[1].id ?? '');

			// Ausnahmen anlegen, dann einen Termin nachträglich anhängen
			await patch(inst[1].id!, {
				extendedProperties: {
					private: { 'assign.fire': JSON.stringify({ persons: [{ id: 1, first_name: 'Test' }] }) }
				}
			});
			await patch(inst[2].id!, { status: 'cancelled' });
			await patch(moonId, { recurrence: [rdateLine([...days.slice(1), extra])] });

			const after = await list(['type=spike-moon'], from, to);
			const kept = after.find((e) => e.id === inst[1].id);
			check(
				after.some((e) => dateOf(e) === extra.toISODate()),
				'Nachträglich angehängter Mond-Termin erscheint',
				extra.toISODate() ?? ''
			);
			check(
				!!kept && !!priv(kept)['assign.fire'],
				'Eintragung überlebt das Anhängen eines RDATE',
				kept ? 'Instanz noch da' : 'Instanz-ID nicht mehr vorhanden'
			);
			check(
				after.length === days.length,
				'Abgesagter Termin bleibt nach dem Anhängen abgesagt',
				`${after.length} Instanzen (bleibt abgesagt: ${days.length}, zurückgesetzt: ${days.length + 1})`
			);

			log('\n--- Manueller UI-Test ---');
			log('Mit ?rdate&keep=1 aufrufen, den SPIKE-Mond-Termin im Kalender öffnen:');
			log('Wird die Serie sinnvoll angezeigt? Titel für "Alle Termine" ändern, dann prüfen mit:');
			log(`  GET /orga/api/spike-recurring-events?inspect=${moonId}`);
		} catch (e) {
			log('\nSpike abgebrochen: ' + errMsg(e));
		} finally {
			if (moonCreated && keep) {
				log(`\nkeep: Master ${moonId} bleibt im Test-Kalender bestehen.`);
			} else if (moonCreated) {
				await cal.events.delete({ calendarId, eventId: moonId }).catch(() => {});
				log(`\nAufgeräumt: Master ${moonId} (inkl. Instanzen) gelöscht.`);
			}
		}

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

		// 5b. Einen Job nur an einer Instanz überschreiben (z.B. 3 statt 2 Chefs am Dienstag)
		await patch(tue.id!, {
			extendedProperties: {
				private: { 'job.chef': JSON.stringify({ title: 'OVERRIDE', persons: 3 }) }
			}
		});
		await patch(masterId, {
			extendedProperties: {
				private: { 'job.chef': JSON.stringify({ title: 'CHANGED2', persons: 2 }) }
			}
		});
		const [tue3, wed3] = await Promise.all([get(tue.id!), get(wed.id!)]);
		check(
			priv(tue3)['job.chef']?.includes('OVERRIDE') === true,
			'Job-Override an einer Instanz bleibt nach erneuter Master-Änderung erhalten'
		);
		check(
			priv(wed3)['job.chef']?.includes('CHANGED2') === true,
			'Andere Instanzen sehen weiter die Master-Definition (live)'
		);
		check(!!priv(tue3)['job.cleaning'], 'Übrige Jobs der überschriebenen Instanz werden weiter geerbt');

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

		// 10. nur ohne keep: würde sonst die Ausnahmen für den manuellen UI-Test löschen
		if (!keep) {
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
		}

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
