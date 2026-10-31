import { MembersPage, MyInvitations } from "@shh/homes";

// Thành viên của nhà đang chọn + lời mời đang chờ của chính tôi (hai feature của @shh/homes).
export default function Page() {
  return <MembersPage invitationsSlot={<MyInvitations />} />;
}
