export class SocketBridge {
    constructor(baseUrl, socketFactory = window.io) {
        this.baseUrl = baseUrl;
        this.socketFactory = socketFactory;
        this.phone = '';
    }
    subscribe(phone, listener) {
        this.phone = phone;
        this.listener = listener;
        const socket = this.ensureSocket();
        if (!socket)
            return;
        if (socket.connected)
            socket.emit('subscribe_qr', { phone });
        else
            socket.on('connect', () => socket.emit('subscribe_qr', { phone }));
    }
    clear() {
        this.phone = '';
        this.listener = undefined;
    }
    ensureSocket() {
        if (this.socket || !this.socketFactory)
            return this.socket;
        this.socket = this.socketFactory(this.baseUrl, { path: '/ws' });
        this.socket.on('broadcast', (payload) => {
            const event = payload;
            if (!this.phone || `${event?.phone || ''}` !== this.phone)
                return;
            this.listener?.(event);
        });
        return this.socket;
    }
}
