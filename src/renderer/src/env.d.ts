import type { TbhApi } from '../../preload/api';

declare global {
  interface Window {
    tbh: TbhApi;
  }
}

export {};
