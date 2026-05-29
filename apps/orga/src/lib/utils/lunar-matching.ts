import type { LunarProvider, MoonPhase, MoonPhaseTransition } from '$lib/utils/lunar-provider.ts';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // wie Date.getDay()

export type LunarRelation =
	| 'EXACT'
	| 'NOT_EXACT'
	| 'LAST_BEFORE'
	| 'NOT_LAST_BEFORE'
	| 'LAST_ON_OR_BEFORE'
	| 'NOT_LAST_ON_OR_BEFORE'
	| 'FIRST_AFTER'
	| 'NOT_FIRST_AFTER'
	| 'FIRST_ON_OR_AFTER'
	| 'NOT_FIRST_ON_OR_AFTER';

export type EventRule = {
	weekday: Weekday;
	phase: MoonPhase;
	relation: LunarRelation;
};

/* =========================
 * Date helpers
 * ========================= */

function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function isSameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function isBeforeLocalDay(a: Date, b: Date): boolean {
	return startOfLocalDay(a).getTime() < startOfLocalDay(b).getTime();
}

function isAfterLocalDay(a: Date, b: Date): boolean {
	return startOfLocalDay(a).getTime() > startOfLocalDay(b).getTime();
}

function isOnOrBeforeLocalDay(a: Date, b: Date): boolean {
	return startOfLocalDay(a).getTime() <= startOfLocalDay(b).getTime();
}

function isOnOrAfterLocalDay(a: Date, b: Date): boolean {
	return startOfLocalDay(a).getTime() >= startOfLocalDay(b).getTime();
}

function matchesWeekday(date: Date, weekday?: Weekday): boolean {
	return weekday == null || date.getDay() === weekday;
}

function moveBackwardToWeekday(from: Date, weekday: Weekday, inclusive: boolean): Date {
	let d = startOfLocalDay(from);

	if (!inclusive) {
		d = addDays(d, -1);
	}

	while (d.getDay() !== weekday) {
		d = addDays(d, -1);
	}

	return d;
}

function moveForwardToWeekday(from: Date, weekday: Weekday, inclusive: boolean): Date {
	let d = startOfLocalDay(from);

	if (!inclusive) {
		d = addDays(d, 1);
	}

	while (d.getDay() !== weekday) {
		d = addDays(d, 1);
	}

	return d;
}

/* =========================
 * Phase lookup helpers
 * ========================= */

