// Module homes: nhà, phòng, thành viên/lời mời, quyền theo nhà (RBAC tầng 2), grant của Operator,
// KIT + mã kích hoạt + claim (provisioning). Sở hữu smart_homes, rooms, smart_home_members, member_device_access,
// operator_home_access, activation_tokens, activation_logs.
//
// Bảng route (đường dẫn đầy đủ = tiền tố kênh + path):
//   dashboard  /api/dashboard/smart-homes/**, /api/dashboard/operator-access/**   (cookie, ADMIN/OPERATOR)
//   customer   /api/portal/** và /api/mobile/**                                    (cùng handler cho 2 kênh)
// Thứ tự customer: nhà/phòng → thành viên/lời mời → claim (giữ như router cũ).
import { Router } from "express";
import type { AppModule } from "../../shared/module";
import { acceptInvitationController } from "./features/accept-invitation/accept-invitation.controller";
import { assignOwnerController } from "./features/assign-owner/assign-owner.controller";
import { claimHomeController } from "./features/claim-home/claim-home.controller";
import { createSmartHomeController } from "./features/create-smart-home/create-smart-home.controller";
import { declineInvitationController } from "./features/decline-invitation/decline-invitation.controller";
import { getHomeOverviewController } from "./features/get-home-overview/get-home-overview.controller";
import { getRoomController } from "./features/get-room/get-room.controller";
import { getSmartHomeDetailController } from "./features/get-smart-home-detail/get-smart-home-detail.controller";
import { grantOperatorAccessController } from "./features/grant-operator-access/grant-operator-access.controller";
import { inviteMemberController } from "./features/invite-member/invite-member.controller";
import { issueActivationCodeController } from "./features/issue-activation-code/issue-activation-code.controller";
import { leaveHomeController } from "./features/leave-home/leave-home.controller";
import { listInvitationsController } from "./features/list-invitations/list-invitations.controller";
import { listMembersController } from "./features/list-members/list-members.controller";
import { listMyHomesController } from "./features/list-my-homes/list-my-homes.controller";
import { listOperatorGrantsController } from "./features/list-operator-grants/list-operator-grants.controller";
import { listSmartHomesController } from "./features/list-smart-homes/list-smart-homes.controller";
import { removeMemberController } from "./features/remove-member/remove-member.controller";
import { renameRoomController } from "./features/rename-room/rename-room.controller";
import { requestHomeAccessController } from "./features/request-home-access/request-home-access.controller";
import { revokeActivationCodesController } from "./features/revoke-activation-codes/revoke-activation-codes.controller";
import { revokeOperatorGrantController } from "./features/revoke-operator-grant/revoke-operator-grant.controller";
import { updateHomeController } from "./features/update-home/update-home.controller";
import { updateMemberController } from "./features/update-member/update-member.controller";
import { updateSmartHomeController } from "./features/update-smart-home/update-smart-home.controller";

export const homesModule: AppModule = {
  name: "homes",
  dashboard: (router) => {
    const smartHomes = Router();
    smartHomes.get("/", listSmartHomesController);
    smartHomes.post("/", createSmartHomeController);
    smartHomes.get("/:id", getSmartHomeDetailController);
    smartHomes.patch("/:id", updateSmartHomeController);
    smartHomes.post("/:id/assign-owner", assignOwnerController);
    smartHomes.post("/:id/activation-codes", issueActivationCodeController);
    smartHomes.post("/:id/activation-codes/revoke", revokeActivationCodesController);
    smartHomes.post("/:id/access-requests", requestHomeAccessController);
    router.use("/smart-homes", smartHomes);

    const operatorAccess = Router();
    operatorAccess.get("/", listOperatorGrantsController);
    operatorAccess.post("/", grantOperatorAccessController);
    operatorAccess.post("/:id/revoke", revokeOperatorGrantController);
    router.use("/operator-access", operatorAccess);
  },
  customer: (router) => {
    // Nhà / phòng
    router.get("/homes", listMyHomesController);
    router.get("/homes/:homeId/overview", getHomeOverviewController);
    router.patch("/homes/:homeId", updateHomeController);
    router.get("/rooms/:roomId", getRoomController);
    router.patch("/rooms/:roomId", renameRoomController);

    // Thành viên & lời mời
    router.get("/homes/:homeId/members", listMembersController);
    router.post("/homes/:homeId/members/invite", inviteMemberController);
    router.patch("/members/:memberId", updateMemberController);
    router.delete("/members/:memberId", removeMemberController);
    router.post("/homes/:homeId/leave", leaveHomeController);
    router.get("/invitations", listInvitationsController);
    router.post("/invitations/:id/accept", acceptInvitationController);
    router.post("/invitations/:id/decline", declineInvitationController);

    // Claim nhà bằng mã/QR
    router.post("/claim", claimHomeController);
  },
};
