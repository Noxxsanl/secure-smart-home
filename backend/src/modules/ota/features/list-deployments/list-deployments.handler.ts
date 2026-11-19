// Danh sách đợt triển khai OTA (FR-9.4): 100 đợt gần nhất. Operator thấy mọi đợt (theo dõi tiến độ đội thiết bị),
// nhưng tên nhà đích bị che (null) khi nhà đã claim mà Operator chưa có grant (FR-9.6) — giống danh sách thiết bị console.
import type { AuthContext } from "../../../../core/auth/auth-context";
import { canSeeCustomerData, loadStaffScope } from "../../../homes";
import type { OtaDeployment } from "../../domain/ota.types";
import { listDeploymentsWithHomeStatus } from "../../infrastructure/ota.read-model";

export async function listOtaDeployments(auth: AuthContext): Promise<OtaDeployment[]> {
  const [scope, rows] = await Promise.all([loadStaffScope(auth), listDeploymentsWithHomeStatus({ limit: 100 })]);
  return rows.map(({ deployment, homeStatus }) =>
    canSeeCustomerData(scope, { id: deployment.target_home_id, status: homeStatus })
      ? deployment
      : { ...deployment, target_home_name: null }
  );
}
