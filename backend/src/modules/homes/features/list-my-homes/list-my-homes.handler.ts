// GET /homes — nhà tôi là thành viên hiệu lực + vai trò + bộ đếm. Logic nằm ở domain/my-homes (dùng chung với
// accept-invitation).
import { listMyHomes as listHomesOfUser } from "../../domain/my-homes";
import type { MyHome } from "../../domain/my-home.types";

export async function listMyHomes(userId: number): Promise<MyHome[]> {
  return listHomesOfUser(userId);
}
