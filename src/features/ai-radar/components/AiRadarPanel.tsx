import { openUrl } from "@tauri-apps/plugin-opener";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3";
import CircleAlert from "lucide-react/dist/esm/icons/circle-alert";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import Github from "lucide-react/dist/esm/icons/github";
import Newspaper from "lucide-react/dist/esm/icons/newspaper";
import Plus from "lucide-react/dist/esm/icons/plus";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Rss from "lucide-react/dist/esm/icons/rss";
import Save from "lucide-react/dist/esm/icons/save";
import Star from "lucide-react/dist/esm/icons/star";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import X from "lucide-react/dist/esm/icons/x";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AiRadarChannel,
  AiRadarItem,
  AiRadarListResponse,
  AiRadarSettings,
  AiRadarSource,
  AiRadarSourceKind,
} from "@/types";
import {
  aiRadarList,
  aiRadarRefresh,
  aiRadarSourcesUpdate,
} from "@services/tauri";

type AiRadarTab = AiRadarChannel | "sources";
type AiRadarSortMode =
  | "score"
  | "latest"
  | "source"
  | "stars"
  | "starDelta24h"
  | "tokens"
  | "requests"
  | "rank";

type AiRadarPanelProps = {
  onClose: () => void;
  onSettingsChange?: (settings: AiRadarSettings) => void;
};

const sourceKinds: Array<{ value: AiRadarSourceKind; labelKey: string }> = [
  { value: "rss", labelKey: "aiRadar.sourceKinds.rss" },
  { value: "atom", labelKey: "aiRadar.sourceKinds.atom" },
  { value: "jsonFeed", labelKey: "aiRadar.sourceKinds.jsonFeed" },
  { value: "article", labelKey: "aiRadar.sourceKinds.article" },
  {
    value: "wechatOfficialAccount",
    labelKey: "aiRadar.sourceKinds.wechatOfficialAccount",
  },
  { value: "toutiaoUser", labelKey: "aiRadar.sourceKinds.toutiaoUser" },
  { value: "githubSearch", labelKey: "aiRadar.sourceKinds.githubSearch" },
  { value: "modelRanking", labelKey: "aiRadar.sourceKinds.modelRanking" },
];

const defaultSortModeByChannel: Record<AiRadarChannel, AiRadarSortMode> = {
  media: "score",
  github: "score",
  models: "tokens",
};

type SourceDefaults = {
  githubSearchName: string;
  wechatOfficialAccountName: string;
  toutiaoUserName: string;
  modelRankingName: string;
  newMediaName: string;
};

function formatTime(value: number | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined) {
  if (value == null) {
    return "-";
  }
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(
    value,
  );
}

function channelLabelKey(channel: AiRadarChannel) {
  if (channel === "github") {
    return "aiRadar.tabs.github";
  }
  if (channel === "models") {
    return "aiRadar.tabs.models";
  }
  return "aiRadar.tabs.media";
}

function sourceUsesQuery(kind: AiRadarSourceKind) {
  return (
    kind === "githubSearch" ||
    kind === "wechatOfficialAccount" ||
    kind === "toutiaoUser"
  );
}

function sourceTargetLabelKey(kind: AiRadarSourceKind) {
  if (kind === "githubSearch") {
    return "aiRadar.sourceTargets.githubSearch";
  }
  if (kind === "wechatOfficialAccount") {
    return "aiRadar.sourceTargets.wechatOfficialAccount";
  }
  if (kind === "toutiaoUser") {
    return "aiRadar.sourceTargets.toutiaoUser";
  }
  if (kind === "modelRanking") {
    return "aiRadar.sourceTargets.modelRanking";
  }
  return "aiRadar.sourceTargets.publicUrl";
}

