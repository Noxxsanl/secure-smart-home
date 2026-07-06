export type UserRole = "admin" | "operator";

export type User = {
  id: number;
  username: string;
  role: UserRole;
};
