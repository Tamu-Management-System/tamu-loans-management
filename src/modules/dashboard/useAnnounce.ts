import { ApiError } from "../../api/client";
import { useUndoTask } from "../../api/worklist";
import { useToast } from "../../components/ui/Toast";

/** Confirmation toast; offers Undo when the change is tied to a worklist task. */
export function useAnnounce() {
  const showToast = useToast();
  const undoTask = useUndoTask();
  return (message: string, undoTaskId?: string | null) =>
    showToast({
      message,
      action: undoTaskId
        ? {
            label: "Undo",
            onClick: () =>
              undoTask.mutate(undoTaskId, {
                onSuccess: () => showToast({ message: "Undone" }),
                onError: (error) => showToast({ message: error instanceof ApiError ? error.message : "That couldn't be undone." }),
              }),
          }
        : undefined,
    });
}
