const COMMAND_TITLE_PREFIX = /^(?:Command|命令)[:：]\s*/i;
const TOOL_TITLE_PREFIX = /^(?:Tool|工具)[:：]\s*/i;
const COLLAB_TITLE_PREFIX = /^(?:Collab|协作)[:：]\s*/i;

function stripKnownPrefix(title: string, pattern: RegExp) {
  return title.replace(pattern, "").trim();
}

export function commandTextFromTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return "";
  }
  if (!COMMAND_TITLE_PREFIX.test(trimmed)) {
    return /^(?:Command|命令)$/i.test(trimmed) ? "" : trimmed;
  }
  return stripKnownPrefix(trimmed, COMMAND_TITLE_PREFIX);
}

export function mcpToolPartsFromTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed || !TOOL_TITLE_PREFIX.test(trimmed)) {
    return { server: "", tool: "" };
  }
  const stripped = stripKnownPrefix(trimmed, TOOL_TITLE_PREFIX);
  const segments = stripped
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return { server: "", tool: "" };
  }
  const [server, ...toolParts] = segments;
  return {
    server,
    tool: toolParts.join(" / "),
  };
}

export function toolNameFromRawTitle(title: string) {
  const { server, tool } = mcpToolPartsFromTitle(title);
  if (!tool) {
    return server;
  }
  const segments = tool
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

export function collabToolNameFromTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    return "";
  }
  if (/^(?:Collab tool call|协作工具调用)$/i.test(trimmed)) {
    return "";
  }
  if (!COLLAB_TITLE_PREFIX.test(trimmed)) {
    return "";
  }
  return stripKnownPrefix(trimmed, COLLAB_TITLE_PREFIX);
}

export function isPendingChangesDetail(detail: string) {
  return /^(?:Pending changes|待处理变更)$/i.test(detail.trim());
}
