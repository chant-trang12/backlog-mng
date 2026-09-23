// Quản lý User + Phân quyền — 3 role cố định, KHÔNG phải free-form:
// - admin: toàn quyền, gồm cả quản lý User (nâng/hạ quyền, khóa/mở tài khoản).
// - editor: CRUD dữ liệu nghiệp vụ bình thường (task, nhân sự, tiêu chí...)
//   nhưng không vào được Quản lý User.
// - viewer: chỉ xem (read-only) — mọi request ghi (POST/PUT/PATCH/DELETE)
//   tới /api bị chặn ở middleware (xem requireWrite trong auth.middleware.ts).
// Role chỉ thực sự được ÁP DỤNG khi SSO_ENABLED=true — tắt SSO (mặc định ở
// dev/test) thì mọi request đi qua thẳng, giống hành vi requireAuth hiện có.
export type AppRole = "admin" | "editor" | "viewer";

export const APP_ROLES: AppRole[] = ["admin", "editor", "viewer"];

export interface AppUser {
  id: number;
  sso_sub: string;
  username: string;
  name: string;
  email: string | null;
  role: AppRole;
  active: boolean;
  // Phòng ban chủ quản (Quy tắc 9.2) — NULL = chưa gán, gán tay bởi Admin.
  department_id: number | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateAppUserInput {
  role?: AppRole;
  active?: boolean;
  // Phòng ban chủ quản (Quy tắc 9.2) — null để gỡ gán.
  department_id?: number | null;
}
