export type MoonPhase =
	| 'NEW_MOON'
	| 'WAXING_CRESCENT'
	| 'FIRST_QUARTER'
	| 'WAXING_GIBBOUS'
	| 'FULL_MOON'
	| 'WANING_GIBBOUS'
	| 'LAST_QUARTER'
	| 'WANING_CRESCENT';

export type MoonPhaseTransition = {
	phase: MoonPhase;
	at: Date;
};

export interface LunarProvider {
	/**
	 * Liefert die Mondphase für den gegebenen Zeitpunkt/Tag.
	 * Für EXACT/NOT_EXACT wird damit gematcht.
	 */
	getPhaseAt(date: Date): MoonPhase;

	/**
	 * Liefert alle Phasenwechsel im Zeitraum.
	 * Wichtig: Wenn du Relations wie LAST_BEFORE/FIRST_AFTER sauber abdecken willst,
	 * sollte der Provider idealerweise alle 8 Phasenwechsel liefern.
	 */
	getPhaseTransitions(start: Date, end: Date): MoonPhaseTransition[];
}

const SYNODIC_MONTH = 29.530588853;
const SYNODIC_MONTH_MS = SYNODIC_MONTH * 24 * 60 * 60 * 1000;

/**
 * Bekannter Referenz-Neumond:
 * 2000-01-06T18:14:00Z
 *
 * Das ist die Basis für die Näherung.
 */
const KNOWN_NEW_MOON_UTC_MS = Date.UTC(2000, 0, 6, 18, 14, 0, 0);

const PHASE_FRACTIONS: Array<{ phase: MoonPhase; fraction: number }> = [
	{ phase: 'NEW_MOON', fraction: 0 / 8 },
	{ phase: 'WAXING_CRESCENT', fraction: 1 / 8 },
	{ phase: 'FIRST_QUARTER', fraction: 2 / 8 },
	{ phase: 'WAXING_GIBBOUS', fraction: 3 / 8 },
	{ phase: 'FULL_MOON', fraction: 4 / 8 },
	{ phase: 'WANING_GIBBOUS', fraction: 5 / 8 },
	{ phase: 'LAST_QUARTER', fraction: 6 / 8 },
	{ phase: 'WANING_CRESCENT', fraction: 7 / 8 }
];

function normalizeModulo(value: number, mod: number): number {
	return ((value % mod) + mod) % mod;
}

function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMs(date: Date, ms: number): Date {
	return new Date(date.getTime() + ms);
}

function phaseIndexFromAgeDays(ageDays: number): number {
	const segmentLength = SYNODIC_MONTH / 8;
	return Math.floor(normalizeModulo(ageDays, SYNODIC_MONTH) / segmentLength) % 8;
}

function phaseFromIndex(index: number): MoonPhase {
	return PHASE_FRACTIONS[index]!.phase;
}

function moonAgeDays(date: Date): number {
	const diffMs = date.getTime() - KNOWN_NEW_MOON_UTC_MS;
	return normalizeModulo(diffMs / (24 * 60 * 60 * 1000), SYNODIC_MONTH);
}

function cycleNumberAt(date: Date): number {
	const diffMs = date.getTime() - KNOWN_NEW_MOON_UTC_MS;
	return Math.floor(diffMs / SYNODIC_MONTH_MS);
}

function transitionDateForCycle(cycle: number, fraction: number): Date {
	return new Date(KNOWN_NEW_MOON_UTC_MS + (cycle + fraction) * SYNODIC_MONTH_MS);
}

export class ApproximateLunarProvider implements LunarProvider {
	getPhaseAt(date: Date): MoonPhase {
		const day = startOfLocalDay(date);
		const age = moonAgeDays(day);
		const index = phaseIndexFromAgeDays(age);
		return phaseFromIndex(index);
	}

	getPhaseTransitions(start: Date, end: Date): MoonPhaseTransition[] {
		const from = start.getTime();
		const to = end.getTime();

		if (to < from) {
			return [];
		}

		const startCycle = cycleNumberAt(addMs(start, -SYNODIC_MONTH_MS));
		const endCycle = cycleNumberAt(addMs(end, SYNODIC_MONTH_MS));

		const transitions: MoonPhaseTransition[] = [];

		for (let cycle = startCycle; cycle <= endCycle; cycle++) {
			for (const entry of PHASE_FRACTIONS) {
				const at = transitionDateForCycle(cycle, entry.fraction);
				const t = at.getTime();

				if (t >= from && t <= to) {
					transitions.push({
						phase: entry.phase,
						at
					});
				}
			}
		}

		transitions.sort((a, b) => a.at.getTime() - b.at.getTime());
		return transitions;
	}
}

export default new ApproximateLunarProvider();
