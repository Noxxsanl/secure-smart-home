// GET /operator-access — danh sách grant của Operator (FR-9.6).
import type { AuthContext } from "../../../../core/auth/auth-context";
import type { OperatorAccessGrant } from "../../domain/console-home.types";
import { listGrants } from "../../infrastructure/operator-access.read-model";

export async function listOperatorGrants(auth: AuthContext): Promise<OperatorAccessGrant[]> {
  // ADMIN thấy tất cả; OPERATOR chỉ thấy grant của chính mình
  return listGrants({ operatorId: auth.role === "admin" ? undefined : auth.userId, limit: 200 });
}
