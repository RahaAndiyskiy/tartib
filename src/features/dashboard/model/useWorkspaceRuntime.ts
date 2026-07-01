import { useCallback, useEffect, useRef, useState } from 'react';
import {
  reconcileWorkspace,
  readActiveUserId,
  readWorkspace,
  writeActiveUserId,
  writeWorkspace,
  type LocalWorkspace
} from '@shared/lib/localWorkspace';
import { getSupabaseClient } from '@shared/lib/supabaseClient';
import type { DashboardSection } from '../types';

type WorkspaceRuntimeOptions = {
  activeSection: DashboardSection;
  debugPerformance: boolean;
  isLocalMode: boolean;
  setMessage: (message: string) => void;
};

type WorkspaceRuntime = {
  workspace: LocalWorkspace | null;
  activeUserId: string;
  workspaceLoadError: string;
  setWorkspace: React.Dispatch<React.SetStateAction<LocalWorkspace | null>>;
  setActiveUserId: React.Dispatch<React.SetStateAction<string>>;
  saveWorkspace: (nextWorkspace: LocalWorkspace) => void;
  refreshRemoteWorkspace: (reason: string, minIntervalMs?: number) => Promise<void>;
  runRemoteAction: (payload: Record<string, unknown>) => Promise<boolean>;
  runRemoteActionData: <T>(payload: Record<string, unknown>) => Promise<T | null>;
};

