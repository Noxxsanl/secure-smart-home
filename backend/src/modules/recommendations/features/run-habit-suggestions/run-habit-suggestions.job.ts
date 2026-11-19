// Worker gợi ý thói quen: lần đầu sau 60 s, rồi mỗi 6 giờ. Logic quét ở run-habit-suggestions.handler.ts.
import { runHabitSuggestionsOnce } from "./run-habit-suggestions.handler";

const FIRST_RUN_DELAY_MS = 60_000;
const RUN_INTERVAL_MS = 6 * 3600 * 1000;

let started = false;

export function startHabitSuggestionJob(): void {
  if (started) return;
  started = true;
  const first = setTimeout(() => {
    void runHabitSuggestionsOnce();
    const timer = setInterval(() => void runHabitSuggestionsOnce(), RUN_INTERVAL_MS);
    timer.unref();
  }, FIRST_RUN_DELAY_MS);
  first.unref();
}
