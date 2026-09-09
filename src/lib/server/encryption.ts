import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { PARAM_ENCRYPTION_KEY } from '$env/static/private';

console.log(encryptParam({ id: 48968362, first_name: 'Ben' }));

export function encryptParam(data: unknown) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', Buffer.from(PARAM_ENCRYPTION_KEY, 'hex'), iv);

	const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);

	const authTag = cipher.getAuthTag();

	const payload = Buffer.concat([iv, encrypted, authTag]);

	return payload.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decryptParam(encoded: string) {
	const base64 =
		encoded.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((encoded.length + 3) % 4);

	const payload = Buffer.from(base64, 'base64');

	const iv = payload.subarray(0, 12);
	const authTag = payload.subarray(payload.length - 16);
	const encrypted = payload.subarray(12, payload.length - 16);

	const decipher = createDecipheriv('aes-256-gcm', Buffer.from(PARAM_ENCRYPTION_KEY, 'hex'), iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

	return JSON.parse(decrypted.toString('utf8'));
}
