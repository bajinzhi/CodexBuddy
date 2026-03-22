import { translate } from "@/i18n/translate";
import { DebugPanel } from "../../../debug/components/DebugPanel";
import { PlanPanel } from "../../../plan/components/PlanPanel";
import { TerminalDock } from "../../../terminal/components/TerminalDock";
import { TerminalPanel } from "../../../terminal/components/TerminalPanel";
import type {
  LayoutNodesResult,
  LayoutSecondarySurface,
} from "./types";

export type SecondaryLayoutNodesOptions = LayoutSecondarySurface;

type SecondaryLayoutNodes = Pick<
  LayoutNodesResult,
  | "planPanelNode"
  | "debugPanelNode"
  | "debugPanelFullNode"
  | "terminalDockNode"
  | "compactEmptyCodexNode"
  | "compactEmptyGitNode"
  | "compactGitBackNode"
>;

export function buildSecondaryNodes(options: SecondaryLayoutNodesOptions): SecondaryLayoutNodes {
  const planPanelNode = <PlanPanel {...options.planPanelProps} />;

  const terminalPanelNode = options.terminalState ? (
    <TerminalPanel
      containerRef={options.terminalState.containerRef}
      status={options.terminalState.status}
      message={options.terminalState.message}
    />
  ) : null;

  const terminalDockNode = (
    <TerminalDock
      {...options.terminalDockProps}
      terminalNode={terminalPanelNode}
    />
  );

  const debugPanelNode = <DebugPanel {...options.debugPanelProps} />;

  const debugPanelFullNode = (
    <DebugPanel
      {...options.debugPanelProps}
      isOpen
      variant="full"
    />
  );

  const compactEmptyCodexNode = (
    <div className="compact-empty">
      <h3>{translate("layout.noWorkspaceSelectedTitle", { ns: "app" })}</h3>
      <p>{translate("layout.chooseProjectToChat", { ns: "app" })}</p>
      <button className="ghost" onClick={options.compactNavProps.onGoProjects}>
        {translate("layout.goToProjects", { ns: "app" })}
      </button>
    </div>
  );

  const compactEmptyGitNode = (
    <div className="compact-empty">
      <h3>{translate("layout.noWorkspaceSelectedTitle", { ns: "app" })}</h3>
      <p>{translate("layout.selectProjectToDiff", { ns: "app" })}</p>
      <button className="ghost" onClick={options.compactNavProps.onGoProjects}>
        {translate("layout.goToProjects", { ns: "app" })}
      </button>
    </div>
  );

  const compactGitDiffActive =
    options.compactNavProps.centerMode === "diff" &&
    Boolean(options.compactNavProps.selectedDiffPath);
  const compactGitBackNode = (
    <div className="compact-git-back">
      <button
        type="button"
        className={`compact-git-switch-button${compactGitDiffActive ? "" : " active"}`}
        onClick={options.compactNavProps.onBackFromDiff}
      >
        {translate("layout.files", { ns: "app" })}
      </button>
      <button
        type="button"
        className={`compact-git-switch-button${compactGitDiffActive ? " active" : ""}`}
        onClick={options.compactNavProps.onShowSelectedDiff}
        disabled={!options.compactNavProps.hasActiveGitDiffs}
      >
        {translate("layout.diff", { ns: "app" })}
      </button>
    </div>
  );

  return {
    planPanelNode,
    debugPanelNode,
    debugPanelFullNode,
    terminalDockNode,
    compactEmptyCodexNode,
    compactEmptyGitNode,
    compactGitBackNode,
  };
}
