"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voipPlugin = voipPlugin;
const zapo_js_1 = require("zapo-js");
const WaVoipCoordinator_js_1 = require("./WaVoipCoordinator.js");
/**
 * WaClient plugin that exposes {@link WaVoipCoordinator} at `client.voip`.
 *
 * @example
 * ```ts
 * import { WaClient } from 'zapo-js'
 * import { voipPlugin } from '@zapo-js/voip'
 *
 * const client = new WaClient({
 *   store,
 *   sessionId: 'main',
 *   plugins: [voipPlugin({ maxConcurrentCalls: 2 })]
 * })
 *
 * client.on('voip_call_incoming', (call) => {
 *   console.log('incoming', call.callId)
 * })
 * ```
 */
function voipPlugin(options = {}) {
    return (0, zapo_js_1.defineWaClientPlugin)({
        id: '@zapo-js/voip',
        exposeAs: 'voip',
        setup(ctx) {
            return new WaVoipCoordinator_js_1.WaVoipCoordinator(ctx, options);
        },
        dispose(coordinator) {
            coordinator.dispose();
        }
    });
}
