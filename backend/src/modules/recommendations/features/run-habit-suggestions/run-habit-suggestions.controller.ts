import type { Request, Response } from "express";
import { runHabitSuggestionsOnce } from "./run-habit-suggestions.handler";

export async function runHabitSuggestionsController(_req: Request, res: Response): Promise<void> {
  res.json(await runHabitSuggestionsOnce());
}
