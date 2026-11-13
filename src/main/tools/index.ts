import { buildShareTool } from './build-share';
import { dataBrowserTool } from './data-browser';
import { liveRatesTool } from './live-rates';
import type { MainTool } from './types';

/**
 * Main-process side of every tool. To add a tool, create `src/main/tools/<id>.ts`, add it here,
 * and register its UI in `src/renderer/src/tools/registry.ts`. See docs/ADDING_A_TOOL.md.
 */
export const mainTools: MainTool[] = [buildShareTool, dataBrowserTool, liveRatesTool];