function getTransitionsForPhase(
	provider: LunarProvider,
	phase: MoonPhase,
	aroundDate: Date,
	windowDays = 60
): MoonPhaseTransition[] {
	const start = addDays(startOfLocalDay(aroundDate), -windowDays);
	const end = addDays(startOfLocalDay(aroundDate), windowDays);

	return provider
		.getPhaseTransitions(start, end)
		.filter((t) => t.phase === phase)
		.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function findNextPhaseTransition(
	provider: LunarProvider,
	phase: MoonPhase,
	fromDate: Date,
	inclusive: boolean
): MoonPhaseTransition | null {
	const transitions = getTransitionsForPhase(provider, phase, fromDate);

	for (const t of transitions) {
		const ok = inclusive ? isOnOrAfterLocalDay(t.at, fromDate) : isAfterLocalDay(t.at, fromDate);

		if (ok) return t;
	}

	return null;
}

function findPreviousPhaseTransition(
	provider: LunarProvider,
	phase: MoonPhase,
	fromDate: Date,
	inclusive: boolean
): MoonPhaseTransition | null {
	const transitions = getTransitionsForPhase(provider, phase, fromDate);

	for (let i = transitions.length - 1; i >= 0; i--) {
		const t = transitions[i];
		const ok = inclusive ? isOnOrBeforeLocalDay(t.at, fromDate) : isBeforeLocalDay(t.at, fromDate);

		if (ok) return t;
	}

	return null;
}

/* =========================
 * Core matchers
 * ========================= */

function matchExactPhase(date: Date, phase: MoonPhase, provider: LunarProvider): boolean {
	return provider.getPhaseAt(date) === phase;
}

function matchLastBefore(
	date: Date,
	weekday: Weekday,
	phase: MoonPhase,
	provider: LunarProvider
): boolean {
	if (date.getDay() !== weekday) return false;

	const nextPhase = findNextPhaseTransition(provider, phase, date, false);
	if (!nextPhase) return false;

	const target = moveBackwardToWeekday(nextPhase.at, weekday, false);
	return isSameLocalDay(date, target);
}

function matchLastOnOrBefore(
	date: Date,
	weekday: Weekday,
	phase: MoonPhase,
	provider: LunarProvider
): boolean {
	if (date.getDay() !== weekday) return false;

	const nextOrSamePhase = findNextPhaseTransition(provider, phase, date, true);
	if (!nextOrSamePhase) return false;

	const target = moveBackwardToWeekday(nextOrSamePhase.at, weekday, true);
	return isSameLocalDay(date, target);
}

function matchFirstAfter(
	date: Date,
	weekday: Weekday,
	phase: MoonPhase,
	provider: LunarProvider
): boolean {
	if (date.getDay() !== weekday) return false;

	const previousPhase = findPreviousPhaseTransition(provider, phase, date, false);
	if (!previousPhase) return false;

	const target = moveForwardToWeekday(previousPhase.at, weekday, false);
	return isSameLocalDay(date, target);
}

function matchFirstOnOrAfter(
	date: Date,
	weekday: Weekday,
	phase: MoonPhase,
	provider: LunarProvider
): boolean {
	if (date.getDay() !== weekday) return false;

	const previousOrSamePhase = findPreviousPhaseTransition(provider, phase, date, true);
	if (!previousOrSamePhase) return false;

	const target = moveForwardToWeekday(previousOrSamePhase.at, weekday, true);
	return isSameLocalDay(date, target);
}

/* =========================
 * Public API
 * ========================= */

export function matchesRelationToLunarPhase(
	date: Date,
	rule: EventRule,
	provider: LunarProvider
): boolean {
	const day = startOfLocalDay(date);
	const { weekday, phase, relation } = rule;

	switch (relation) {
		case 'EXACT':
			return matchesWeekday(day, weekday) && matchExactPhase(day, phase, provider);

		case 'NOT_EXACT':
			return matchesWeekday(day, weekday) && !matchExactPhase(day, phase, provider);

		case 'LAST_BEFORE':
			if (weekday == null) return false;
			return matchLastBefore(day, weekday, phase, provider);

		case 'NOT_LAST_BEFORE':
			if (!matchesWeekday(day, weekday)) return false;
			if (weekday == null) return false;
			return !matchLastBefore(day, weekday, phase, provider);

		case 'LAST_ON_OR_BEFORE':
			if (weekday == null) return false;
			return matchLastOnOrBefore(day, weekday, phase, provider);

		case 'NOT_LAST_ON_OR_BEFORE':
			if (!matchesWeekday(day, weekday)) return false;
			if (weekday == null) return false;
			return !matchLastOnOrBefore(day, weekday, phase, provider);

		case 'FIRST_AFTER':
			if (weekday == null) return false;
			return matchFirstAfter(day, weekday, phase, provider);

		case 'NOT_FIRST_AFTER':
			if (!matchesWeekday(day, weekday)) return false;
			if (weekday == null) return false;
			return !matchFirstAfter(day, weekday, phase, provider);

		case 'FIRST_ON_OR_AFTER':
			if (weekday == null) return false;
			return matchFirstOnOrAfter(day, weekday, phase, provider);

		case 'NOT_FIRST_ON_OR_AFTER':
			if (!matchesWeekday(day, weekday)) return false;
			if (weekday == null) return false;
			return !matchFirstOnOrAfter(day, weekday, phase, provider);

		default: {
			throw new Error(`Unsupported relation: ${relation}`);
		}
	}
}
