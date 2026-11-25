import type { ParamMatcher } from '@sveltejs/kit';

// only the format: the matcher also runs in the browser, the rooms are checked in the layout load
export const match = ((param: string) => /^[a-z0-9-]+$/.test(param)) satisfies ParamMatcher;
