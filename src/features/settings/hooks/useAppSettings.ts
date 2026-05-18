import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiRadarSettings, AppSettings } from "@/types";
import {
  getAppSettings,
  runCodexDoctor,
  updateAppSettings,
} from "@services/tauri";
import { clampUiScale, UI_SCALE_DEFAULT } from "@utils/uiScale";
import {
  CHAT_SCROLLBACK_DEFAULT,
  normalizeChatHistoryScrollbackItems,
} from "@utils/chatScrollback";
import {
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_UI_FONT_FAMILY,
  CODE_FONT_SIZE_DEFAULT,
  clampCodeFontSize,
  normalizeFontFamily,
} from "@utils/fonts";
import {
  DEFAULT_OPEN_APP_ID,
  DEFAULT_OPEN_APP_TARGETS,
  OPEN_APP_STORAGE_KEY,
} from "@app/constants";
import { normalizeOpenAppTargets } from "@app/utils/openApp";
import { getDefaultInterruptShortcut, isMacPlatform } from "@utils/shortcuts";
import { isMobilePlatform } from "@utils/platformPaths";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "@utils/commitMessagePrompt";
import {
  getInitialUiLanguagePreference,
  normalizeUiLanguagePreference,
  persistUiLanguagePreference,
} from "@/i18n/preferences";
import { normalizeCommonLinks } from "@settings/components/settingsViewHelpers";
import { normalizeQuickCommands } from "@utils/quickCommands";
import { translate } from "@/i18n/translate";

const allowedUiLanguages = new Set(["system", "en", "zh-CN"]);
const allowedThemes = new Set(["system", "light", "dark", "dim"]);
const allowedAccentColors = new Set([
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "teal",
  "red",
]);
const allowedPersonality = new Set(["friendly", "pragmatic"]);
const allowedFollowUpMessageBehavior = new Set(["queue", "steer"]);
const DEFAULT_REMOTE_BACKEND_HOST = "127.0.0.1:4732";
const DEFAULT_REMOTE_BACKEND_ID = "remote-default";
const DEFAULT_REMOTE_PROVIDER: AppSettings["remoteBackendProvider"] = "tcp";
const obsoleteAiRadarDefaultSourceIds = new Set(["media-the-decoder"]);

const getDefaultRemoteBackendName = () =>
  translate("settings:server.primaryRemoteName");

type RemoteBackendTarget = AppSettings["remoteBackends"][number];

function buildDefaultAiRadarSettings(): AiRadarSettings {
  return {
    enabled: true,
    refreshIntervalMinutes: 60,
    maxItems: 800,
    retentionDays: 30,
    translateToChinese: true,
    defaultSourceVersion: 7,
    sources: [
      {
        id: "media-openai-news",
        name: "OpenAI News",
        kind: "rss",
        url: "https://openai.com/news/rss.xml",
        query: null,
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "media-google-ai",
        name: "Google AI",
        kind: "rss",
        url: "https://blog.google/technology/ai/rss/",
        query: null,
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "media-microsoft-ai",
        name: "Microsoft AI Blog",
        kind: "rss",
        url: "https://blogs.microsoft.com/ai/feed/",
        query: null,
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "media-venturebeat-ai",
        name: "VentureBeat AI",
        kind: "rss",
        url: "https://venturebeat.com/category/ai/feed/",
        query: null,
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "media-mit-ai",
        name: "MIT Technology Review AI",
        kind: "rss",
        url: "https://www.technologyreview.com/topic/artificial-intelligence/feed",
        query: null,
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "media-anthropic-news",
        name: "Anthropic News",
        kind: "rss",
        url: "https://rsshub.chn.moe/anthropic/news",
        query: null,
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "media-wechat-jiqizhixin",
        name: "机器之心微信公众号",
        kind: "wechatOfficialAccount",
        url: null,
        query: "/wechat/sogou/almosthuman2014",
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "media-toutiao-ai-teaching",
        name: "程序员老张 AI教学",
        kind: "toutiaoUser",
        url: null,
        query:
          "MS4wLjABAAAAEmbqJP2CmC8XXv1BpMvQ3sQHKAxFsq8wHxj8XVIQWja6tMcB-QEbFkzkRNgMl12M",
        enabled: true,
        channel: "media",
        createdAtMs: null,
      },
      {
        id: "github-ai-agent-topic",
        name: "GitHub LLM agents",
        kind: "githubSearch",
        query: "agent topic:llm stars:>100 archived:false fork:false",
        url: null,
        enabled: true,
        channel: "github",
        createdAtMs: null,
      },
      {
        id: "github-ai-agents-topic",
        name: "GitHub AI agents",
        kind: "githubSearch",
        query:
          "agent topic:artificial-intelligence stars:>100 archived:false fork:false",
        url: null,
        enabled: true,
        channel: "github",
        createdAtMs: null,
      },
      {
        id: "github-agent-framework-topic",
        name: "GitHub agent frameworks",
        kind: "githubSearch",
        query: "llm-agent stars:>50 archived:false fork:false",
        url: null,
        enabled: true,
        channel: "github",
        createdAtMs: null,
      },
      {
        id: "github-llm-agent-topic",
        name: "GitHub autonomous agents",
        kind: "githubSearch",
        query: "autonomous-agent stars:>50 archived:false fork:false",
        url: null,
        enabled: true,
        channel: "github",
        createdAtMs: null,
      },
      {
        id: "github-multi-agent-topic",
        name: "GitHub multi-agent",
        kind: "githubSearch",
        query: "multi-agent topic:llm stars:>50 archived:false fork:false",
        url: null,
        enabled: true,
        channel: "github",
        createdAtMs: null,
      },
      {
        id: "models-openrouter-weekly",
        name: "OpenRouter Weekly Models",
        kind: "modelRanking",
        url: "https://openrouter.ai/rankings?view=week",
        query: null,
        enabled: true,
        channel: "models",
        createdAtMs: null,
      },
    ],
  };
}

