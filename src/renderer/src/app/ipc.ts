import { useCallback, useEffect, useRef, useState } from 'react';

/** Calls a main-process handler and unwraps the result, throwing a readable Error on failure. */
export async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = await window.tbh.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value as T;
}

/** Subscribes to a main-process event for the lifetime of the component. */
export function useEvent(channel: string, handler: (payload: unknown) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => window.tbh.on(channel, (payload) => ref.current(payload)), [channel]);
}

export interface Query<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data from a main-process handler and reloads it whenever one of `refreshOn` events fires
 * (e.g. 'core:save' after the game autosaves).
 */
export function useQuery<T>(channel: string, args: unknown[] = [], refreshOn: string[] = []): Query<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(args);
  const seq = useRef(0);

  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    call<T>(channel, ...(JSON.parse(key) as unknown[]))
      .then((value) => {
        if (id !== seq.current) return;
        setData(value);
        setError(null);
      })
      .catch((err: Error) => {
        if (id === seq.current) setError(err.message);
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, [channel, key]);

  useEffect(reload, [reload]);
  const events = refreshOn.join(',');
  useEffect(() => {
    const offs = events ? events.split(',').map((e) => window.tbh.on(e, reload)) : [];
    return () => offs.forEach((off) => off());
  }, [events, reload]);

  return { data, error, loading, reload };
}
