import type { ParamMatcher } from '@sveltejs/kit';

export const match = ((param: string): param is `${number}-${number}-${number}` => {
	return /^\d{4}-\d{2}-\d{2}$/.test(param);
}) satisfies ParamMatcher;
