import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

// During development, when the mock endpoints change, swap them into the running worker.
// Without this, an open tab keeps the endpoints it started with, and new ones answer 404.
if (import.meta.hot) {
  import.meta.hot.accept("./handlers", (updated) => {
    if (updated) worker.resetHandlers(...(updated.handlers as typeof handlers));
  });
}
