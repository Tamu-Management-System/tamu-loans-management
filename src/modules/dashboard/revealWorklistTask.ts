const HIGHLIGHT_MS = 1800;
/** A tab change re-renders the list, replacing the rows; wait for that before highlighting. */
const RENDER_WAIT_MS = 120;

/**
 * Scrolls to a task in "Today's worklist" and briefly highlights it. Done tasks live in the
 * collapsed "Done today" list, which is opened first. Call after the worklist shows the
 * task's tab, so the row is on the page.
 */
export function revealWorklistTask(taskId: string) {
  window.setTimeout(() => {
    let element = document.getElementById(`task-${taskId}`);
    if (!element) {
      element = document.getElementById(`done-task-${taskId}`);
      element?.closest("details")?.setAttribute("open", "");
    }
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.dataset.highlighted = "true";
    window.setTimeout(() => element && delete element.dataset.highlighted, HIGHLIGHT_MS);
  }, RENDER_WAIT_MS);
}
