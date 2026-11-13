/** The only surface the renderer can reach: `window.tbh`. */
export interface TbhApi {
  /** Calls a main-process handler, e.g. invoke('build-share:mine'). Resolves to an IpcResult. */
  invoke(channel: string, ...args: unknown[]): Promise<IpcResult>;
  /** Subscribes to a main-process event. Returns an unsubscribe function. */
  on(channel: string, listener: (payload: unknown) => void): () => void;
}

export type IpcResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Channels look like "<scope>:<name>", e.g. "core:status" or "build-share:export". */
export const CHANNEL_PATTERN = /^[a-z0-9-]+:[A-Za-z0-9]+$/;
