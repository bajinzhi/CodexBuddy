import { describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import type { ConversationItem } from "../../../types";
import { buildToolSummary, statusToneFromText } from "./messageRenderUtils";

function makeToolItem(
  overrides: Partial<Extract<ConversationItem, { kind: "tool" }>>,
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id: "tool-1",
    kind: "tool",
    toolType: "webSearch",
    title: "Web search",
    detail: "codex monitor",
    status: "completed",
    output: "",
    ...overrides,
  };
}

describe("messageRenderUtils", () => {
  it("renders web search as searching while in progress", () => {
    const summary = buildToolSummary(makeToolItem({ status: "inProgress" }), "");
    expect(summary.label).toBe("searching");
    expect(summary.value).toBe("codex monitor");
  });

  it("renders mcp search calls as searching while in progress", () => {
    const summary = buildToolSummary(
      makeToolItem({
        toolType: "mcpToolCall",
        title: "Tool: web / search_query",
        detail: '{\n  "query": "codex monitor"\n}',
        status: "inProgress",
      }),
      "",
    );
    expect(summary.label).toBe("searching");
    expect(summary.value).toBe("codex monitor");
  });

  it("strips localized command prefixes when building summaries", () => {
    const summary = buildToolSummary(
      makeToolItem({
        toolType: "commandExecution",
        title: "命令：rg reducers",
      }),
      "",
    );
    expect(summary.value).toBe("rg reducers");
  });

  it("classifies camelCase inProgress as processing", () => {
    expect(statusToneFromText("inProgress")).toBe("processing");
  });

  it("renders collab tool calls with nickname and role", () => {
    const summary = buildToolSummary(
      makeToolItem({
        toolType: "collabToolCall",
        title: "Collab: wait",
        detail: "From thread-parent → thread-child",
        status: "completed",
        output: "Robie [explorer]: completed",
        collabReceivers: [
          {
            threadId: "thread-child",
            nickname: "Robie",
            role: "explorer",
          },
        ],
      }),
      "",
    );
    expect(summary.label).toBe("waited for");
    expect(summary.value).toBe("Robie [explorer]");
    expect(summary.output).toContain("Robie [explorer]: completed");
  });

  it("localizes collab status verbs in zh-CN", async () => {
    await i18n.changeLanguage("zh-CN");

    const summary = buildToolSummary(
      makeToolItem({
        toolType: "collabToolCall",
        title: "Collab: send",
        detail: "From thread-parent → thread-child",
        status: "inProgress",
        collabReceivers: [
          {
            threadId: "thread-child",
            nickname: "Robie",
            role: "explorer",
          },
        ],
      }),
      "",
    );

    expect(summary.label).toBe("正在发送给");
    expect(summary.value).toBe("Robie [explorer]");
  });

  it("relocalizes cached tool titles at render time", async () => {
    const item = makeToolItem({
      toolType: "plan",
      title: "Plan",
      detail: "completed",
    });

    expect(buildToolSummary(item, "").value).toBe("Plan");

    await i18n.changeLanguage("zh-CN");

    expect(buildToolSummary(item, "").value).toBe("计划");
  });
});
