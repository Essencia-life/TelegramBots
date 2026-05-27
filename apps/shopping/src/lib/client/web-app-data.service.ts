import type { WebAppUser } from 'telegram-web-app';
import { verifyInitData } from '$lib/remote/init-data.remote';
import WebApp from '@twa-dev/sdk';

let isValidPromise: Promise<void>;

class WebAppDataService {
	async getUser(): Promise<WebAppUser> {
		await this.verifyUserData();
		return WebApp.default.initDataUnsafe.user as WebAppUser;
	}

	private async verifyUserData() {
		try {
			if (!isValidPromise) {
				isValidPromise = verifyInitData(WebApp.default.initData);
			}

			await isValidPromise;
		} catch {
			try {
				WebApp.default.showAlert('Invalid or outdated init data');
				WebApp.default.close();
			} catch {
				throw new Error('Invalid or outdated init data');
			}
		}
	}
}

export default new WebAppDataService();
