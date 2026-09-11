// Context 单 store：启动一次性拉 /api/bootstrap；写操作后调 refreshBoot()；
// Toast 队列（约 2.6s 自动消失）；语言存 localStorage
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { makeT, type Lang, type TFunc } from './i18n';
import type { BootData, User } from './types';

interface Toast {
  id: number;
  msg: string;
  kind: 'ok' | 'err';
}

interface StoreValue {
  boot: BootData | null;
  bootLoading: boolean;
  t: TFunc;
  lang: Lang;
  user: User | null;
  toasts: Toast[];
  refreshBoot: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  toast: (msg: string, kind?: 'ok' | 'err') => void;
  onApiError: (err: unknown) => void;
}

const StoreCtx = createContext<StoreValue | null>(null);

let toastSeq = 1;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lang] = useState<Lang>(() => (localStorage.getItem('lang') === 'en' ? 'en' : 'zh'));
  const [boot, setBoot] = useState<BootData | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const t = useMemo(() => makeT(lang), [lang]);

  const toast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
    const id = toastSeq++;
    setToasts((prev) => [...prev, { id, msg, kind }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, 2600);
    timers.current.set(id, timer);
  }, []);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
  }, []);

  const refreshBoot = useCallback(async () => {
    const data = await api.bootstrap();
    setBoot(data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshBoot();
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
      } finally {
        setBootLoading(false);
      }
    })();
  }, [refreshBoot]);

  const login = useCallback(async (username: string, password: string) => {
    await api.login(username, password);
    await refreshBoot();
  }, [refreshBoot]);

  const logout = useCallback(async () => {
    await api.logout();
    setBoot(null);
  }, []);

  const onApiError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        setBoot(null);
        return;
      }
      toast(err.message, 'err');
    } else {
      toast(t('failed'), 'err');
    }
  }, [toast, t]);

  return (
    <StoreCtx.Provider value={{ boot, bootLoading, t, lang, user: boot?.user ?? null, toasts, refreshBoot, login, logout, toast, onApiError }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore(): StoreValue {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}