export function normalizeSourceForKind(source: AiRadarSource): AiRadarSource {
  const channel: AiRadarChannel =
    source.kind === "githubSearch"
      ? "github"
      : source.kind === "modelRanking"
        ? "models"
        : "media";
  const usesQuery = sourceUsesQuery(source.kind);
  return {
    ...source,
    channel,
    url: usesQuery ? null : (source.url ?? ""),
    query: usesQuery ? (source.query ?? "") : null,
  };
}

function buildSource(
  kind: AiRadarSourceKind,
  defaults: SourceDefaults,
): AiRadarSource {
  const now = Date.now();
  const channel: AiRadarChannel =
    kind === "githubSearch"
      ? "github"
      : kind === "modelRanking"
        ? "models"
        : "media";
  const queryDefaults: Partial<
    Record<AiRadarSourceKind, { name: string; query: string }>
  > = {
    githubSearch: {
      name: defaults.githubSearchName,
      query: "agent topic:llm stars:>100 archived:false fork:false",
    },
    wechatOfficialAccount: {
      name: defaults.wechatOfficialAccountName,
      query: "",
    },
    toutiaoUser: {
      name: defaults.toutiaoUserName,
      query: "",
    },
  };
  const querySource = sourceUsesQuery(kind) ? queryDefaults[kind] : null;
  const urlSource =
    kind === "modelRanking"
      ? {
          name: defaults.modelRankingName,
          url: "https://openrouter.ai/rankings?view=week",
        }
      : { name: defaults.newMediaName, url: "" };
  return {
    id: `${channel}-${now}`,
    name: querySource?.name ?? urlSource.name,
    kind,
    url: sourceUsesQuery(kind) ? null : urlSource.url,
    query: querySource?.query ?? null,
    enabled: true,
    channel,
    createdAtMs: now,
  };
}

function itemTime(item: AiRadarItem, fallback: string) {
  return formatTime(item.publishedAtMs ?? item.fetchedAtMs, fallback);
}

function displayTitle(item: AiRadarItem) {
  return item.titleZh?.trim() || item.title;
}

function displaySummary(item: AiRadarItem) {
  return item.summaryZh?.trim() || item.summary;
}

function containsCjk(value: string) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}

function missingTranslatedText(item: AiRadarItem) {
  if (item.channel === "models") {
    return false;
  }
  if (item.channel === "github") {
    return Boolean(
      item.summary?.trim() &&
      !containsCjk(item.summary) &&
      !item.summaryZh?.trim(),
    );
  }
  return Boolean(
    (item.title.trim() && !containsCjk(item.title) && !item.titleZh?.trim()) ||
    (item.summary?.trim() &&
      !containsCjk(item.summary) &&
      !item.summaryZh?.trim()),
  );
}

function responseNeedsTranslationBackfill(
  response: AiRadarListResponse | null,
) {
  return Boolean(
    response?.settings.translateToChinese &&
    response.items.some((item) => missingTranslatedText(item)),
  );
}

function itemTimestamp(item: AiRadarItem) {
  return item.publishedAtMs ?? item.fetchedAtMs;
}

function compareNewest(left: AiRadarItem, right: AiRadarItem) {
  return itemTimestamp(right) - itemTimestamp(left);
}

function compareScoreThenTime(left: AiRadarItem, right: AiRadarItem) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return compareNewest(left, right);
}

function compareMetricDesc(
  left: AiRadarItem,
  right: AiRadarItem,
  metric: keyof AiRadarItem["metrics"],
) {
  const leftValue = left.metrics[metric] ?? Number.NEGATIVE_INFINITY;
  const rightValue = right.metrics[metric] ?? Number.NEGATIVE_INFINITY;
  if (rightValue !== leftValue) {
    return Number(rightValue) - Number(leftValue);
  }
  return compareScoreThenTime(left, right);
}

function compareRank(left: AiRadarItem, right: AiRadarItem) {
  const leftRank = left.metrics.rank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.metrics.rank ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return compareScoreThenTime(left, right);
}

