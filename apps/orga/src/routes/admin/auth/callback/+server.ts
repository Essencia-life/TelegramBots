import type { RequestHandler } from '../$types';
import { env } from '$env/dynamic/private';

// TODO: refactor duplicated code parts

/**
 * List of supported OAuth providers.
 */
const supportedProviders = ['github', 'gitlab'] as const;
/**
 * Escape the given string for safe use in a regular expression.
 * @param {string} str - Original string.
 * @returns {string} Escaped string.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
 */
const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Output HTML response that communicates with the window opener.
 * @param {object} args - Options.
 * @param {string} [args.provider] - Backend name, e,g. `github`.
 * @param {string} [args.token] - OAuth token.
 * @param {string} [args.error] - Error message when an OAuth token is not available.
 * @param {string} [args.errorCode] - Error code to be used to localize the error message in
 * Sveltia CMS.
 * @returns {Response} Response with HTML.
 */
const outputHTML = ({ provider = 'unknown', token, error, errorCode }: any) => {
	const state = error ? 'error' : 'success';
	const content = error ? { provider, error, errorCode } : { provider, token };

	return new Response(
		`
      <!doctype html><html><body><script>
        (() => {
          window.addEventListener('message', ({ data, origin }) => {
            console.log(data, origin);
            if (data === 'authorizing:${provider}') {
              window.opener?.postMessage(
                'authorization:${provider}:${state}:${JSON.stringify(content)}',
                origin
              );
            }
          });
          console.log('sending');
          window.opener?.postMessage('authorizing:${provider}', '*');
        })();
      </script></body></html>
    `,
		{
			headers: {
				'Content-Type': 'text/html;charset=UTF-8',
				// Delete CSRF token
				'Set-Cookie': `csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure`
			}
		}
	);
};

/**
 * Handle the `callback` method, which is the second request in the authorization flow.
 * @param {Request} request - HTTP request.
 * @returns {Promise<Response>} HTTP response.
 */
const handleCallback = async (request: Request) => {
	const { url, headers } = request;
	const { origin, searchParams } = new URL(url);
	const { code, state } = Object.fromEntries(searchParams);

	const [, provider, csrfToken] =
		headers.get('Cookie')?.match(/\bcsrf-token=([a-z-]+?)_([0-9a-f]{32})\b/) ?? [];

	if (!provider || !supportedProviders.includes(provider as any)) {
		return outputHTML({
			error: 'Your Git backend is not supported by the authenticator.',
			errorCode: 'UNSUPPORTED_BACKEND'
		});
	}

	if (!code || !state) {
		return outputHTML({
			provider,
			error: 'Failed to receive an authorization code. Please try again later.',
			errorCode: 'AUTH_CODE_REQUEST_FAILED'
		});
	}

	if (!csrfToken || state !== csrfToken) {
		return outputHTML({
			provider,
			error: 'Potential CSRF attack detected. Authentication flow aborted.',
			errorCode: 'CSRF_DETECTED'
		});
	}

	const {
		CMS_GITHUB_CLIENT_ID,
		CMS_GITHUB_CLIENT_SECRET,
		CMS_GITHUB_HOSTNAME = 'github.com',
		CMS_GITLAB_CLIENT_ID,
		CMS_GITLAB_CLIENT_SECRET,
		CMS_GITLAB_HOSTNAME = 'gitlab.com'
	} = env;

	let tokenURL = '';
	let requestBody = {};

	// GitHub
	if (provider === 'github') {
		if (!CMS_GITHUB_CLIENT_ID || !CMS_GITHUB_CLIENT_SECRET) {
			return outputHTML({
				provider,
				error: 'OAuth app client ID or secret is not configured.',
				errorCode: 'MISCONFIGURED_CLIENT'
			});
		}

		tokenURL = `https://${CMS_GITHUB_HOSTNAME}/login/oauth/access_token`;
		requestBody = {
			code,
			client_id: CMS_GITHUB_CLIENT_ID,
			client_secret: CMS_GITHUB_CLIENT_SECRET
		};
	}

	if (provider === 'gitlab') {
		if (!CMS_GITLAB_CLIENT_ID || !CMS_GITLAB_CLIENT_SECRET) {
			return outputHTML({
				provider,
				error: 'OAuth app client ID or secret is not configured.',
				errorCode: 'MISCONFIGURED_CLIENT'
			});
		}

		tokenURL = `https://${CMS_GITLAB_HOSTNAME}/oauth/token`;
		requestBody = {
			code,
			client_id: CMS_GITLAB_CLIENT_ID,
			client_secret: CMS_GITLAB_CLIENT_SECRET,
			grant_type: 'authorization_code',
			redirect_uri: `${origin}/callback`
		};
	}

	let response;
	let token = '';
	let error = '';

	try {
		response = await fetch(tokenURL, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});
	} catch {
		//
	}

	if (!response) {
		return outputHTML({
			provider,
			error: 'Failed to request an access token. Please try again later.',
			errorCode: 'TOKEN_REQUEST_FAILED'
		});
	}

	try {
		({ access_token: token, error } = await response.json());
	} catch {
		return outputHTML({
			provider,
			error: 'Server responded with malformed data. Please try again later.',
			errorCode: 'MALFORMED_RESPONSE'
		});
	}

	return outputHTML({ provider, token, error });
};

/**
 * The main request handler.
 * @param {Request} request - HTTP request.
 * @returns {Promise<Response>} HTTP response.
 * @see https://developers.cloudflare.com/workers/runtime-apis/fetch/
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 * @see https://docs.gitlab.com/ee/api/oauth2.html#authorization-code-flow
 */
export const GET: RequestHandler = ({ request }) => {
	return handleCallback(request);
};
