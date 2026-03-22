import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppSettings,
  TailscaleDaemonCommandPreview,
  TailscaleStatus,
  TcpDaemonStatus,
} from "@/types";
import { translate } from "@/i18n/translate";
import {
  listWorkspaces,
  tailscaleDaemonCommandPreview as fetchTailscaleDaemonCommandPreview,
  tailscaleDaemonStart,
  tailscaleDaemonStatus,
  tailscaleDaemonStop,
  tailscaleStatus as fetchTailscaleStatus,
} from "@services/tauri";
import { isMobilePlatform } from "@utils/platformPaths";
import { DEFAULT_REMOTE_HOST } from "@settings/components/settingsViewConstants";

type UseSettingsServerSectionArgs = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  onMobileConnectSuccess?: () => Promise<void> | void;
};

export type AddRemoteBackendDraft = {
  name: string;
  host: string;
  token: string;
};

export type SettingsServerSectionProps = {
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
  isMobilePlatform: boolean;
  mobileConnectBusy: boolean;
  mobileConnectStatusText: string | null;
  mobileConnectStatusError: boolean;
  remoteBackends: AppSettings["remoteBackends"];
  activeRemoteBackendId: string | null;
  remoteStatusText: string | null;
  remoteStatusError: boolean;
  remoteNameError: string | null;
  remoteHostError: string | null;
  remoteNameDraft: string;
  remoteHostDraft: string;
  remoteTokenDraft: string;
  nextRemoteNameSuggestion: string;
  tailscaleStatus: TailscaleStatus | null;
  tailscaleStatusBusy: boolean;
  tailscaleStatusError: string | null;
  tailscaleCommandPreview: TailscaleDaemonCommandPreview | null;
  tailscaleCommandBusy: boolean;
  tailscaleCommandError: string | null;
  tcpDaemonStatus: TcpDaemonStatus | null;
  tcpDaemonBusyAction: "start" | "stop" | "status" | null;
  onSetRemoteNameDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteHostDraft: Dispatch<SetStateAction<string>>;
  onSetRemoteTokenDraft: Dispatch<SetStateAction<string>>;
  onCommitRemoteName: () => Promise<void>;
  onCommitRemoteHost: () => Promise<void>;
  onCommitRemoteToken: () => Promise<void>;
  onSelectRemoteBackend: (id: string) => Promise<void>;
  onAddRemoteBackend: (draft: AddRemoteBackendDraft) => Promise<void>;
  onMoveRemoteBackend: (id: string, direction: "up" | "down") => Promise<void>;
  onDeleteRemoteBackend: (id: string) => Promise<void>;
  onRefreshTailscaleStatus: () => void;
  onRefreshTailscaleCommandPreview: () => void;
  onUseSuggestedTailscaleHost: () => Promise<void>;
  onTcpDaemonStart: () => Promise<void>;
  onTcpDaemonStop: () => Promise<void>;
  onTcpDaemonStatus: () => Promise<void>;
  onMobileConnectTest: () => void;
};

const formatErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return fallback;
};

type RemoteBackendTarget = AppSettings["remoteBackends"][number];

const createRemoteBackendId = () =>
  `remote-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const buildFallbackRemoteBackend = (settings: AppSettings): RemoteBackendTarget => ({
  id: settings.activeRemoteBackendId ?? "remote-default",
  name: translate("settings:server.primaryRemoteName"),
  provider: "tcp",
  host: settings.remoteBackendHost,
  token: settings.remoteBackendToken,
  lastConnectedAtMs: null,
});

const getConfiguredRemoteBackends = (settings: AppSettings): RemoteBackendTarget[] => {
  if (settings.remoteBackends.length > 0) {
    return settings.remoteBackends;
  }
  return [buildFallbackRemoteBackend(settings)];
};

const getActiveRemoteBackend = (settings: AppSettings): RemoteBackendTarget => {
  const configured = getConfiguredRemoteBackends(settings);
  return configured.find((entry) => entry.id === settings.activeRemoteBackendId) ?? configured[0];
};

const validateRemoteHost = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return translate("settings:server.hostRequired");
  }
  const match = trimmed.match(/^([^:\s]+|\[[^\]]+\]):([0-9]{1,5})$/);
  if (!match) {
    return translate("settings:server.hostFormat");
  }
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return translate("settings:server.portRange");
  }
  return null;
};

const buildNextRemoteName = (remoteBackends: RemoteBackendTarget[]) => {
  const normalized = new Set(remoteBackends.map((entry) => entry.name.trim().toLowerCase()));
  let index = remoteBackends.length + 1;
  let candidate = `${translate("settings:server.remoteNamePrefix")} ${index}`;
  while (normalized.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${translate("settings:server.remoteNamePrefix")} ${index}`;
  }
  return candidate;
};

