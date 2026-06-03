// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import type {
  AiRadarItem,
  AiRadarListResponse,
  AiRadarSettings,
  AiRadarSource,
} from "@/types";
import {
  aiRadarList,
  aiRadarRefresh,
  aiRadarSourcesUpdate,
} from "@services/tauri";
import { AiRadarPanel, normalizeSourceForKind } from "./AiRadarPanel";

vi.mock("@services/tauri", () => ({
  aiRadarList: vi.fn(),
  aiRadarRefresh: vi.fn(),
  aiRadarSourcesUpdate: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

const aiRadarListMock = vi.mocked(aiRadarList);
const aiRadarRefreshMock = vi.mocked(aiRadarRefresh);
const aiRadarSourcesUpdateMock = vi.mocked(aiRadarSourcesUpdate);

function tabButton(name: RegExp | string) {
  return within(screen.getByRole("tablist")).getByRole("button", { name });
}

function source(overrides: Partial<AiRadarSource> = {}): AiRadarSource {
  return {
    id: "source-1",
    name: "Source 1",
    kind: "rss",
    url: "https://example.com/feed.xml",
    query: null,
    enabled: true,
    channel: "media",
    createdAtMs: null,
    ...overrides,
  };
}

function settings(overrides: Partial<AiRadarSettings> = {}): AiRadarSettings {
  return {
    enabled: true,
    refreshIntervalMinutes: 60,
    maxItems: 800,
    retentionDays: 30,
    translateToChinese: true,
    defaultSourceVersion: 9,
    sources: [source()],
    ...overrides,
  };
}

function item(overrides: Partial<AiRadarItem> = {}): AiRadarItem {
  return {
    id: "item-1",
    channel: "media",
    sourceId: "source-1",
    sourceName: "Source 1",
    title: "OpenAI launches agent features",
    summary: "A concise update.",
    titleZh: null,
    summaryZh: null,
    url: "https://example.com/item-1",
    publishedAtMs: 1,
    fetchedAtMs: 1,
    score: 1,
    tags: [],
    metrics: {},
    ...overrides,
  };
}

function response(
  overrides: Partial<AiRadarListResponse> = {},
): AiRadarListResponse {
  return {
    settings: settings(),
    items: [item()],
    status: {
      lastRefreshedAtMs: 1,
      nextRefreshAtMs: null,
      stale: false,
      sourceStates: [
        {
          sourceId: "source-1",
          sourceName: "Source 1",
          ok: true,
          lastFetchedAtMs: 1,
          lastError: null,
          itemCount: 1,
        },
      ],
    },
    ...overrides,
  };
}

describe("AiRadarPanel helpers", () => {
  it("clears hidden URLs for query-based source kinds", () => {
    const normalized = normalizeSourceForKind(
      source({
        kind: "wechatOfficialAccount",
        url: "https://example.com/old-feed.xml",
        query: "/wechat/sogou/almosthuman2014",
      }),
    );

    expect(normalized.channel).toBe("media");
    expect(normalized.url).toBeNull();
    expect(normalized.query).toBe("/wechat/sogou/almosthuman2014");
  });

  it("assigns model rankings to the model channel", () => {
    const normalized = normalizeSourceForKind(
      source({
        kind: "modelRanking",
        url: "https://openrouter.ai/rankings?view=week",
        query: "hidden-query",
        channel: "media",
      }),
    );

    expect(normalized.channel).toBe("models");
    expect(normalized.url).toBe("https://openrouter.ai/rankings?view=week");
    expect(normalized.query).toBeNull();
  });
});

describe("AiRadarPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.useFakeTimers();
    vi.resetAllMocks();
    aiRadarRefreshMock.mockResolvedValue(response());
    aiRadarSourcesUpdateMock.mockResolvedValue(settings());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses localized English panel copy", async () => {
    await i18n.changeLanguage("en");
    aiRadarListMock.mockResolvedValueOnce(
      response({
        items: [],
        status: {
          lastRefreshedAtMs: 1,
          nextRefreshAtMs: null,
          stale: false,
          sourceStates: [],
        },
      }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("heading", { name: "AI Radar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Model Rankings/ })).toBeTruthy();

    fireEvent.click(tabButton(/Sources/));

    expect(screen.getByLabelText("Auto-fetch interval")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /WeChat Official Account/ }),
    ).toBeTruthy();
  });

  it("renders refresh as an icon-only accessible action", async () => {
    aiRadarListMock.mockResolvedValueOnce(response());

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const refreshButton = screen.getByRole("button", { name: "刷新" });

    expect(refreshButton.textContent).toBe("");
    expect(refreshButton.getAttribute("title")).toBe("刷新");
  });

  it("does not block initial content while the first refresh is running", async () => {
    let resolveRefresh: (value: AiRadarListResponse) => void = () => {};
    const refreshPromise = new Promise<AiRadarListResponse>((resolve) => {
      resolveRefresh = resolve;
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        items: [],
        status: {
          lastRefreshedAtMs: null,
          nextRefreshAtMs: null,
          stale: true,
          sourceStates: [
            {
              sourceId: "source-1",
              sourceName: "Source 1",
              ok: true,
              lastFetchedAtMs: null,
              lastError: null,
              itemCount: 0,
            },
          ],
        },
      }),
    );
    aiRadarRefreshMock.mockReturnValueOnce(refreshPromise);

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarRefreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("加载中...")).toBeNull();
    expect(screen.getByText("暂无媒体资讯")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "刷新中" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () => {
      resolveRefresh(
        response({
          items: [
            item({
              title: "Fresh AI radar item",
            }),
          ],
        }),
      );
      await refreshPromise;
    });

    expect(screen.getByText("Fresh AI radar item")).toBeTruthy();
  });

  it("filters media items by source group", async () => {
    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({
          sources: [
            source({
              id: "media-openai-news",
              name: "OpenAI News",
              kind: "rss",
              url: "https://openai.com/news/rss.xml",
            }),
            source({
              id: "media-wechat-jiqizhixin",
              name: "机器之心",
              kind: "wechatOfficialAccount",
              url: null,
              query: "/wechat/sogou/almosthuman2014",
            }),
          ],
        }),
        items: [
          item({
            id: "media-official-1",
            sourceId: "media-openai-news",
            sourceName: "OpenAI News",
            title: "OpenAI 官方博客更新",
          }),
          item({
            id: "media-wechat-1",
            sourceId: "media-wechat-jiqizhixin",
            sourceName: "机器之心",
            title: "机器之心公众号更新",
          }),
        ],
        status: {
          lastRefreshedAtMs: 1,
          nextRefreshAtMs: null,
          stale: false,
          sourceStates: [
            {
              sourceId: "media-openai-news",
              sourceName: "OpenAI News",
              ok: true,
              lastFetchedAtMs: 1,
              lastError: null,
              itemCount: 1,
            },
            {
              sourceId: "media-wechat-jiqizhixin",
              sourceName: "机器之心",
              ok: true,
              lastFetchedAtMs: 1,
              lastError: null,
              itemCount: 1,
            },
          ],
        },
      }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("OpenAI 官方博客更新")).toBeTruthy();
    expect(screen.getByText("机器之心公众号更新")).toBeTruthy();

    const group = within(screen.getByRole("group", { name: "媒体来源分组" }));
    fireEvent.click(group.getByRole("button", { name: /微信公众号/ }));

    expect(screen.queryByText("OpenAI 官方博客更新")).toBeNull();
    expect(screen.getByText("机器之心公众号更新")).toBeTruthy();
  });

  it("preserves unsaved source drafts during translation polling", async () => {
    aiRadarListMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(
      response({
        settings: settings({ refreshIntervalMinutes: 60 }),
        items: [
          item({
            titleZh: "OpenAI 发布智能体功能",
            summaryZh: "一条简短更新。",
          }),
        ],
      }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/来源/));
    const intervalInput = screen.getByLabelText(
      "自动抓取间隔",
    ) as HTMLInputElement;
    fireEvent.change(intervalInput, { target: { value: "15" } });
    expect(intervalInput.value).toBe("15");

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarListMock).toHaveBeenCalledTimes(2);
    expect(
      (screen.getByLabelText("自动抓取间隔") as HTMLInputElement).value,
    ).toBe("15");
  });

  it("reloads items and source states after saving sources", async () => {
    const savedSettings = settings({ sources: [] });
    aiRadarSourcesUpdateMock.mockResolvedValue(savedSettings);
    aiRadarListMock.mockResolvedValueOnce(response()).mockResolvedValueOnce(
      response({
        settings: savedSettings,
        items: [],
        status: {
          lastRefreshedAtMs: 1,
          nextRefreshAtMs: null,
          stale: false,
          sourceStates: [],
        },
      }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("OpenAI launches agent features")).toBeTruthy();

    fireEvent.click(tabButton(/来源/));
    fireEvent.click(screen.getByRole("button", { name: "删除来源" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ sources: [] }),
    );
    expect(aiRadarListMock).toHaveBeenCalledTimes(2);
    fireEvent.click(tabButton(/媒体资讯/));
    expect(screen.queryByText("OpenAI launches agent features")).toBeNull();
  });

  it("renders model ranking items and usage metrics", async () => {
    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({
          sources: [
            source({
              id: "models-openrouter-weekly",
              name: "OpenRouter Weekly Models",
              kind: "modelRanking",
              url: "https://openrouter.ai/rankings?view=week",
              query: null,
              channel: "models",
            }),
          ],
        }),
        items: [
          item({
            id: "model-1",
            channel: "models",
            sourceId: "models-openrouter-weekly",
            sourceName: "OpenRouter Weekly Models",
            title: "#1 anthropic/claude-sonnet-4.5",
            summary: "OpenRouter 本周模型调用榜第 1 名。",
            url: "https://openrouter.ai/anthropic/claude-sonnet-4.5",
            metrics: {
              tokens: 1_234_567_890,
              requests: 98_765,
              rank: 1,
            },
          }),
        ],
        status: {
          lastRefreshedAtMs: 1,
          nextRefreshAtMs: null,
          stale: false,
          sourceStates: [
            {
              sourceId: "models-openrouter-weekly",
              sourceName: "OpenRouter Weekly Models",
              ok: true,
              lastFetchedAtMs: 1,
              lastError: null,
              itemCount: 1,
            },
          ],
        },
      }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/模型榜单/));

    expect(screen.getByText("#1 anthropic/claude-sonnet-4.5")).toBeTruthy();
    expect(screen.getByText(/tokens/)).toBeTruthy();
    expect(screen.getByText(/次调用/)).toBeTruthy();
    expect(aiRadarRefreshMock).not.toHaveBeenCalled();
  });

  it("switches sort modes for model rankings", async () => {
    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({
          sources: [
            source({
              id: "models-openrouter-weekly",
              name: "OpenRouter Weekly Models",
              kind: "modelRanking",
              url: "https://openrouter.ai/rankings?view=week",
              query: null,
              channel: "models",
            }),
          ],
        }),
        items: [
          item({
            id: "model-tokens",
            channel: "models",
            sourceId: "models-openrouter-weekly",
            sourceName: "OpenRouter Weekly Models",
            title: "#1 token/model",
            summary: "OpenRouter 本周模型调用榜第 1 名。",
            url: "https://openrouter.ai/token/model",
            metrics: {
              tokens: 1_000,
              requests: 20,
              rank: 1,
            },
          }),
          item({
            id: "model-requests",
            channel: "models",
            sourceId: "models-openrouter-weekly",
            sourceName: "OpenRouter Weekly Models",
            title: "#2 call/model",
            summary: "OpenRouter 本周模型调用榜第 2 名。",
            url: "https://openrouter.ai/call/model",
            metrics: {
              tokens: 500,
              requests: 200,
              rank: 2,
            },
          }),
        ],
        status: {
          lastRefreshedAtMs: 1,
          nextRefreshAtMs: null,
          stale: false,
          sourceStates: [
            {
              sourceId: "models-openrouter-weekly",
              sourceName: "OpenRouter Weekly Models",
              ok: true,
              lastFetchedAtMs: 1,
              lastError: null,
              itemCount: 2,
            },
          ],
        },
      }),
    );

    const { container } = render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/模型榜单/));

    const titles = () =>
      Array.from(container.querySelectorAll(".ai-radar-item-title")).map(
        (entry) => entry.textContent,
      );
    expect(titles()).toEqual(["#1 token/model", "#2 call/model"]);

    fireEvent.click(screen.getByRole("button", { name: "调用次数" }));

    expect(titles()).toEqual(["#2 call/model", "#1 token/model"]);
  });

  it("classifies the default watched source id by kind when the source is loaded", async () => {
    const githubSearch = source({
      id: "github-watched-repositories",
      name: "GitHub Search Reused Id",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({ sources: [githubSearch] }),
        items: [
          item({
            id: "github-openai-codex",
            channel: "github",
            sourceId: "github-watched-repositories",
            sourceName: "GitHub Search Reused Id",
            title: "openai/codex",
            summary: "Lightweight coding agent.",
            url: "https://github.com/openai/codex",
            metrics: { stars: 1200 },
          }),
        ],
      }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));

    expect(screen.getByRole("button", { name: "热门 1" })).toBeTruthy();
    expect(screen.getByText("openai/codex")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "我的关注 0" }));

    expect(screen.queryByText("openai/codex")).toBeNull();
  });

  it("RQ-001 AC-01 adds ranking repositories to the watched list and removes them", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const watched = source({
      id: "github-watched-repositories",
      name: "GitHub Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "",
      channel: "github",
    });
    const nextSettings = settings({ sources: [githubSearch, watched] });
    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: nextSettings,
        items: [
          item({
            id: "github-openai-codex",
            channel: "github",
            sourceId: "github-agent-search",
            sourceName: "GitHub Agents",
            title: "openai/codex",
            summary: "Lightweight coding agent.",
            url: "https://github.com/openai/codex",
            metrics: { stars: 1200, forks: 90, openIssues: 12 },
            tags: ["Rust", "agent"],
          }),
        ],
      }),
    );
    aiRadarRefreshMock
      .mockResolvedValueOnce(
        response({
          settings: settings({
            sources: [
              { ...githubSearch },
              { ...watched, query: "openai/codex" },
            ],
          }),
          items: [
            item({
              id: "github-openai-codex",
              channel: "github",
              sourceId: "github-watched-repositories",
              sourceName: "GitHub Watched Repositories",
              title: "openai/codex",
              summary: "Lightweight coding agent.",
              url: "https://github.com/openai/codex",
              metrics: { stars: 1200, forks: 90, openIssues: 12 },
              tags: ["Rust", "agent"],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          settings: nextSettings,
          items: [],
        }),
      );
    aiRadarSourcesUpdateMock
      .mockResolvedValueOnce(
        settings({
          sources: [{ ...githubSearch }, { ...watched, query: "openai/codex" }],
        }),
      )
      .mockResolvedValueOnce(nextSettings);

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));
    fireEvent.click(screen.getByRole("button", { name: "关注 openai/codex" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: "github-watched-repositories",
            createdAtMs: expect.any(Number),
            query: "openai/codex",
          }),
        ]),
      }),
    );
    expect(aiRadarRefreshMock).toHaveBeenCalledWith({
      sourceId: "github-watched-repositories",
    });

    fireEvent.click(screen.getByRole("button", { name: "我的关注 1" }));
    expect(screen.getByText("openai/codex")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "取消关注 openai/codex" }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: "github-watched-repositories",
            query: "",
          }),
        ]),
      }),
    );
    expect(aiRadarRefreshMock).toHaveBeenLastCalledWith({
      sourceId: "github-watched-repositories",
    });
    expect(screen.getByText("还没有关注项目。")).toBeTruthy();
  });

  it("RQ-001 AC-02 manually adds watched repositories and reports duplicates", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const watched = source({
      id: "github-watched-repositories",
      name: "GitHub Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "openai/codex",
      channel: "github",
    });
    const savedSettings = settings({
      sources: [{ ...githubSearch }, { ...watched, query: "openai/codex\nanthropics/claude-code" }],
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({ sources: [githubSearch, watched] }),
        items: [
          item({
            id: "github-openai-codex",
            channel: "github",
            sourceId: "github-watched-repositories",
            sourceName: "GitHub Watched Repositories",
            title: "openai/codex",
            summary: "Lightweight coding agent.",
            url: "https://github.com/openai/codex",
            metrics: { stars: 1200 },
          }),
        ],
      }),
    );
    aiRadarRefreshMock.mockResolvedValueOnce(
      response({
        settings: savedSettings,
        items: [
          item({
            id: "github-openai-codex",
            channel: "github",
            sourceId: "github-watched-repositories",
            sourceName: "GitHub Watched Repositories",
            title: "openai/codex",
            summary: "Lightweight coding agent.",
            url: "https://github.com/openai/codex",
            metrics: { stars: 1200 },
          }),
          item({
            id: "github-anthropics-claude-code",
            channel: "github",
            sourceId: "github-watched-repositories",
            sourceName: "GitHub Watched Repositories",
            title: "anthropics/claude-code",
            summary: "Agentic coding tool.",
            url: "https://github.com/anthropics/claude-code",
            metrics: { stars: 900 },
          }),
        ],
      }),
    );
    aiRadarSourcesUpdateMock.mockResolvedValueOnce(savedSettings);

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));
    fireEvent.click(screen.getByRole("button", { name: "我的关注 1" }));
    fireEvent.change(screen.getByLabelText("添加关注仓库"), {
      target: { value: "https://github.com/anthropics/claude-code" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加关注" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: "github-watched-repositories",
            query: "openai/codex\nanthropics/claude-code",
          }),
        ]),
      }),
    );
    expect(aiRadarRefreshMock).toHaveBeenCalledWith({
      sourceId: "github-watched-repositories",
    });
    expect(screen.getByText("anthropics/claude-code")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("添加关注仓库"), {
      target: { value: "openai/codex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加关注" }));

    expect(screen.getByText("已经关注过这个仓库。")).toBeTruthy();
  });

  it("normalizes scheme-less GitHub repository URLs before saving watches", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const watched = source({
      id: "github-watched-repositories",
      name: "GitHub Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "",
      channel: "github",
    });
    const savedSettings = settings({
      sources: [{ ...githubSearch }, { ...watched, query: "openai/codex" }],
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({ sources: [githubSearch, watched] }),
        items: [],
      }),
    );
    aiRadarSourcesUpdateMock.mockResolvedValueOnce(savedSettings);
    aiRadarRefreshMock.mockResolvedValueOnce(
      response({ settings: savedSettings, items: [] }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));
    fireEvent.click(screen.getByRole("button", { name: "我的关注 0" }));
    fireEvent.change(screen.getByLabelText("添加关注仓库"), {
      target: { value: "github.com/openai/codex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加关注" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: "github-watched-repositories",
            createdAtMs: expect.any(Number),
            query: "openai/codex",
          }),
        ]),
      }),
    );
  });

  it("preserves unsaved source drafts when saving watched repositories", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const watched = source({
      id: "github-watched-repositories",
      name: "GitHub Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "",
      channel: "github",
    });
    const draftSearchName = "Draft GitHub Agents";
    const savedSettings = settings({
      sources: [
        { ...githubSearch, name: draftSearchName },
        { ...watched, query: "openai/codex" },
      ],
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({ sources: [githubSearch, watched] }),
        items: [],
      }),
    );
    aiRadarSourcesUpdateMock.mockResolvedValueOnce(savedSettings);
    aiRadarRefreshMock.mockResolvedValueOnce(
      response({ settings: savedSettings, items: [] }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/来源/));
    fireEvent.change(screen.getAllByLabelText("来源名称")[0], {
      target: { value: draftSearchName },
    });
    fireEvent.click(tabButton(/GitHub/));
    fireEvent.click(screen.getByRole("button", { name: "我的关注 0" }));
    fireEvent.change(screen.getByLabelText("添加关注仓库"), {
      target: { value: "openai/codex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加关注" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: "github-agent-search",
            name: draftSearchName,
          }),
          expect.objectContaining({
            id: "github-watched-repositories",
            query: "openai/codex",
          }),
        ]),
      }),
    );
  });

  it("ignores disabled watched sources when adding repositories", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const disabledWatched = source({
      id: "github-watched-repositories",
      name: "Disabled Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "openai/codex",
      enabled: false,
      channel: "github",
    });
    const savedSettings = settings({
      sources: [
        githubSearch,
        disabledWatched,
        source({
          id: "github-watched-repositories-2",
          name: "GitHub Watched Repositories",
          kind: "githubRepositories" as AiRadarSource["kind"],
          url: null,
          query: "openai/codex",
          enabled: true,
          channel: "github",
        }),
      ],
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({ sources: [githubSearch, disabledWatched] }),
        items: [
          item({
            id: "github-openai-codex",
            channel: "github",
            sourceId: "github-agent-search",
            sourceName: "GitHub Agents",
            title: "openai/codex",
            summary: "Lightweight coding agent.",
            url: "https://github.com/openai/codex",
            metrics: { stars: 1200 },
          }),
        ],
      }),
    );
    aiRadarSourcesUpdateMock.mockResolvedValueOnce(savedSettings);
    aiRadarRefreshMock.mockResolvedValueOnce(
      response({ settings: savedSettings, items: [] }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));
    expect(screen.getByRole("button", { name: "我的关注 0" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关注 openai/codex" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: "github-watched-repositories",
            enabled: false,
            query: "openai/codex",
          }),
          expect.objectContaining({
            id: "github-watched-repositories-2",
            enabled: true,
            query: "openai/codex",
          }),
        ]),
      }),
    );
  });

  it("aggregates watched repositories across sources and removes from the item source", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const watchedPrimary = source({
      id: "github-watched-repositories",
      name: "GitHub Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "openai/codex",
      channel: "github",
    });
    const watchedSecondary = source({
      id: "github-watched-repositories-2",
      name: "Extra Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "anthropics/claude-code",
      channel: "github",
    });
    const savedSettings = settings({
      sources: [
        githubSearch,
        watchedPrimary,
        { ...watchedSecondary, query: "" },
      ],
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({
          sources: [githubSearch, watchedPrimary, watchedSecondary],
        }),
        items: [
          item({
            id: "github-anthropics-claude-code",
            channel: "github",
            sourceId: "github-watched-repositories-2",
            sourceName: "Extra Watched Repositories",
            title: "anthropics/claude-code",
            summary: "Agentic coding tool.",
            url: "https://github.com/anthropics/claude-code",
            metrics: { stars: 900 },
          }),
        ],
      }),
    );
    aiRadarSourcesUpdateMock.mockResolvedValueOnce(savedSettings);
    aiRadarRefreshMock.mockResolvedValueOnce(
      response({ settings: savedSettings, items: [] }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));
    fireEvent.click(screen.getByRole("button", { name: "我的关注 2" }));
    expect(screen.getByText("anthropics/claude-code")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", {
        name: "取消关注 anthropics/claude-code",
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarSourcesUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: expect.arrayContaining([
          expect.objectContaining({
            id: "github-watched-repositories",
            query: "openai/codex",
          }),
          expect.objectContaining({
            id: "github-watched-repositories-2",
            query: "",
          }),
        ]),
      }),
    );
    expect(aiRadarRefreshMock).toHaveBeenCalledWith({
      sourceId: "github-watched-repositories-2",
    });
  });

  it("refreshes all GitHub sources from the watched repository view", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const watchedPrimary = source({
      id: "github-watched-repositories",
      name: "GitHub Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "openai/codex",
      channel: "github",
    });
    const watchedSecondary = source({
      id: "github-watched-repositories-2",
      name: "Extra Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: "anthropics/claude-code",
      channel: "github",
    });
    const loadedSettings = settings({
      sources: [githubSearch, watchedPrimary, watchedSecondary],
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: loadedSettings,
        items: [
          item({
            id: "github-openai-codex",
            channel: "github",
            sourceId: "github-watched-repositories",
            sourceName: "GitHub Watched Repositories",
            title: "openai/codex",
            url: "https://github.com/openai/codex",
            metrics: { stars: 1200 },
          }),
          item({
            id: "github-anthropics-claude-code",
            channel: "github",
            sourceId: "github-watched-repositories-2",
            sourceName: "Extra Watched Repositories",
            title: "anthropics/claude-code",
            url: "https://github.com/anthropics/claude-code",
            metrics: { stars: 900 },
          }),
        ],
      }),
    );
    aiRadarRefreshMock.mockResolvedValueOnce(
      response({ settings: loadedSettings, items: [] }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));
    fireEvent.click(screen.getByRole("button", { name: "我的关注 2" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(aiRadarRefreshMock).toHaveBeenCalledWith({ channel: "github" });
  });

  it("does not save watched repositories beyond the maximum list size", async () => {
    const githubSearch = source({
      id: "github-agent-search",
      name: "GitHub Agents",
      kind: "githubSearch",
      url: null,
      query: "agent topic:llm stars:>100 archived:false fork:false",
      channel: "github",
    });
    const watchedQuery = Array.from(
      { length: 30 },
      (_, index) => `owner${index}/repo${index}`,
    ).join("\n");
    const watched = source({
      id: "github-watched-repositories",
      name: "GitHub Watched Repositories",
      kind: "githubRepositories" as AiRadarSource["kind"],
      url: null,
      query: watchedQuery,
      channel: "github",
    });

    aiRadarListMock.mockResolvedValueOnce(
      response({
        settings: settings({ sources: [githubSearch, watched] }),
        items: [
          item({
            id: "github-openai-codex",
            channel: "github",
            sourceId: "github-agent-search",
            sourceName: "GitHub Agents",
            title: "openai/codex",
            summary: "Lightweight coding agent.",
            url: "https://github.com/openai/codex",
            metrics: { stars: 1200 },
          }),
        ],
      }),
    );

    render(<AiRadarPanel onClose={vi.fn()} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(tabButton(/GitHub/));
    fireEvent.click(screen.getByRole("button", { name: "我的关注 30" }));
    fireEvent.change(screen.getByLabelText("添加关注仓库"), {
      target: { value: "openai/codex" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加关注" }));

    expect(screen.getByText("最多关注 30 个 GitHub 仓库。")).toBeTruthy();
    expect(aiRadarSourcesUpdateMock).not.toHaveBeenCalled();
    expect(aiRadarRefreshMock).not.toHaveBeenCalled();
  });
});
