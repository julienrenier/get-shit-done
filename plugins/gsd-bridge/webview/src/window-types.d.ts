/// <reference lib="dom" />

// Ambient declarations for the host-injected globals defined in
// plugins/gsd-bridge/webview/RENDERER-CONTRACT.md §3 + §2.1.
//
// Phase 1 hook (gsd-bridge-elicitation.cjs) prepends an inline <script> to
// dist/index.html that sets these properties before React mounts.
//
// __gsdSubmit / __gsdReset / __gsdCancel are routed by GsdButtonOverride per
// RENDERER-CONTRACT §2.1 when a Button spec carries `props.action`.
// __gsdPayloadProvider is registered by consumer screens (e.g. PocScreen) so
// the override can assemble a domain-specific payload at submit time.

declare global {
  interface Window {
    /** json-render spec (flat {root, elements} format) injected by the hook. */
    __gsdSpec?: unknown;
    /** Session id for routing the user response back to the correct elicitation. */
    __gsdSessionId?: string;
    /** Localhost sidecar URL used by the default __gsdSubmit shim (RENDERER-CONTRACT §3). */
    __gsdSubmitUrl?: string;
    /** Called by GsdButtonOverride when the user clicks a Button with action='submit'. */
    __gsdSubmit?: (response: unknown) => void | Promise<void>;
    /** Called by GsdButtonOverride when the user clicks a Button with action='reset'. */
    __gsdReset?: () => void;
    /** Called by GsdButtonOverride when the user clicks a Button with action='cancel'. */
    __gsdCancel?: () => void;
    /** Optional consumer-registered payload provider. Override calls it to build the submit payload. */
    __gsdPayloadProvider?: () => unknown;
  }
}

export {};