export const useSettingsServerSection = ({
  appSettings,
  onUpdateAppSettings,
  onMobileConnectSuccess,
}: UseSettingsServerSectionArgs): SettingsServerSectionProps => {
  const initialActiveRemoteBackend = getActiveRemoteBackend(appSettings);
  const [remoteNameDraft, setRemoteNameDraft] = useState(initialActiveRemoteBackend.name);
  const [remoteHostDraft, setRemoteHostDraft] = useState(initialActiveRemoteBackend.host);
  const [remoteTokenDraft, setRemoteTokenDraft] = useState(initialActiveRemoteBackend.token ?? "");
  const [remoteStatusText, setRemoteStatusText] = useState<string | null>(null);
  const [remoteStatusError, setRemoteStatusError] = useState(false);
  const [remoteNameError, setRemoteNameError] = useState<string | null>(null);
  const [remoteHostError, setRemoteHostError] = useState<string | null>(null);
  const [tailscaleStatus, setTailscaleStatus] = useState<TailscaleStatus | null>(null);
  const [tailscaleStatusBusy, setTailscaleStatusBusy] = useState(false);
  const [tailscaleStatusError, setTailscaleStatusError] = useState<string | null>(null);
  const [tailscaleCommandPreview, setTailscaleCommandPreview] =
    useState<TailscaleDaemonCommandPreview | null>(null);
  const [tailscaleCommandBusy, setTailscaleCommandBusy] = useState(false);
  const [tailscaleCommandError, setTailscaleCommandError] = useState<string | null>(null);
  const [tcpDaemonStatus, setTcpDaemonStatus] = useState<TcpDaemonStatus | null>(null);
  const [tcpDaemonBusyAction, setTcpDaemonBusyAction] = useState<
    "start" | "stop" | "status" | null
  >(null);
  const [mobileConnectBusy, setMobileConnectBusy] = useState(false);
  const [mobileConnectStatusText, setMobileConnectStatusText] = useState<string | null>(null);
  const [mobileConnectStatusError, setMobileConnectStatusError] = useState(false);
  const mobilePlatform = useMemo(() => isMobilePlatform(), []);

  const latestSettingsRef = useRef(appSettings);
  const activeRemoteBackend = useMemo(() => getActiveRemoteBackend(appSettings), [appSettings]);

  const setRemoteStatus = useCallback((message: string | null, isError = false) => {
    setRemoteStatusText(message);
    setRemoteStatusError(isError);
  }, []);

  useEffect(() => {
    latestSettingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    setRemoteNameDraft(activeRemoteBackend.name);
    setRemoteHostDraft(activeRemoteBackend.host);
    setRemoteTokenDraft(activeRemoteBackend.token ?? "");
    setRemoteNameError(null);
    setRemoteHostError(null);
  }, [activeRemoteBackend]);

  const normalizeRemoteBackendEntry = (
    entry: RemoteBackendTarget,
    index: number,
  ): RemoteBackendTarget => ({
    id: entry.id?.trim() || `remote-${index + 1}`,
    name: entry.name?.trim() || `Remote ${index + 1}`,
    provider: "tcp",
    host: entry.host?.trim() || DEFAULT_REMOTE_HOST,
    token: entry.token?.trim() ? entry.token.trim() : null,
    lastConnectedAtMs:
      typeof entry.lastConnectedAtMs === "number" && Number.isFinite(entry.lastConnectedAtMs)
        ? entry.lastConnectedAtMs
        : null,
  });

  const buildSettingsFromRemoteBackends = useCallback(
    (
      latestSettings: AppSettings,
      remoteBackends: RemoteBackendTarget[],
      preferredActiveId?: string | null,
    ): AppSettings => {
      const normalizedBackends = remoteBackends.length
        ? remoteBackends.map(normalizeRemoteBackendEntry)
        : [normalizeRemoteBackendEntry(buildFallbackRemoteBackend(latestSettings), 0)];
      const active =
        normalizedBackends.find((entry) => entry.id === preferredActiveId) ??
        normalizedBackends.find((entry) => entry.id === latestSettings.activeRemoteBackendId) ??
        normalizedBackends[0];
      return {
        ...latestSettings,
        remoteBackends: normalizedBackends,
        activeRemoteBackendId: active.id,
        remoteBackendProvider: "tcp",
        remoteBackendHost: active.host,
        remoteBackendToken: active.token,
        ...(mobilePlatform
          ? {
              backendMode: "remote",
            }
          : {}),
      };
    },
    [mobilePlatform],
  );

  const persistRemoteBackends = useCallback(
    async (remoteBackends: RemoteBackendTarget[], preferredActiveId?: string | null) => {
      const latestSettings = latestSettingsRef.current;
      const nextSettings = buildSettingsFromRemoteBackends(
        latestSettings,
        remoteBackends,
        preferredActiveId,
      );
      const unchanged =
        nextSettings.remoteBackendHost === latestSettings.remoteBackendHost &&
        nextSettings.remoteBackendToken === latestSettings.remoteBackendToken &&
        nextSettings.backendMode === latestSettings.backendMode &&
        nextSettings.remoteBackendProvider === latestSettings.remoteBackendProvider &&
        nextSettings.activeRemoteBackendId === latestSettings.activeRemoteBackendId &&
        JSON.stringify(nextSettings.remoteBackends) === JSON.stringify(latestSettings.remoteBackends);
      if (unchanged) {
        return;
      }
      await onUpdateAppSettings(nextSettings);
      latestSettingsRef.current = nextSettings;
    },
    [buildSettingsFromRemoteBackends, onUpdateAppSettings],
  );

  const updateActiveRemoteBackend = useCallback(
    async (patch: Partial<RemoteBackendTarget>) => {
      const latestSettings = latestSettingsRef.current;
      const active = getActiveRemoteBackend(latestSettings);
      const nextBackends = [...getConfiguredRemoteBackends(latestSettings)];
      const activeIndex = nextBackends.findIndex((entry) => entry.id === active.id);
      const safeIndex = activeIndex >= 0 ? activeIndex : 0;
      nextBackends[safeIndex] = {
        ...nextBackends[safeIndex],
        ...patch,
        provider: "tcp",
      };
      await persistRemoteBackends(nextBackends, nextBackends[safeIndex].id);
    },
    [persistRemoteBackends],
  );

  const applyRemoteHost = async (rawValue: string) => {
    const nextHost = rawValue.trim();
    const validationError = validateRemoteHost(nextHost);
    if (validationError) {
      setRemoteHostError(validationError);
      setRemoteStatus(validationError, true);
      return false;
    }
    const normalizedHost = nextHost || DEFAULT_REMOTE_HOST;
    setRemoteHostError(null);
    setRemoteHostDraft(normalizedHost);
    await updateActiveRemoteBackend({ host: normalizedHost });
    setRemoteStatus(translate("settings:server.remoteHostSaved"));
    return true;
  };

  const handleCommitRemoteName = async () => {
    const latestSettings = latestSettingsRef.current;
    const active = getActiveRemoteBackend(latestSettings);
    const nextName = remoteNameDraft.trim();
    if (!nextName) {
      const message = translate("settings:server.nameRequired");
      setRemoteNameError(message);
      setRemoteStatus(message, true);
      return;
    }
    const duplicate = getConfiguredRemoteBackends(latestSettings).some(
      (entry) => entry.id !== active.id && entry.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      const message = translate("settings:server.nameExists", { name: nextName });
      setRemoteNameError(message);
      setRemoteStatus(message, true);
      return;
    }
    setRemoteNameError(null);
    setRemoteNameDraft(nextName);
    await updateActiveRemoteBackend({ name: nextName });
    setRemoteStatus(translate("settings:server.remoteNameSaved", { name: nextName }));
  };

  const handleCommitRemoteHost = async () => {
    await applyRemoteHost(remoteHostDraft);
  };

  const handleCommitRemoteToken = async () => {
    const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
    setRemoteTokenDraft(nextToken ?? "");
    await updateActiveRemoteBackend({ token: nextToken });
    setRemoteStatus(translate("settings:server.remoteTokenSaved"));
  };

  const handleSelectRemoteBackend = async (id: string) => {
    const latestSettings = latestSettingsRef.current;
    const candidates = getConfiguredRemoteBackends(latestSettings);
    const selected = candidates.find((entry) => entry.id === id);
    if (!selected) {
      return;
    }
    await persistRemoteBackends(candidates, id);
    setRemoteStatus(translate("settings:server.activeRemoteSet", { name: selected.name }));
  };

  const handleAddRemoteBackend = async (draft: AddRemoteBackendDraft) => {
    const latestSettings = latestSettingsRef.current;
    const existingBackends = getConfiguredRemoteBackends(latestSettings);
    const nextName = draft.name.trim();
    if (!nextName) {
      const message = translate("settings:server.nameRequired");
      setRemoteStatus(message, true);
      throw new Error(message);
    }
    const duplicate = existingBackends.some(
      (entry) => entry.name.trim().toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      const message = translate("settings:server.nameExists", { name: nextName });
      setRemoteStatus(message, true);
      throw new Error(message);
    }
    const nextHost = draft.host.trim();
    const hostError = validateRemoteHost(nextHost);
    if (hostError) {
      setRemoteStatus(hostError, true);
      throw new Error(hostError);
    }
    const nextToken = draft.token.trim() ? draft.token.trim() : null;
    if (!nextToken) {
      const message = translate("settings:server.tokenRequired");
      setRemoteStatus(message, true);
      throw new Error(message);
    }

    const nextId = createRemoteBackendId();
    const nextRemote: RemoteBackendTarget = {
      id: nextId,
      name: nextName,
      provider: "tcp",
      host: nextHost,
      token: nextToken,
      lastConnectedAtMs: null,
    };

    const previousSettings = latestSettings;
    const candidateBackends = [...existingBackends, nextRemote];
    const candidateSettings = buildSettingsFromRemoteBackends(
      previousSettings,
      candidateBackends,
      nextId,
    );

    let candidatePersisted = false;
    try {
      await onUpdateAppSettings(candidateSettings);
      latestSettingsRef.current = candidateSettings;
      candidatePersisted = true;

      const workspaces = await listWorkspaces();
      const workspaceCount = workspaces.length;
      const connectedBackends = candidateBackends.map((entry) =>
        entry.id === nextId ? { ...entry, lastConnectedAtMs: Date.now() } : entry,
      );
      const connectedSettings = buildSettingsFromRemoteBackends(
        candidateSettings,
        connectedBackends,
        nextId,
      );
      await onUpdateAppSettings(connectedSettings);
      latestSettingsRef.current = connectedSettings;
      setRemoteStatus(
        translate("settings:server.addedAndConnected", {
          name: nextName,
          count: workspaceCount,
        }),
      );
      await onMobileConnectSuccess?.();
    } catch (error) {
      if (candidatePersisted) {
        try {
          await onUpdateAppSettings(previousSettings);
          latestSettingsRef.current = previousSettings;
        } catch {
          // Keep the original connection error surfaced below.
        }
      }
      const message = formatErrorMessage(
        error,
        translate("settings:server.unableToConnectNewRemote"),
      );
      setRemoteStatus(message, true);
      throw new Error(message);
    }
  };

  const handleSetRemoteNameDraft: Dispatch<SetStateAction<string>> = (value) => {
    setRemoteNameError(null);
    setRemoteStatus(null);
    setRemoteNameDraft((previous) => (typeof value === "function" ? value(previous) : value));
  };

  const handleSetRemoteHostDraft: Dispatch<SetStateAction<string>> = (value) => {
    setRemoteHostError(null);
    setRemoteStatus(null);
    setRemoteHostDraft((previous) => (typeof value === "function" ? value(previous) : value));
  };

  const handleMoveRemoteBackend = async (id: string, direction: "up" | "down") => {
    const latestSettings = latestSettingsRef.current;
    const nextBackends = [...getConfiguredRemoteBackends(latestSettings)];
    const index = nextBackends.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextBackends.length) {
      return;
    }
    const entry = nextBackends[index];
    nextBackends[index] = nextBackends[targetIndex];
    nextBackends[targetIndex] = entry;
    await persistRemoteBackends(nextBackends);
    setRemoteStatus(
      translate(direction === "up" ? "settings:server.movedUp" : "settings:server.movedDown", {
        name: entry.name,
      }),
    );
  };

  const handleDeleteRemoteBackend = async (id: string) => {
    const latestSettings = latestSettingsRef.current;
    const existingBackends = getConfiguredRemoteBackends(latestSettings);
    if (existingBackends.length <= 1) {
      setRemoteStatus(translate("settings:server.needAtLeastOneRemote"), true);
      return;
    }
    const index = existingBackends.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return;
    }
    const removed = existingBackends[index];
    const remaining = existingBackends.filter((entry) => entry.id !== id);
    const nextActiveId =
      latestSettings.activeRemoteBackendId === id
        ? remaining[Math.min(index, remaining.length - 1)]?.id ?? remaining[0]?.id ?? null
        : latestSettings.activeRemoteBackendId;
    await persistRemoteBackends(remaining, nextActiveId);
    setRemoteStatus(translate("settings:server.deletedRemote", { name: removed.name }));
  };

  const handleMobileConnectTest = () => {
    void (async () => {
      const nextToken = remoteTokenDraft.trim() ? remoteTokenDraft.trim() : null;
      setRemoteTokenDraft(nextToken ?? "");

      if (!nextToken) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText(translate("settings:server.tokenRequired"));
        return;
      }

      const hostError = validateRemoteHost(remoteHostDraft);
      if (hostError) {
        setRemoteHostError(hostError);
        setMobileConnectStatusError(true);
        setMobileConnectStatusText(hostError);
        return;
      }

      setMobileConnectBusy(true);
      setMobileConnectStatusText(null);
      setMobileConnectStatusError(false);
      try {
        const nextHost = remoteHostDraft.trim() || DEFAULT_REMOTE_HOST;
        setRemoteHostDraft(nextHost);
        await updateActiveRemoteBackend({
          host: nextHost,
          token: nextToken,
        });

        const workspaces = await listWorkspaces();
        const workspaceCount = workspaces.length;
        try {
          await updateActiveRemoteBackend({ lastConnectedAtMs: Date.now() });
        } catch {
          // Keep successful connectivity outcome even if timestamp persistence fails.
        }
        setMobileConnectStatusText(
          translate("settings:server.connected", {
            count: workspaceCount,
          }),
        );
        await onMobileConnectSuccess?.();
      } catch (error) {
        setMobileConnectStatusError(true);
        setMobileConnectStatusText(
          error instanceof Error
            ? error.message
            : translate("settings:server.unableToConnectRemote"),
        );
      } finally {
        setMobileConnectBusy(false);
      }
    })();
  };

  useEffect(() => {
    if (!mobilePlatform) {
      return;
    }
    setMobileConnectStatusText(null);
    setMobileConnectStatusError(false);
  }, [mobilePlatform, remoteHostDraft, remoteTokenDraft]);

  const handleRefreshTailscaleStatus = useCallback(() => {
    void (async () => {
      setTailscaleStatusBusy(true);
      setTailscaleStatusError(null);
      try {
        const status = await fetchTailscaleStatus();
        setTailscaleStatus(status);
      } catch (error) {
        setTailscaleStatusError(
          formatErrorMessage(error, translate("settings:server.unableToLoadTailscaleStatus")),
        );
      } finally {
        setTailscaleStatusBusy(false);
      }
    })();
  }, []);

  const handleRefreshTailscaleCommandPreview = useCallback(() => {
    void (async () => {
      setTailscaleCommandBusy(true);
      setTailscaleCommandError(null);
      try {
        const preview = await fetchTailscaleDaemonCommandPreview();
        setTailscaleCommandPreview(preview);
      } catch (error) {
        setTailscaleCommandError(
          formatErrorMessage(
            error,
            translate("settings:server.unableToBuildTailscaleDaemonCommand"),
          ),
        );
      } finally {
        setTailscaleCommandBusy(false);
      }
    })();
  }, []);

  const handleUseSuggestedTailscaleHost = async () => {
    const suggestedHost = tailscaleStatus?.suggestedRemoteHost ?? null;
    if (!suggestedHost) {
      return;
    }
    await applyRemoteHost(suggestedHost);
  };

  const runTcpDaemonAction = useCallback(
    async (
      action: "start" | "stop" | "status",
      run: () => Promise<TcpDaemonStatus>,
    ) => {
      setTcpDaemonBusyAction(action);
      try {
        const status = await run();
        setTcpDaemonStatus(status);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : translate("settings:server.unableToUpdateMobileAccessDaemonStatus");
        setTcpDaemonStatus((prev) => ({
          state: "error",
          pid: null,
          startedAtMs: null,
          lastError: errorMessage,
          listenAddr: prev?.listenAddr ?? null,
        }));
      } finally {
        setTcpDaemonBusyAction(null);
      }
    },
    [],
  );

  const handleTcpDaemonStart = useCallback(async () => {
    await runTcpDaemonAction("start", tailscaleDaemonStart);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStop = useCallback(async () => {
    await runTcpDaemonAction("stop", tailscaleDaemonStop);
  }, [runTcpDaemonAction]);

  const handleTcpDaemonStatus = useCallback(async () => {
    await runTcpDaemonAction("status", tailscaleDaemonStatus);
  }, [runTcpDaemonAction]);

  useEffect(() => {
    if (!mobilePlatform) {
      handleRefreshTailscaleCommandPreview();
      void handleTcpDaemonStatus();
    }
    if (tailscaleStatus === null && !tailscaleStatusBusy && !tailscaleStatusError) {
      handleRefreshTailscaleStatus();
    }
  }, [
    appSettings.remoteBackendToken,
    handleRefreshTailscaleCommandPreview,
    handleRefreshTailscaleStatus,
    handleTcpDaemonStatus,
    mobilePlatform,
    tailscaleStatus,
    tailscaleStatusBusy,
    tailscaleStatusError,
  ]);

  return {
    appSettings,
    onUpdateAppSettings,
    remoteBackends: getConfiguredRemoteBackends(appSettings),
    activeRemoteBackendId:
      appSettings.activeRemoteBackendId ?? getConfiguredRemoteBackends(appSettings)[0]?.id ?? null,
    remoteStatusText,
    remoteStatusError,
    remoteNameError,
    remoteHostError,
    remoteNameDraft,
    remoteHostDraft,
    remoteTokenDraft,
    nextRemoteNameSuggestion: buildNextRemoteName(getConfiguredRemoteBackends(appSettings)),
    tailscaleStatus,
    tailscaleStatusBusy,
    tailscaleStatusError,
    tailscaleCommandPreview,
    tailscaleCommandBusy,
    tailscaleCommandError,
    tcpDaemonStatus,
    tcpDaemonBusyAction,
    onSetRemoteNameDraft: handleSetRemoteNameDraft,
    onSetRemoteHostDraft: handleSetRemoteHostDraft,
    onSetRemoteTokenDraft: setRemoteTokenDraft,
    onCommitRemoteName: handleCommitRemoteName,
    onCommitRemoteHost: handleCommitRemoteHost,
    onCommitRemoteToken: handleCommitRemoteToken,
    onSelectRemoteBackend: handleSelectRemoteBackend,
    onAddRemoteBackend: handleAddRemoteBackend,
    onMoveRemoteBackend: handleMoveRemoteBackend,
    onDeleteRemoteBackend: handleDeleteRemoteBackend,
    onRefreshTailscaleStatus: handleRefreshTailscaleStatus,
    onRefreshTailscaleCommandPreview: handleRefreshTailscaleCommandPreview,
    onUseSuggestedTailscaleHost: handleUseSuggestedTailscaleHost,
    onTcpDaemonStart: handleTcpDaemonStart,
    onTcpDaemonStop: handleTcpDaemonStop,
    onTcpDaemonStatus: handleTcpDaemonStatus,
    isMobilePlatform: mobilePlatform,
    mobileConnectBusy,
    mobileConnectStatusText,
    mobileConnectStatusError,
    onMobileConnectTest: handleMobileConnectTest,
  };
};
