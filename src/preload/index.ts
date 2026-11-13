import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { CHANNEL_PATTERN, type IpcResult, type TbhApi } from './api';

const api: TbhApi = {
  invoke(channel, ...args) {
    if (!CHANNEL_PATTERN.test(channel)) return Promise.resolve({ ok: false, error: `Invalid channel "${channel}".` });
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult>;
  },
  on(channel, listener) {
    if (!CHANNEL_PATTERN.test(channel)) return () => {};
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld('tbh', api);
