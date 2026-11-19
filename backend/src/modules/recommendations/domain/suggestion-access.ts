// Policy phản hồi gợi ý — dùng chung cho accept-suggestion và dismiss-suggestion.
// Quyền = create_automation (chấp nhận gợi ý tạo ra một rule); nhà suspended → 409 HOME_SUSPENDED.
import type { AuthContext } from "../../../core/auth/auth-context";
import { notFound } from "../../../shared/errors/http-error";
import { assertHomeWritable, requireHomeMember } from "../../homes";
import type { HomeAccess } from "../../homes";
import { getSuggestion } from "../infrastructure/suggestions.read-model";
import type { SuggestionRow } from "./suggestion.types";

export async function loadForResponse(auth: AuthContext, id: number): Promise<{ row: SuggestionRow; homeName: string; permissions: HomeAccess }> {
  const row = await getSuggestion(id);
  if (!row) throw notFound("Suggestion not found");
  const access = await requireHomeMember(auth, row.home_id, "create_automation");
  assertHomeWritable(access.home);
  return { row, homeName: access.home.name, permissions: access };
}