function normalizeAiRadarSettings(
  value: AppSettings["aiRadar"] | null | undefined,
): AiRadarSettings {
  const defaults = buildDefaultAiRadarSettings();
  const settings = value ?? defaults;
  const sourceDefaultsVersion =
    typeof settings.defaultSourceVersion === "number" &&
    Number.isFinite(settings.defaultSourceVersion)
      ? Math.max(0, Math.round(settings.defaultSourceVersion))
      : 0;
  const sourceCandidates = (settings.sources ?? defaults.sources)
    .filter(
      (source) =>
        !(
          sourceDefaultsVersion < defaults.defaultSourceVersion &&
          source.createdAtMs == null &&
          obsoleteAiRadarDefaultSourceIds.has(source.id?.trim() ?? "")
        ),
    )
    .map((source) => {
      const defaultSource = defaults.sources.find(
        (entry) => entry.id === source.id?.trim(),
      );
      if (
        sourceDefaultsVersion < defaults.defaultSourceVersion &&
        defaultSource &&
        source.createdAtMs == null
      ) {
        return { ...defaultSource };
      }
      return source;
    });
  if (sourceDefaultsVersion < defaults.defaultSourceVersion) {
    const existingIds = new Set(
      sourceCandidates.map((source) => source.id?.trim()).filter(Boolean),
    );
    for (const source of defaults.sources) {
      if (!existingIds.has(source.id)) {
        sourceCandidates.push(source);
        existingIds.add(source.id);
      }
    }
  }
  const usedIds = new Set<string>();
  const sources = sourceCandidates.map((source, index) => {
    const baseId = source.id?.trim() || `source-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    const kind = source.kind ?? "rss";
    const channel =
      source.channel ??
      (kind === "githubSearch"
        ? "github"
        : kind === "modelRanking"
          ? "models"
          : "media");
    return {
      id,
      name: source.name?.trim() || id,
      kind,
      url: source.url?.trim() || null,
      query:
        source.query?.trim() ||
        (kind === "wechatOfficialAccount" || kind === "toutiaoUser"
          ? ""
          : null),
      enabled: source.enabled !== false,
      channel,
      createdAtMs:
        typeof source.createdAtMs === "number" &&
        Number.isFinite(source.createdAtMs)
          ? source.createdAtMs
          : null,
    };
  });
  return {
    enabled: settings.enabled !== false,
    refreshIntervalMinutes:
      typeof settings.refreshIntervalMinutes === "number" &&
      Number.isFinite(settings.refreshIntervalMinutes)
        ? Math.max(5, Math.round(settings.refreshIntervalMinutes))
        : defaults.refreshIntervalMinutes,
    maxItems:
      typeof settings.maxItems === "number" &&
      Number.isFinite(settings.maxItems)
        ? Math.min(5000, Math.max(20, Math.round(settings.maxItems)))
        : defaults.maxItems,
    retentionDays:
      typeof settings.retentionDays === "number" &&
      Number.isFinite(settings.retentionDays)
        ? Math.min(365, Math.max(1, Math.round(settings.retentionDays)))
        : defaults.retentionDays,
    translateToChinese: settings.translateToChinese !== false,
    defaultSourceVersion: Math.max(
      sourceDefaultsVersion,
      defaults.defaultSourceVersion,
    ),
    sources,
  };
}

function normalizeRemoteProvider(
  value: unknown,
): AppSettings["remoteBackendProvider"] {
  void value;
  return "tcp";
}

function normalizeRemoteToken(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

function normalizeRemoteHost(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : DEFAULT_REMOTE_BACKEND_HOST;
}

function normalizeRemoteName(
  value: string | null | undefined,
  fallback: string,
): string {
  return value?.trim() ? value.trim() : fallback;
}

function normalizeRemoteBackends(settings: AppSettings): {
  remoteBackends: RemoteBackendTarget[];
  activeRemoteBackendId: string | null;
  remoteBackendProvider: AppSettings["remoteBackendProvider"];
  remoteBackendHost: string;
  remoteBackendToken: string | null;
} {
  const legacyProvider = normalizeRemoteProvider(
    settings.remoteBackendProvider,
  );
  const legacyHost = normalizeRemoteHost(settings.remoteBackendHost);
  const legacyToken = normalizeRemoteToken(settings.remoteBackendToken);
  const usedIds = new Set<string>();

  const normalized = (settings.remoteBackends ?? []).map((entry, index) => {
    const baseId = entry.id?.trim() || `remote-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return {
      id,
      name: normalizeRemoteName(
        entry.name,
        `${translate("settings:server.remoteNamePrefix")} ${index + 1}`,
      ),
      provider: normalizeRemoteProvider(entry.provider),
      host: normalizeRemoteHost(entry.host),
      token: normalizeRemoteToken(entry.token),
      lastConnectedAtMs:
        typeof entry.lastConnectedAtMs === "number" &&
        Number.isFinite(entry.lastConnectedAtMs)
          ? entry.lastConnectedAtMs
          : null,
    };
  });

  if (normalized.length === 0) {
    const fallback: RemoteBackendTarget = {
      id: DEFAULT_REMOTE_BACKEND_ID,
      name: getDefaultRemoteBackendName(),
      provider: legacyProvider,
      host: legacyHost,
      token: legacyToken,
      lastConnectedAtMs: null,
    };
    return {
      remoteBackends: [fallback],
      activeRemoteBackendId: fallback.id,
      remoteBackendProvider: fallback.provider,
      remoteBackendHost: fallback.host,
      remoteBackendToken: fallback.token,
    };
  }

  const activeIndexById =
    settings.activeRemoteBackendId == null
      ? -1
      : normalized.findIndex(
          (entry) => entry.id === settings.activeRemoteBackendId,
        );
  const activeIndex = activeIndexById >= 0 ? activeIndexById : 0;
  const active = normalized[activeIndex];
  const syncedActive = {
    ...active,
    provider: legacyProvider,
    host: legacyHost,
    token: legacyToken,
  };
  const remoteBackends = [...normalized];
  remoteBackends[activeIndex] = syncedActive;
  return {
    remoteBackends,
    activeRemoteBackendId: syncedActive.id,
    remoteBackendProvider: syncedActive.provider,
    remoteBackendHost: syncedActive.host,
    remoteBackendToken: syncedActive.token,
  };
}