export function useWorkspaceRuntime({
  activeSection,
  debugPerformance,
  isLocalMode,
  setMessage
}: WorkspaceRuntimeOptions): WorkspaceRuntime {
  const [workspace, setWorkspace] = useState<LocalWorkspace | null>(null);
  const [activeUserId, setActiveUserId] = useState('');
  const [workspaceLoadError, setWorkspaceLoadError] = useState('');
  const remoteRefreshInFlightRef = useRef(false);
  const lastRemoteRefreshAtRef = useRef(0);

  const getAccessToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    const supabase = getSupabaseClient();
    const sessionResult = forceRefresh
      ? await supabase.auth.refreshSession()
      : await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;

    if (token || forceRefresh) {
      return token ?? null;
    }

    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? null;
  }, []);

  const loadRemoteWorkspace = useCallback(async (options: { silent?: boolean } = {}): Promise<boolean> => {
    const token = await getAccessToken();

    if (!token) {
      window.location.href = '/login';
      return false;
    }

    const start = performance.now();
    const requestWorkspace = (accessToken: string): Promise<Response> =>
      fetch('/api/workspace', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
    let response = await requestWorkspace(token);

    if (response.status === 401) {
      const refreshedToken = await getAccessToken(true);
      if (refreshedToken) {
        response = await requestWorkspace(refreshedToken);
      }
    }

    const data = (await response.json()) as {
      workspace?: LocalWorkspace;
      activeUserId?: string;
      error?: string;
    };
    if (debugPerformance) {
      console.info('[performance] client workspace load', `loadRemoteWorkspace ${Math.round(performance.now() - start)}ms`);
    }

    if (!response.ok || !data.workspace || !data.activeUserId) {
      const nextError = data.error ?? 'Не удалось загрузить данные клуба.';
      setWorkspaceLoadError(nextError);
      if (!options.silent) {
        setMessage(nextError);
      }
      return false;
    }

    setWorkspaceLoadError('');
    setWorkspace(data.workspace);
    setActiveUserId(data.activeUserId);
    return true;
  }, [debugPerformance, getAccessToken, setMessage]);

  const refreshRemoteWorkspace = useCallback(async (reason: string, minIntervalMs = 10_000): Promise<void> => {
    if (isLocalMode || remoteRefreshInFlightRef.current) return;

    const now = Date.now();
    if (minIntervalMs > 0 && now - lastRemoteRefreshAtRef.current < minIntervalMs) {
      return;
    }

    remoteRefreshInFlightRef.current = true;
    lastRemoteRefreshAtRef.current = now;

    try {
      const loaded = await loadRemoteWorkspace({ silent: reason !== 'initial' });
      if (loaded && debugPerformance) {
        console.info('[workspace] refreshed', reason);
      }
    } catch (error) {
      console.warn('[workspace] refresh failed', reason, error);
    } finally {
      remoteRefreshInFlightRef.current = false;
    }
  }, [debugPerformance, isLocalMode, loadRemoteWorkspace]);

  useEffect(() => {
    function syncWorkspace(): void {
      const nextWorkspace = readWorkspace();
      const savedActiveUserId = readActiveUserId();
      const nextActiveUser =
        nextWorkspace.users.find((user) => user.id === savedActiveUserId) ??
        nextWorkspace.users.find((user) => user.role === 'owner') ??
        nextWorkspace.users[0];

      setWorkspace(nextWorkspace);

      if (nextActiveUser) {
        setActiveUserId(nextActiveUser.id);
        writeActiveUserId(nextActiveUser.id);
      }
    }

    if (!isLocalMode) {
      void refreshRemoteWorkspace('initial', 0);
      const supabase = getSupabaseClient();
      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          window.location.href = '/login';
        }
      });

      return () => listener.subscription.unsubscribe();
    }

    syncWorkspace();
    const reminderTimer = window.setInterval(syncWorkspace, 60_000);
    window.addEventListener('storage', syncWorkspace);
    window.addEventListener('tartib-workspace-change', syncWorkspace);

    return () => {
      window.clearInterval(reminderTimer);
      window.removeEventListener('storage', syncWorkspace);
      window.removeEventListener('tartib-workspace-change', syncWorkspace);
    };
  }, [isLocalMode, refreshRemoteWorkspace]);

  useEffect(() => {
    if (isLocalMode) return;
    void refreshRemoteWorkspace(`section:${activeSection}`, 4_000);
  }, [activeSection, isLocalMode, refreshRemoteWorkspace]);

  useEffect(() => {
    if (isLocalMode) return;

    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void refreshRemoteWorkspace('visible', 5_000);
      }
    };
    const refreshOnFocus = (): void => {
      void refreshRemoteWorkspace('focus', 8_000);
    };
    const refreshOnPageShow = (): void => {
      void refreshRemoteWorkspace('pageshow', 0);
    };

    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('pageshow', refreshOnPageShow);
    const remoteRefreshTimer = window.setInterval(() => {
      void refreshRemoteWorkspace('interval', 60_000);
    }, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('pageshow', refreshOnPageShow);
      window.clearInterval(remoteRefreshTimer);
    };
  }, [isLocalMode, refreshRemoteWorkspace]);

  const saveWorkspace = useCallback((nextWorkspace: LocalWorkspace): void => {
    const reconciledWorkspace = reconcileWorkspace(nextWorkspace);
    writeWorkspace(reconciledWorkspace);
    setWorkspace(reconciledWorkspace);
  }, []);

  const runRemoteActionData = useCallback(async <T,>(payload: Record<string, unknown>): Promise<T | null> => {
    const token = await getAccessToken();
    if (!token) {
      window.location.href = '/login';
      return null;
    }

    const start = performance.now();
    const requestAction = (accessToken: string): Promise<Response> =>
      fetch('/api/workspace/actions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
    let response = await requestAction(token);

    if (response.status === 401) {
      const refreshedToken = await getAccessToken(true);
      if (refreshedToken) {
        response = await requestAction(refreshedToken);
      }
    }

    const data = (await response.json()) as T & { error?: string };
    if (debugPerformance) {
      console.info('[performance] action', `runRemoteAction ${Math.round(performance.now() - start)}ms`, payload.action ?? 'unknown');
    }

    if (!response.ok) {
      setMessage(data.error ?? 'Не удалось выполнить действие.');
      return null;
    }

    return data;
  }, [debugPerformance, getAccessToken, setMessage]);

  const runRemoteAction = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    const data = await runRemoteActionData<{ ok: boolean }>(payload);
    return Boolean(data);
  }, [runRemoteActionData]);

  return {
    workspace,
    activeUserId,
    workspaceLoadError,
    setWorkspace,
    setActiveUserId,
    saveWorkspace,
    refreshRemoteWorkspace,
    runRemoteAction,
    runRemoteActionData
  };
}
