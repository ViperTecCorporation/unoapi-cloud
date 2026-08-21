const SAFE_ATTRIBUTE_NAMES = new Set([
    'from',
    'to',
    'id',
    'type',
    'class',
    'error',
    'call-id',
    'call-creator',
    'mute-state',
    'transport-message-type',
    'p2p-cand-round',
    'relay_id',
    'elected_relay_idx',
    'relay_name',
    'latency',
    'protocol',
    'token_id',
    'auth_token_id',
    'is_fna',
    'c2r_rtt',
    'medium',
    'encopt',
    'v',
    'mediatype',
    'audio_rate',
    'is_call_ended',
    'terminate_reason'
]);
function summarizeNode(node, depth) {
    const attributeNames = Object.keys(node.attrs ?? {}).sort();
    const attrs = Object.fromEntries(attributeNames
        .filter((name) => SAFE_ATTRIBUTE_NAMES.has(name))
        .map((name) => [name, node.attrs[name]]));
    const content = node.content;
    if (content instanceof Uint8Array) {
        return {
            tag: node.tag,
            attrs,
            attributeNames,
            contentKind: 'bytes',
            contentBytes: content.byteLength
        };
    }
    if (typeof content === 'string') {
        return {
            tag: node.tag,
            attrs,
            attributeNames,
            contentKind: 'text',
            contentBytes: new TextEncoder().encode(content).byteLength
        };
    }
    if (Array.isArray(content)) {
        const children = content.filter((child) => typeof child === 'object' && child !== null && 'tag' in child);
        return {
            tag: node.tag,
            attrs,
            attributeNames,
            contentKind: 'nodes',
            childCount: children.length,
            ...(depth > 0
                ? { children: children.map((child) => summarizeNode(child, depth - 1)) }
                : {})
        };
    }
    return {
        tag: node.tag,
        attrs,
        attributeNames,
        contentKind: 'empty'
    };
}
/**
 * Captures call stanza routing and shape without serializing encrypted media,
 * relay tokens, keys or unknown attribute values. It is deliberately bounded
 * so a malformed stanza cannot expand production logs without limit.
 */
export function summarizeCallEnvelope(node) {
    return summarizeNode(node, 3);
}
