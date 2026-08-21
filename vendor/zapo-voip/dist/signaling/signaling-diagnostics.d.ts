import type { BinaryNode } from 'zapo-js/transport';
export interface SafeCallNodeSummary {
    readonly tag: string;
    readonly attrs: Readonly<Record<string, string>>;
    readonly attributeNames: readonly string[];
    readonly contentKind: 'empty' | 'bytes' | 'text' | 'nodes';
    readonly contentBytes?: number;
    readonly childCount?: number;
    readonly children?: readonly SafeCallNodeSummary[];
}
/**
 * Captures call stanza routing and shape without serializing encrypted media,
 * relay tokens, keys or unknown attribute values. It is deliberately bounded
 * so a malformed stanza cannot expand production logs without limit.
 */
export declare function summarizeCallEnvelope(node: BinaryNode): SafeCallNodeSummary;
