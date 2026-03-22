import { translate } from "@/i18n/translate";

const PLAN_READY_TAG_PREFIX = "[[cm_plan_ready:";

export function isPlanReadyTaggedMessage(text: string) {
  return text.trimStart().startsWith(PLAN_READY_TAG_PREFIX);
}

export function makePlanReadyAcceptMessage() {
  return `${PLAN_READY_TAG_PREFIX}accept]] ${translate("planReadyFollowup.acceptMessage", {
    ns: "app",
  })}`;
}

export function makePlanReadyChangesMessage(changes: string) {
  const trimmed = changes.trim();
  return `${PLAN_READY_TAG_PREFIX}changes]] ${translate("planReadyFollowup.changesMessagePrefix", {
    ns: "app",
  })}\n\n${trimmed}`;
}
