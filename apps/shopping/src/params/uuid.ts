import type { ParamMatcher } from '@sveltejs/kit';
import type { UUID } from 'crypto';

export const match = ((param: string): param is UUID => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(param);
}) satisfies ParamMatcher;