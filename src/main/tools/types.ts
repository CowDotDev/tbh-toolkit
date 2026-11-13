import type { AppCore } from '../core/app-core';
import type { JsonStore } from '../core/store';

/** What the app hands to each tool's main-process module. */
export interface ToolContext {
  /** Shared services: game tables (`core.game`), the latest save (`core.snapshot`), events. */
  core: AppCore;
  /** Registers an IPC handler reachable from the renderer as `call('<toolId>:<name>', ...args)`. */
  handle(name: string, fn: (...args: unknown[]) => unknown): void;
  /** Sends an event to the renderer; subscribe with `useEvent('<toolId>:<event>', ...)`. */
  emit(event: string, payload?: unknown): void;
  /** JSON persistence in the app's user-data folder, namespaced by tool id. */
  store<T>(name: string, fallback: T): JsonStore<T>;
}

export interface MainTool {
  /** Must match the renderer tool's id. Lowercase letters, digits and dashes. */
  id: string;
  register(ctx: ToolContext): void;
  /** Called before the app quits. */
  dispose?(): void;
}
