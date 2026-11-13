import type { ComponentType } from 'react';
import type { AppStatus } from '@shared/types';
import { BuildShare } from './build-share';
import { DataBrowser } from './data-browser';
import { LiveRates } from './live-rates';
import { Settings } from './settings';

export interface ToolProps {
  /** Latest app status (paths, game version, save time, errors). Undefined while starting. */
  status: AppStatus | undefined;
}

export interface ToolDefinition {
  /** Must match the id of the tool's main-process module, if it has one. */
  id: string;
  title: string;
  description: string;
  /** A single glyph shown in the sidebar. */
  icon: string;
  component: ComponentType<ToolProps>;
}

/**
 * Every tool shown in the sidebar, in order. To add a tool, create a folder next to this file,
 * export a component, and add one entry here. See docs/ADDING_A_TOOL.md.
 */
export const tools: ToolDefinition[] = [
  {
    id: 'build-share',
    title: 'Build Share',
    description: 'View your build, share it as a code, and compare with friends',
    icon: '⚔',
    component: BuildShare,
  },
  {
    id: 'live-rates',
    title: 'Live Rates',
    description: 'XP and gold per hour, updated as the game autosaves',
    icon: '↗',
    component: LiveRates,
  },
  {
    id: 'data-browser',
    title: 'Data Browser',
    description: 'Browse the tables datamined from your game install',
    icon: '▦',
    component: DataBrowser,
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Game and save folders, status and about',
    icon: '⚙',
    component: Settings,
  },
];
