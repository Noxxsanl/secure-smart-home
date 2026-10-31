// Danh sách gợi ý thói quen của nhà (FR-7.5). Quyền xem = view_automation (GUEST 403).
import type { AuthContext } from "../../../../core/auth/auth-context";
import { requireHomeMember } from "../../../homes";
import { toSuggestion } from "../../domain/suggestion.mapper";
import type { HabitSuggestion } from "../../domain/suggestion.types";
import { listSuggestions } from "../../infrastructure/suggestions.read-model";

export async function listHomeSuggestions(auth: AuthContext, homeId: number): Promise<HabitSuggestion[]> {
  await requireHomeMember(auth, homeId, "view_automation");
  return (await listSuggestions(homeId)).map(toSuggestion);
}