function sortItems(items: AiRadarItem[], sortMode: AiRadarSortMode) {
  return [...items].sort((left, right) => {
    if (sortMode === "latest") {
      return compareNewest(left, right);
    }
    if (sortMode === "source") {
      return (
        left.sourceName.localeCompare(right.sourceName) ||
        displayTitle(left).localeCompare(displayTitle(right)) ||
        compareScoreThenTime(left, right)
      );
    }
    if (sortMode === "stars") {
      return compareMetricDesc(left, right, "stars");
    }
    if (sortMode === "starDelta24h") {
      return compareMetricDesc(left, right, "starDelta24h");
    }
    if (sortMode === "tokens") {
      return compareMetricDesc(left, right, "tokens");
    }
    if (sortMode === "requests") {
      return compareMetricDesc(left, right, "requests");
    }
    if (sortMode === "rank") {
      return compareRank(left, right);
    }
    return compareScoreThenTime(left, right);
  });
}

function sortOptionsForChannel(channel: AiRadarChannel) {
  if (channel === "github") {
    return ["score", "stars", "starDelta24h", "latest"] as const;
  }
  if (channel === "models") {
    return ["tokens", "requests", "rank", "latest"] as const;
  }
  return ["score", "latest", "source"] as const;
}

function isSortModeForChannel(
  channel: AiRadarChannel,
  sortMode: AiRadarSortMode,
) {
  return sortOptionsForChannel(channel).includes(sortMode as never);
}

function sortModeLabelKey(sortMode: AiRadarSortMode) {
  return `aiRadar.sort.${sortMode}`;
}

function channelNeedsInitialFetch(
  response: AiRadarListResponse,
  channel: AiRadarChannel,
) {
  const enabledSourceIds = new Set(
    response.settings.sources
      .filter((source) => source.enabled && source.channel === channel)
      .map((source) => source.id),
  );
  if (
    enabledSourceIds.size === 0 ||
    response.items.some((item) => item.channel === channel)
  ) {
    return false;
  }
  return response.status.sourceStates.some(
    (state) => enabledSourceIds.has(state.sourceId) && !state.lastFetchedAtMs,
  );
}

