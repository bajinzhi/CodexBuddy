import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  AppMention,
  ComposerSendIntent,
  GitLogEntry,
  GitHubPullRequest,
  PullRequestReviewAction,
  PullRequestReviewIntent,
  WorkspaceInfo,
} from "../../../types";
import type { GitDiffSource, GitPanelMode } from "../types";
import { buildPullRequestDraft } from "../../../utils/pullRequestPrompt";
import { parsePullRequestReviewCommand } from "../utils/pullRequestReviewCommands";

const KNOWN_SLASH_COMMAND_REGEX = /^\/(?:apps|fast|fork|mcp|new|resume|status)\b/i;

type ComposerContextAction = {
  id: string;
  label: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

type UsePullRequestComposerOptions = {
  activeWorkspace: WorkspaceInfo | null;
  selectedPullRequest: GitHubPullRequest | null;
  selectedCommit: GitLogEntry | null;
  filePanelMode: "git" | "files" | "prompts";
  gitPanelMode: GitPanelMode;
  centerMode: "chat" | "diff";
  isCompact: boolean;
  setSelectedPullRequest: (pullRequest: GitHubPullRequest | null) => void;
  setDiffSource: (source: GitDiffSource) => void;
  setSelectedDiffPath: (path: string | null) => void;
  setCenterMode: (mode: "chat" | "diff") => void;
  setGitPanelMode: (mode: GitPanelMode) => void;
  setPrefillDraft: (draft: { id: string; text: string; createdAt: number }) => void;
  setActiveTab: (tab: "home" | "projects" | "codex" | "git" | "log") => void;
  pullRequestReviewActions: PullRequestReviewAction[];
  pullRequestReviewLaunching: boolean;
  runPullRequestReview: (options: {
    intent: PullRequestReviewIntent;
    question?: string;
    images?: string[];
    activateThread?: boolean;
  }) => Promise<string | null>;
  startReview: (text: string) => Promise<void>;
  clearActiveImages: () => void;
  handleSend: (
    text: string,
    images: string[],
    appMentions?: AppMention[],
    submitIntent?: ComposerSendIntent,
  ) => Promise<void>;
};

export function usePullRequestComposer({
  activeWorkspace,
  selectedPullRequest,
  selectedCommit,
  filePanelMode,
  gitPanelMode,
  centerMode,
  isCompact,
  setSelectedPullRequest,
  setDiffSource,
  setSelectedDiffPath,
  setCenterMode,
  setGitPanelMode,
  setPrefillDraft,
  setActiveTab,
  pullRequestReviewActions,
  pullRequestReviewLaunching,
  runPullRequestReview,
  startReview,
  clearActiveImages,
  handleSend,
}: UsePullRequestComposerOptions) {
  const { t } = useTranslation("app");
  const resolveReviewActionLabel = useCallback(
    (action: PullRequestReviewAction) => {
      if (action.id === "pr-review-full") {
        return t("gitDiff.reviewActions.reviewPr");
      }
      if (action.id === "pr-review-risks") {
        return t("gitDiff.reviewActions.riskScan");
      }
      if (action.id === "pr-review-tests") {
        return t("gitDiff.reviewActions.testPlan");
      }
      if (action.id === "pr-review-summary") {
        return t("gitDiff.reviewActions.summarize");
      }
      return action.label;
    },
    [t],
  );
  const isPullRequestComposer = useMemo(
    () =>
      Boolean(selectedPullRequest) &&
      filePanelMode === "git" &&
      gitPanelMode === "prs" &&
      centerMode === "diff",
    [centerMode, filePanelMode, gitPanelMode, selectedPullRequest],
  );

  const isCommitComposer = useMemo(
    () =>
      Boolean(selectedCommit) &&
      filePanelMode === "git" &&
      gitPanelMode === "log" &&
      centerMode === "diff",
    [centerMode, filePanelMode, gitPanelMode, selectedCommit],
  );

  const handleSelectPullRequest = useCallback(
    (pullRequest: GitHubPullRequest) => {
      setSelectedPullRequest(pullRequest);
      setDiffSource("pr");
      setSelectedDiffPath(null);
      setCenterMode("diff");
      setGitPanelMode("prs");
      setPrefillDraft({
        id: `pr-prefill-${pullRequest.number}-${Date.now()}`,
        text: buildPullRequestDraft(pullRequest),
        createdAt: Date.now(),
      });
      if (isCompact) {
        setActiveTab("git");
      }
    },
    [
      isCompact,
      setActiveTab,
      setCenterMode,
      setDiffSource,
      setGitPanelMode,
      setPrefillDraft,
      setSelectedDiffPath,
      setSelectedPullRequest,
    ],
  );

  const resetPullRequestSelection = useCallback(() => {
    setDiffSource("local");
    setSelectedPullRequest(null);
  }, [setDiffSource, setSelectedPullRequest]);

  const handleSendPullRequestQuestion = useCallback(
    async (
      text: string,
      images: string[] = [],
      appMentions: AppMention[] = [],
      submitIntent?: ComposerSendIntent,
    ) => {
      if (pullRequestReviewLaunching) {
        return;
      }
      const trimmed = text.trim();
      const reviewCommand = parsePullRequestReviewCommand(trimmed);
      if (reviewCommand) {
        const reviewThreadId = await runPullRequestReview({
          intent: reviewCommand.intent,
          question: reviewCommand.question,
          images,
          activateThread: true,
        });
        if (reviewThreadId) {
          clearActiveImages();
        }
        return;
      }
      if (KNOWN_SLASH_COMMAND_REGEX.test(trimmed)) {
        if (appMentions.length > 0) {
          await handleSend(trimmed, images, appMentions, submitIntent);
        } else {
          await handleSend(trimmed, images, undefined, submitIntent);
        }
        return;
      }
      if (!activeWorkspace || !selectedPullRequest) {
        return;
      }
      if (!trimmed && images.length === 0) {
        return;
      }
      const reviewThreadId = await runPullRequestReview({
        intent: "question",
        question: trimmed,
        images,
        activateThread: true,
      });
      if (reviewThreadId) {
        clearActiveImages();
      }
    },
    [
      activeWorkspace,
      clearActiveImages,
      handleSend,
      selectedPullRequest,
      pullRequestReviewLaunching,
      runPullRequestReview,
    ],
  );

  const composerContextActions = useMemo<ComposerContextAction[]>(() => {
    if (isPullRequestComposer && activeWorkspace && selectedPullRequest) {
      return pullRequestReviewActions.map((action) => {
        const actionLabel = resolveReviewActionLabel(action);
        return {
          id: action.id,
          label: actionLabel,
          title: t("gitDiff.reviewActions.forPullRequest", {
            action: actionLabel,
            number: selectedPullRequest.number,
          }),
          disabled: pullRequestReviewLaunching,
          onSelect: async () => {
            const reviewThreadId = await runPullRequestReview({
              intent: action.intent,
              activateThread: true,
            });
            if (reviewThreadId) {
              clearActiveImages();
            }
          },
        };
      });
    }

    if (isCommitComposer && activeWorkspace && selectedCommit) {
      const shortSha = selectedCommit.sha.slice(0, 7);
      const summary = selectedCommit.summary.replace(/\s+/g, " ").trim();
      const reviewCommand = summary
        ? `/review commit ${selectedCommit.sha} ${summary}`
        : `/review commit ${selectedCommit.sha}`;
      return [
        {
          id: "commit-review",
          label: t("gitDiff.reviewActions.reviewCommit"),
          title: t("gitDiff.reviewActions.reviewCommitTitle", { sha: shortSha }),
          onSelect: async () => {
            await startReview(reviewCommand);
          },
        },
      ];
    }

    return [];
  }, [
    activeWorkspace,
    clearActiveImages,
    isCommitComposer,
    isPullRequestComposer,
    pullRequestReviewLaunching,
    pullRequestReviewActions,
    resolveReviewActionLabel,
    runPullRequestReview,
    selectedCommit,
    selectedPullRequest,
    startReview,
    t,
  ]);

  const composerSendLabel = isPullRequestComposer
    ? t("gitDiff.reviewActions.askPullRequest")
    : undefined;
  const handleComposerSend = isPullRequestComposer
    ? handleSendPullRequestQuestion
    : handleSend;

  return {
    handleSelectPullRequest,
    resetPullRequestSelection,
    isPullRequestComposer,
    composerContextActions,
    composerSendLabel,
    handleComposerSend,
  };
}
