import type { Customer } from "@shh/api-client/dashboard";

/** Trạng thái hộp thoại "Gán quyền sở hữu" do `api/useAssignOwner` trả về. */
export type AssignOwnerState = {
  search: string;
  changeSearch: (value: string) => void;
  /** Chuỗi tìm đã debounce + trim; chỉ tìm khi từ 2 ký tự. */
  query: string;
  results: Customer[];
  searchError: unknown;
  isSearching: boolean;
  selected: Customer | null;
  select: (customer: Customer) => void;
  submitting: boolean;
  error: string;
  confirm: () => void;
};
