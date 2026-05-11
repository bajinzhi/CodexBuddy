import type { ApprovalRequest, RequestUserInputRequest } from "@/types";
import { PetOverlay } from "@/features/pets/components/PetOverlay";
import {
  usePetRuntimeState,
  type ThreadStatusLookup,
} from "@/features/pets/hooks/usePetRuntimeState";

type PetOverlayControllerProps = {
  selectedPetId: string | null;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusLookup;
  approvals: ApprovalRequest[];
  userInputRequests: RequestUserInputRequest[];
  onVisibleChange: (visible: boolean) => void;
};

export function PetOverlayController({
  selectedPetId,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  approvals,
  userInputRequests,
  onVisibleChange,
}: PetOverlayControllerProps) {
  const runtimeState = usePetRuntimeState({
    activeWorkspaceId,
    activeThreadId,
    threadStatusById,
    approvals,
    userInputRequests,
  });

  return (
    <PetOverlay
      visible
      selectedPetId={selectedPetId}
      runtimeState={runtimeState}
      onVisibleChange={onVisibleChange}
    />
  );
}
