import { redis } from "$lib/server/utils/redis";
import { storageKey } from "$lib/server/utils/config";

const path = '$.messageId';

class LastMessageIdService {
    async getId(): Promise<number | undefined> {
        return (await redis.json.get<[number]>(storageKey, path))?.[0];
    }

    async setId(messageId: number) {
        await redis.json.set(storageKey, path, JSON.stringify(messageId));
    }

    async deleteId() {
        await redis.json.del(storageKey, path);
    }
}

export default new LastMessageIdService();