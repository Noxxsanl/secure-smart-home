"use client";

import { useState } from "react";
import { errorMessage, useCustomerSearch } from "@shh/api-client/dashboard";
import type { Customer, SmartHomeDetailHome } from "@shh/api-client/dashboard";
import { useDebouncedValue } from "@shh/utils";
import { assignOwner } from "./smartHomes.api";
import type { AssignOwnerState } from "../model/assignOwner";

export type AssignOwnerOptions = {
  homeId: number;
  /** Gợi ý ô tìm kiếm (VD tên chủ dự kiến nhập lúc tạo nhà). */
  initialQuery?: string;
  onClose: () => void;
  onAssigned: (customer: Customer, home: SmartHomeDetailHome) => void;
};

// Operator tra cứu khách hàng (GET /customers?q= — tên, user_tag, email, SĐT)
// rồi gán quyền sở hữu (POST /smart-homes/:id/assign-owner { user_tag }) — luồng
// bổ sung cho việc khách tự quét QR. Backend xử lý như một lượt claim trong 1
// transaction, thu hồi mã chưa dùng và ghi activation_logs (operator_assign).
export function useAssignOwner({ homeId, initialQuery = "", onClose, onAssigned }: AssignOwnerOptions): AssignOwnerState {
  const [search, setSearch] = useState(initialQuery);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const query = useDebouncedValue(search.trim(), 300);
  const { data: results, error: searchError, isLoading } = useCustomerSearch(query);

  async function confirm() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const home = await assignOwner(homeId, selected.user_tag);
      onAssigned(selected, home);
      onClose();
    } catch (err) {
      setError(errorMessage(err, {
        ALREADY_CLAIMED: "Nhà này vừa được kích hoạt (khách tự quét mã hoặc đã được gán). Đóng hộp thoại và tải lại trang để xem chủ nhà hiện tại.",
        NOT_FOUND: "Không tìm thấy Smart Home này nữa. Tải lại danh sách rồi thử lại.",
      }));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    search,
    changeSearch: (value) => { setSearch(value); setSelected(null); setError(""); },
    query,
    results: results ?? [],
    searchError,
    isSearching: isLoading,
    selected,
    select: (customer) => { setSelected(customer); setError(""); },
    submitting,
    error,
    confirm: () => void confirm(),
  };
}
