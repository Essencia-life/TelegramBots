import type { RequestHandler } from './$types';
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
            if (data === 'authorizing:${provider}') {
              window.opener?.postMessage(
                'authorization:${provider}:${state}:${JSON.stringify(content)}',
                origin
              );
            }
          });
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
 * Handle the `auth` method, which is the first request in the authorization flow.
 * @param {Request} request - HTTP request.
 * @returns {Promise<Response>} HTTP response.
 */
const handleAuth = async (request: Request) => {
	const { url } = request;
	const { origin, searchParams } = new URL(url);
	const { provider, site_id: domain } = Object.fromEntries(searchParams);

	if (!provider || !supportedProviders.includes(provider as any)) {
		return outputHTML({
			error: 'Your Git backend is not supported by the authenticator.',
			errorCode: 'UNSUPPORTED_BACKEND'
		});
	}

	const {
		ALLOWED_DOMAINS,
		CMS_GITHUB_CLIENT_ID,
		CMS_GITHUB_CLIENT_SECRET,
		CMS_GITHUB_HOSTNAME = 'github.com',
		CMS_GITLAB_CLIENT_ID,
		CMS_GITLAB_CLIENT_SECRET,
		CMS_GITLAB_HOSTNAME = 'gitlab.com'
	} = env;

	// Check if the domain is whitelisted
	if (
		ALLOWED_DOMAINS &&
		!ALLOWED_DOMAINS.split(/,/).some((str) =>
			// Escape the input, then replace a wildcard for regex
			(domain ?? '').match(new RegExp(`^${escapeRegExp(str.trim()).replace('\\*', '.+')}$`))
		)
	) {
		return outputHTML({
			provider,
			error: 'Your domain is not allowed to use the authenticator.',
			errorCode: 'UNSUPPORTED_DOMAIN'
		});
	}

	// Generate a random string for CSRF protection
	const csrfToken = globalThis.crypto.randomUUID().replaceAll('-', '');
	let authURL = '';

	// GitHub
	if (provider === 'github') {
		if (!CMS_GITHUB_CLIENT_ID || !CMS_GITHUB_CLIENT_SECRET) {
			return outputHTML({
				provider,
				error: 'OAuth app client ID or secret is not configured.',
				errorCode: 'MISCONFIGURED_CLIENT'
			});
		}

		const params = new URLSearchParams({
			client_id: CMS_GITHUB_CLIENT_ID,
			scope: 'repo,user',
			state: csrfToken
		});

		authURL = `https://${CMS_GITHUB_HOSTNAME}/login/oauth/authorize?${params.toString()}`;
	}

	// GitLab
	if (provider === 'gitlab') {
		if (!CMS_GITLAB_CLIENT_ID || !CMS_GITLAB_CLIENT_SECRET) {
			return outputHTML({
				provider,
				error: 'OAuth app client ID or secret is not configured.',
				errorCode: 'MISCONFIGURED_CLIENT'
			});
		}

		const params = new URLSearchParams({
			client_id: CMS_GITLAB_CLIENT_ID,
			redirect_uri: `${origin}/callback`,
			response_type: 'code',
			scope: 'api',
			state: csrfToken
		});

		authURL = `https://${CMS_GITLAB_HOSTNAME}/oauth/authorize?${params.toString()}`;
	}

	// Redirect to the authorization server
	return new Response('', {
		status: 302,
		headers: {
			Location: authURL,
			// Cookie expires in 10 minutes; Use `SameSite=Lax` to make sure the cookie is sent by the
			// browser after redirect
			'Set-Cookie':
				`csrf-token=${provider}_${csrfToken}; ` +
				`HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`
		}
	});
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
	return handleAuth(request);
};
