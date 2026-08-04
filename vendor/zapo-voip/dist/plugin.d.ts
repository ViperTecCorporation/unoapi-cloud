import type { VoipEvents } from './events.js';
import { WaVoipCoordinator, type WaVoipCoordinatorOptions } from './WaVoipCoordinator.js';
export interface VoipPluginOptions extends WaVoipCoordinatorOptions {
}
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
export declare function voipPlugin(options?: VoipPluginOptions): import("zapo-js").WaClientPluginDefinition & {
    readonly exposeAs: "voip";
    readonly setup: (ctx: import("zapo-js").WaClientPluginContext) => WaVoipCoordinator;
    readonly __pluginEvents?: VoipEvents | undefined;
};