function buildDefaultSettings(): AppSettings {
  const isMac = isMacPlatform();
  const isMobile = isMobilePlatform();
  const defaultRemote: RemoteBackendTarget = {
    id: DEFAULT_REMOTE_BACKEND_ID,
    name: getDefaultRemoteBackendName(),
    provider: DEFAULT_REMOTE_PROVIDER,
    host: DEFAULT_REMOTE_BACKEND_HOST,
    token: null,
    lastConnectedAtMs: null,
  };
  return {
    codexBin: null,
    codexArgs: null,
    backendMode: isMobile ? "remote" : "local",
    remoteBackendProvider: defaultRemote.provider,
    remoteBackendHost: defaultRemote.host,
    remoteBackendToken: null,
    remoteBackends: [defaultRemote],
    activeRemoteBackendId: defaultRemote.id,
    keepDaemonRunningAfterAppClose: false,
    defaultAccessMode: "current",
    reviewDeliveryMode: "inline",
    composerModelShortcut: isMac ? "cmd+shift+m" : "ctrl+shift+m",
    composerAccessShortcut: isMac ? "cmd+shift+a" : "ctrl+shift+a",
    composerReasoningShortcut: isMac ? "cmd+shift+r" : "ctrl+shift+r",
    composerCollaborationShortcut: "shift+tab",
    interruptShortcut: getDefaultInterruptShortcut(),
    newAgentShortcut: isMac ? "cmd+n" : "ctrl+n",
    newWorktreeAgentShortcut: isMac ? "cmd+shift+n" : "ctrl+shift+n",
    newCloneAgentShortcut: isMac ? "cmd+alt+n" : "ctrl+alt+n",
    archiveThreadShortcut: isMac ? "cmd+ctrl+a" : "ctrl+alt+a",
    toggleProjectsSidebarShortcut: isMac ? "cmd+shift+p" : "ctrl+shift+p",
    toggleGitSidebarShortcut: isMac ? "cmd+shift+g" : "ctrl+shift+g",
    branchSwitcherShortcut: isMac ? "cmd+b" : "ctrl+b",
    toggleDebugPanelShortcut: isMac ? "cmd+shift+d" : "ctrl+shift+d",
    toggleTerminalShortcut: isMac ? "cmd+shift+t" : "ctrl+shift+t",
    cycleAgentNextShortcut: isMac ? "cmd+ctrl+down" : "ctrl+alt+down",
    cycleAgentPrevShortcut: isMac ? "cmd+ctrl+up" : "ctrl+alt+up",
    cycleWorkspaceNextShortcut: isMac
      ? "cmd+shift+down"
      : "ctrl+alt+shift+down",
    cycleWorkspacePrevShortcut: isMac ? "cmd+shift+up" : "ctrl+alt+shift+up",
    lastComposerModelId: null,
    lastComposerReasoningEffort: null,
    uiScale: UI_SCALE_DEFAULT,
    uiLanguage: getInitialUiLanguagePreference(),
    theme: "system",
    accentColor: "blue",
    usageShowRemaining: true,
    showMessageFilePath: true,
    selectedPetId: "buddy-spark",
    petOverlayVisible: false,
    chatHistoryScrollbackItems: CHAT_SCROLLBACK_DEFAULT,
    threadTitleAutogenerationEnabled: false,
    automaticAppUpdateChecksEnabled: false,
    uiFontFamily: DEFAULT_UI_FONT_FAMILY,
    codeFontFamily: DEFAULT_CODE_FONT_FAMILY,
    codeFontSize: CODE_FONT_SIZE_DEFAULT,
    notificationSoundsEnabled: true,
    systemNotificationsEnabled: true,
    subagentSystemNotificationsEnabled: true,
    splitChatDiffView: false,
    preloadGitDiffs: true,
    gitDiffIgnoreWhitespaceChanges: false,
    commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
    commitMessageModelId: null,
    collaborationModesEnabled: true,
    steerEnabled: true,
    followUpMessageBehavior: "queue",
    composerFollowUpHintEnabled: true,
    pauseQueuedMessagesWhenResponseRequired: true,
    unifiedExecEnabled: true,
    experimentalAppsEnabled: false,
    personality: "friendly",
    dictationEnabled: false,
    dictationModelId: "base",
    dictationPreferredLanguage: null,
    dictationHoldKey: "alt",
    composerEditorPreset: "default",
    composerFenceExpandOnSpace: false,
    composerFenceExpandOnEnter: false,
    composerFenceLanguageTags: false,
    composerFenceWrapSelection: false,
    composerFenceAutoWrapPasteMultiline: false,
    composerFenceAutoWrapPasteCodeLike: false,
    composerListContinuation: false,
    composerCodeBlockCopyUseModifier: false,
    quickCommands: [],
    workspaceGroups: [],
    openAppTargets: DEFAULT_OPEN_APP_TARGETS,
    selectedOpenAppId: DEFAULT_OPEN_APP_ID,
    commonLinks: [],
    aiRadar: buildDefaultAiRadarSettings(),
    globalWorktreesFolder: null,
  };
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  const remoteBackendSettings = normalizeRemoteBackends(settings);
  const normalizedCommonLinks = normalizeCommonLinks(
    settings.commonLinks ?? [],
  );
  const aiRadar = normalizeAiRadarSettings(settings.aiRadar);
  const normalizedTargets =
    settings.openAppTargets && settings.openAppTargets.length
      ? normalizeOpenAppTargets(settings.openAppTargets)
      : DEFAULT_OPEN_APP_TARGETS;
  const storedOpenAppId =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem(OPEN_APP_STORAGE_KEY);
  const hasPersistedSelection = normalizedTargets.some(
    (target) => target.id === settings.selectedOpenAppId,
  );
  const hasStoredSelection =
    !hasPersistedSelection &&
    storedOpenAppId !== null &&
    normalizedTargets.some((target) => target.id === storedOpenAppId);
  const selectedOpenAppId = hasPersistedSelection
    ? settings.selectedOpenAppId
    : hasStoredSelection
      ? storedOpenAppId
      : (normalizedTargets[0]?.id ?? DEFAULT_OPEN_APP_ID);
  const commitMessagePrompt =
    settings.commitMessagePrompt &&
    settings.commitMessagePrompt.trim().length > 0
      ? settings.commitMessagePrompt
      : DEFAULT_COMMIT_MESSAGE_PROMPT;
  const chatHistoryScrollbackItems = normalizeChatHistoryScrollbackItems(
    settings.chatHistoryScrollbackItems,
  );
  const uiLanguage = allowedUiLanguages.has(settings.uiLanguage)
    ? settings.uiLanguage
    : normalizeUiLanguagePreference(settings.uiLanguage);
  persistUiLanguagePreference(uiLanguage);
  return {
    ...settings,
    ...remoteBackendSettings,
    codexBin: settings.codexBin?.trim() ? settings.codexBin.trim() : null,
    codexArgs: settings.codexArgs?.trim() ? settings.codexArgs.trim() : null,
    uiScale: clampUiScale(settings.uiScale),
    uiLanguage,
    theme: allowedThemes.has(settings.theme) ? settings.theme : "system",
    accentColor: allowedAccentColors.has(settings.accentColor)
      ? settings.accentColor
      : "blue",
    selectedPetId:
      typeof settings.selectedPetId === "string" &&
      settings.selectedPetId.trim().length > 0
        ? settings.selectedPetId.trim()
        : "buddy-spark",
    petOverlayVisible:
      typeof settings.petOverlayVisible === "boolean"
        ? settings.petOverlayVisible
        : false,
    uiFontFamily: normalizeFontFamily(
      settings.uiFontFamily,
      DEFAULT_UI_FONT_FAMILY,
    ),
    codeFontFamily: normalizeFontFamily(
      settings.codeFontFamily,
      DEFAULT_CODE_FONT_FAMILY,
    ),
    codeFontSize: clampCodeFontSize(settings.codeFontSize),
    personality: allowedPersonality.has(settings.personality)
      ? settings.personality
      : "friendly",
    followUpMessageBehavior: allowedFollowUpMessageBehavior.has(
      settings.followUpMessageBehavior,
    )
      ? settings.followUpMessageBehavior
      : settings.steerEnabled
        ? "steer"
        : "queue",
    composerFollowUpHintEnabled:
      typeof settings.composerFollowUpHintEnabled === "boolean"
        ? settings.composerFollowUpHintEnabled
        : true,
    reviewDeliveryMode:
      settings.reviewDeliveryMode === "detached" ? "detached" : "inline",
    chatHistoryScrollbackItems,
    commitMessagePrompt,
    quickCommands: normalizeQuickCommands(settings.quickCommands),
    openAppTargets: normalizedTargets,
    selectedOpenAppId,
    commonLinks: normalizedCommonLinks,
    aiRadar,
  };
}

export function useAppSettings() {
  const defaultSettings = useMemo(() => buildDefaultSettings(), []);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await getAppSettings();
        if (active) {
          setSettings(
            normalizeAppSettings({
              ...defaultSettings,
              ...response,
            }),
          );
        }
      } catch {
        // Defaults stay in place if loading settings fails.
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [defaultSettings]);

  const saveSettings = useCallback(
    async (next: AppSettings) => {
      const normalized = normalizeAppSettings(next);
      const saved = await updateAppSettings(normalized);
      setSettings(
        normalizeAppSettings({
          ...defaultSettings,
          ...saved,
        }),
      );
      return saved;
    },
    [defaultSettings],
  );

  const doctor = useCallback(
    async (codexBin: string | null, codexArgs: string | null) => {
      return runCodexDoctor(codexBin, codexArgs);
    },
    [],
  );

  return {
    settings,
    setSettings,
    saveSettings,
    doctor,
    isLoading,
  };
}