export function AiRadarPanel({ onClose, onSettingsChange }: AiRadarPanelProps) {
  const { t } = useTranslation(["app", "common"]);
  const [activeTab, setActiveTab] = useState<AiRadarTab>("media");
  const [sortModeByChannel, setSortModeByChannel] = useState<
    Record<AiRadarChannel, AiRadarSortMode>
  >(defaultSortModeByChannel);
  const [response, setResponse] = useState<AiRadarListResponse | null>(null);
  const [draftSettings, setDraftSettings] = useState<AiRadarSettings | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const translationPollCountRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let next = await aiRadarList();
      if (
        channelNeedsInitialFetch(next, "media") ||
        channelNeedsInitialFetch(next, "github") ||
        channelNeedsInitialFetch(next, "models")
      ) {
        next = await aiRadarRefresh();
      }
      setResponse(next);
      setDraftSettings(next.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!responseNeedsTranslationBackfill(response)) {
      translationPollCountRef.current = 0;
      return;
    }
    if (translationPollCountRef.current >= 8) {
      return;
    }
    const delayMs = translationPollCountRef.current === 0 ? 2500 : 5000;
    const timer = window.setTimeout(() => {
      translationPollCountRef.current += 1;
      void aiRadarList()
        .then((next) => {
          setResponse(next);
        })
        .catch((err) => {
          console.warn("AI radar translation backfill poll failed", err);
        });
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [response]);

  const activeChannel = activeTab === "sources" ? null : activeTab;
  const activeSortMode =
    activeChannel &&
    isSortModeForChannel(activeChannel, sortModeByChannel[activeChannel])
      ? sortModeByChannel[activeChannel]
      : activeChannel
        ? defaultSortModeByChannel[activeChannel]
        : "score";
  const activeSortOptions = activeChannel
    ? sortOptionsForChannel(activeChannel)
    : [];

  const items = useMemo(() => {
    const channel = activeChannel ?? "media";
    return sortItems(
      (response?.items ?? []).filter((item) => item.channel === channel),
      activeSortMode,
    );
  }, [activeChannel, activeSortMode, response?.items]);

  const refresh = async (channel?: AiRadarChannel) => {
    setRefreshing(true);
    setError(null);
    try {
      const next = await aiRadarRefresh(channel ? { channel } : {});
      setResponse(next);
      setDraftSettings(next.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const updateDraft = (
    updater: (settings: AiRadarSettings) => AiRadarSettings,
  ) => {
    setDraftSettings((current) => (current ? updater(current) : current));
  };

  const updateSource = (id: string, patch: Partial<AiRadarSource>) => {
    updateDraft((settings) => ({
      ...settings,
      sources: settings.sources.map((source) =>
        source.id === id
          ? normalizeSourceForKind({ ...source, ...patch })
          : source,
      ),
    }));
  };

  const sourceDefaults = useMemo<SourceDefaults>(
    () => ({
      githubSearchName: t("aiRadar.defaults.githubSearchName"),
      wechatOfficialAccountName: t(
        "aiRadar.defaults.wechatOfficialAccountName",
      ),
      toutiaoUserName: t("aiRadar.defaults.toutiaoUserName"),
      modelRankingName: t("aiRadar.defaults.modelRankingName"),
      newMediaName: t("aiRadar.defaults.newMediaName"),
    }),
    [t],
  );

  const notFetchedLabel = t("aiRadar.notFetched");

  const addSource = (kind: AiRadarSourceKind) => {
    updateDraft((settings) => ({
      ...settings,
      sources: [...settings.sources, buildSource(kind, sourceDefaults)],
    }));
  };

  const removeSource = (id: string) => {
    updateDraft((settings) => ({
      ...settings,
      sources: settings.sources.filter((source) => source.id !== id),
    }));
  };

  const saveSources = async () => {
    if (!draftSettings) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await aiRadarSourcesUpdate(draftSettings);
      const next = await aiRadarList();
      setDraftSettings(next.settings);
      setResponse(next);
      onSettingsChange?.(next.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const sourceStates = response?.status.sourceStates ?? [];
  const mediaCount =
    response?.items.filter((item) => item.channel === "media").length ?? 0;
  const githubCount =
    response?.items.filter((item) => item.channel === "github").length ?? 0;
  const modelsCount =
    response?.items.filter((item) => item.channel === "models").length ?? 0;

  return (
    <div className="ai-radar-overlay" role="dialog" aria-modal="true">
      <section className="ai-radar-panel">
        <header className="ai-radar-header">
          <div>
            <h2>{t("aiRadar.title")}</h2>
            <div className="ai-radar-status-line">
              {t("aiRadar.statusLine", {
                last: formatTime(
                  response?.status.lastRefreshedAtMs,
                  notFetchedLabel,
                ),
                next: formatTime(
                  response?.status.nextRefreshAtMs,
                  notFetchedLabel,
                ),
              })}
            </div>
          </div>
          <div className="ai-radar-header-actions">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void refresh(activeTab === "sources" ? undefined : activeTab)
              }
              disabled={refreshing}
            >
              <RefreshCw size={14} aria-hidden />
              {refreshing ? t("aiRadar.refreshing") : t("aiRadar.refresh")}
            </button>
            <button
              type="button"
              className="ghost icon-only"
              onClick={onClose}
              aria-label={t("aiRadar.closeAria")}
              title={t("common:actions.close")}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </header>

        <div
          className="ai-radar-tabs"
          role="tablist"
          aria-label={t("aiRadar.tabsAria")}
        >
          <button
            type="button"
            className={activeTab === "media" ? "active" : ""}
            onClick={() => setActiveTab("media")}
          >
            <Newspaper size={14} aria-hidden />
            {t("aiRadar.tabs.media")}
            <span>{mediaCount}</span>
          </button>
          <button
            type="button"
            className={activeTab === "github" ? "active" : ""}
            onClick={() => setActiveTab("github")}
          >
            <Github size={14} aria-hidden />
            {t("aiRadar.tabs.github")}
            <span>{githubCount}</span>
          </button>
          <button
            type="button"
            className={activeTab === "models" ? "active" : ""}
            onClick={() => setActiveTab("models")}
          >
            <BarChart3 size={14} aria-hidden />
            {t("aiRadar.tabs.models")}
            <span>{modelsCount}</span>
          </button>
          <button
            type="button"
            className={activeTab === "sources" ? "active" : ""}
            onClick={() => setActiveTab("sources")}
          >
            <Rss size={14} aria-hidden />
            {t("aiRadar.tabs.sources")}
          </button>
        </div>

        {error && (
          <div className="ai-radar-error" role="alert">
            <CircleAlert size={14} aria-hidden />
            {error}
          </div>
        )}

        {activeTab === "sources" ? (
          <div className="ai-radar-sources">
            <div className="ai-radar-settings-row">
              <label>
                <span>{t("aiRadar.settings.refreshInterval")}</span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={draftSettings?.refreshIntervalMinutes ?? 60}
                  onChange={(event) =>
                    updateDraft((settings) => ({
                      ...settings,
                      refreshIntervalMinutes: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>{t("aiRadar.settings.retentionDays")}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={draftSettings?.retentionDays ?? 30}
                  onChange={(event) =>
                    updateDraft((settings) => ({
                      ...settings,
                      retentionDays: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="ai-radar-toggle">
                <input
                  type="checkbox"
                  checked={draftSettings?.enabled !== false}
                  onChange={(event) =>
                    updateDraft((settings) => ({
                      ...settings,
                      enabled: event.target.checked,
                    }))
                  }
                />
                <span>{t("aiRadar.settings.autoFetch")}</span>
              </label>
              <label className="ai-radar-toggle">
                <input
                  type="checkbox"
                  checked={draftSettings?.translateToChinese !== false}
                  onChange={(event) =>
                    updateDraft((settings) => ({
                      ...settings,
                      translateToChinese: event.target.checked,
                    }))
                  }
                />
                <span>{t("aiRadar.settings.translateToChinese")}</span>
              </label>
              <button
                type="button"
                className="primary"
                onClick={saveSources}
                disabled={saving}
              >
                <Save size={14} aria-hidden />
                {saving ? t("aiRadar.saving") : t("common:actions.save")}
              </button>
            </div>

            <div className="ai-radar-add-row">
              {sourceKinds.map((kind) => (
                <button
                  key={kind.value}
                  type="button"
                  className="secondary"
                  onClick={() => addSource(kind.value)}
                >
                  <Plus size={13} aria-hidden />
                  {t(kind.labelKey)}
                </button>
              ))}
            </div>

            <div className="ai-radar-source-list">
              {(draftSettings?.sources ?? []).map((source) => {
                const state = sourceStates.find(
                  (entry) => entry.sourceId === source.id,
                );
                return (
                  <div key={source.id} className="ai-radar-source-card">
                    <div className="ai-radar-source-top">
                      <label className="ai-radar-toggle">
                        <input
                          type="checkbox"
                          checked={source.enabled}
                          onChange={(event) =>
                            updateSource(source.id, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                        <span>{t(channelLabelKey(source.channel))}</span>
                      </label>
                      <select
                        value={source.kind}
                        onChange={(event) =>
                          updateSource(source.id, {
                            kind: event.target.value as AiRadarSourceKind,
                          })
                        }
                      >
                        {sourceKinds.map((kind) => (
                          <option key={kind.value} value={kind.value}>
                            {t(kind.labelKey)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ghost icon-only"
                        onClick={() => removeSource(source.id)}
                        aria-label={t("aiRadar.sources.deleteAria")}
                        title={t("common:actions.delete")}
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                    <input
                      value={source.name}
                      onChange={(event) =>
                        updateSource(source.id, { name: event.target.value })
                      }
                      aria-label={t("aiRadar.sources.nameLabel")}
                    />
                    {sourceUsesQuery(source.kind) ? (
                      <input
                        value={source.query ?? ""}
                        onChange={(event) =>
                          updateSource(source.id, { query: event.target.value })
                        }
                        aria-label={t(sourceTargetLabelKey(source.kind))}
                        placeholder={t(sourceTargetLabelKey(source.kind))}
                      />
                    ) : (
                      <input
                        value={source.url ?? ""}
                        onChange={(event) =>
                          updateSource(source.id, { url: event.target.value })
                        }
                        aria-label={t(sourceTargetLabelKey(source.kind))}
                        placeholder={t(sourceTargetLabelKey(source.kind))}
                      />
                    )}
                    <div
                      className={
                        state?.ok
                          ? "ai-radar-source-state ok"
                          : "ai-radar-source-state"
                      }
                    >
                      {state
                        ? [
                            t(
                              state.ok
                                ? "aiRadar.sourceState.ok"
                                : "aiRadar.sourceState.failed",
                            ),
                            t("aiRadar.sourceState.items", {
                              count: state.itemCount,
                            }),
                            formatTime(state.lastFetchedAtMs, notFetchedLabel),
                            state.lastError,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : notFetchedLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="ai-radar-items">
            {activeChannel && (
              <div className="ai-radar-list-toolbar">
                <span>{t("aiRadar.sort.label")}</span>
                <div
                  className="ai-radar-sort-options"
                  role="group"
                  aria-label={t("aiRadar.sort.aria")}
                >
                  {activeSortOptions.map((sortMode) => (
                    <button
                      key={sortMode}
                      type="button"
                      className={sortMode === activeSortMode ? "active" : ""}
                      aria-pressed={sortMode === activeSortMode}
                      onClick={() =>
                        setSortModeByChannel((current) => ({
                          ...current,
                          [activeChannel]: sortMode,
                        }))
                      }
                    >
                      {t(sortModeLabelKey(sortMode))}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {loading ? (
              <div className="ai-radar-empty">{t("common:status.loading")}</div>
            ) : items.length === 0 ? (
              <div className="ai-radar-empty">
                {activeTab === "media"
                  ? t("aiRadar.empty.media")
                  : activeTab === "github"
                    ? t("aiRadar.empty.github")
                    : t("aiRadar.empty.models")}
              </div>
            ) : (
              items.map((item) => {
                const title = displayTitle(item);
                const summary = displaySummary(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="ai-radar-item"
                    onClick={() => void openUrl(item.url)}
                  >
                    <div className="ai-radar-item-main">
                      <div className="ai-radar-item-title" title={item.title}>
                        {title}
                      </div>
                      {summary && (
                        <div className="ai-radar-item-summary">{summary}</div>
                      )}
                      <div className="ai-radar-item-meta">
                        <span>{item.sourceName}</span>
                        <span>{itemTime(item, notFetchedLabel)}</span>
                        {item.metrics.stars != null && (
                          <span>
                            <Star size={12} aria-hidden />
                            {formatNumber(item.metrics.stars)}
                          </span>
                        )}
                        {item.metrics.starDelta24h ? (
                          <span>
                            +{formatNumber(item.metrics.starDelta24h)}
                          </span>
                        ) : null}
                        {item.metrics.tokens != null && (
                          <span>
                            {t("aiRadar.metrics.tokens", {
                              value: formatNumber(item.metrics.tokens),
                            })}
                          </span>
                        )}
                        {item.metrics.requests != null && (
                          <span>
                            {t("aiRadar.metrics.requests", {
                              value: formatNumber(item.metrics.requests),
                            })}
                          </span>
                        )}
                      </div>
                      {item.tags.length > 0 && (
                        <div className="ai-radar-tags">
                          {item.tags.slice(0, 6).map((tag) => (
                            <span key={tag}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ExternalLink size={14} aria-hidden />
                  </button>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
}
