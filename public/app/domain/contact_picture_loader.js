export class ContactPictureLoader {
    constructor(fetchPicture, options = {}) {
        this.fetchPicture = fetchPicture;
        this.urls = new Map();
        this.missing = new Map();
        this.pending = new Map();
        this.concurrency = Math.max(1, Math.min(8, options.concurrency || 4));
        this.maxEntries = Math.max(20, options.maxEntries || 500);
        this.positiveTtlMs = Math.max(1000, options.positiveTtlMs || 60 * 60 * 1000);
        this.missingTtlMs = Math.max(1000, options.missingTtlMs || 5 * 60 * 1000);
        this.now = options.now || (() => Date.now());
        this.createObjectUrl = options.createObjectUrl || ((blob) => URL.createObjectURL(blob));
        this.revokeObjectUrl = options.revokeObjectUrl || ((url) => URL.revokeObjectURL(url));
    }
    async hydrate(sessionPhone, contacts) {
        const queue = contacts.filter((contact) => !!contact.picture_id);
        let next = 0;
        const worker = async () => {
            while (next < queue.length) {
                const contact = queue[next++];
                const pictureId = contact.picture_id;
                const url = await this.load(sessionPhone, pictureId).catch(() => undefined);
                if (url)
                    contact.picture = url;
            }
        };
        await Promise.all(Array.from({ length: Math.min(this.concurrency, queue.length) }, worker));
    }
    clear() {
        for (const entry of this.urls.values())
            this.revokeObjectUrl(entry.url);
        this.urls.clear();
        this.missing.clear();
        this.pending.clear();
    }
    async load(sessionPhone, pictureId) {
        const key = `${sessionPhone}:${pictureId}`;
        const cached = this.urls.get(key);
        if (cached && cached.expiresAt > this.now())
            return cached.url;
        if (cached) {
            this.urls.delete(key);
            this.revokeObjectUrl(cached.url);
        }
        const missingUntil = this.missing.get(key) || 0;
        if (missingUntil > this.now())
            return undefined;
        this.missing.delete(key);
        const running = this.pending.get(key);
        if (running)
            return running;
        const request = this.fetchPicture(sessionPhone, pictureId)
            .then((blob) => {
            if (!blob) {
                this.rememberMissing(key);
                return undefined;
            }
            const url = this.createObjectUrl(blob);
            this.urls.set(key, { url, expiresAt: this.now() + this.positiveTtlMs });
            this.trim();
            return url;
        })
            .finally(() => this.pending.delete(key));
        this.pending.set(key, request);
        return request;
    }
    rememberMissing(key) {
        this.missing.set(key, this.now() + this.missingTtlMs);
        while (this.missing.size > this.maxEntries) {
            const oldest = this.missing.keys().next().value;
            if (oldest === undefined)
                break;
            this.missing.delete(oldest);
        }
    }
    trim() {
        while (this.urls.size > this.maxEntries) {
            const oldest = this.urls.entries().next().value;
            if (!oldest)
                break;
            this.urls.delete(oldest[0]);
            this.revokeObjectUrl(oldest[1].url);
        }
    }
}
