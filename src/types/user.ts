// Quản lý User + Phân quyền — 5 role cố định, KHÔNG phải free-form:
// - admin: toàn quyền tuyệt đối, gồm cả Cấu hình (Tiêu chí/Ranking team/
//   Phòng ban/Danh mục/Quản lý User/Phân quyền) và Quản lý User (nâng/hạ
//   quyền, khóa/mở tài khoản).
// - subadmin: GIỐNG admin ở mọi chỗ khác (toàn quyền ghi dữ liệu nghiệp
//   vụ, chấm điểm, Nhật ký hoạt động, bulk-delete-selected...) NHƯNG
//   KHÔNG được vào màn hình Cấu hình (TẤT CẢ các tab: Tiêu chí, Ranking
//   team, Cấu hình [Tag/Phân loại...], Phòng ban, Quản lý User, Phân
//   quyền) — xem requireAdmin (chỉ admin) vs requireAdminOrSubAdmin
//   (admin + subadmin) ở auth.middleware.ts.
// - editor: CRUD dữ liệu nghiệp vụ bình thường (task, nhân sự, tiêu chí...)
//   nhưng không vào được Quản lý User, KHÔNG được xóa (Quy tắc 9.1), KHÔNG
//   được thao tác nút Chấm điểm (PUT /tasks/:id/grade — chỉ admin/bgd).
// - bgd (Ban Giám Đốc): CÙNG quyền ghi với editor (CRUD dữ liệu nghiệp vụ
//   bình thường, không xóa) CỘNG THÊM được phép chấm điểm (PUT
//   /tasks/:id/grade) — coi như "editor + chấm điểm". Xem requireWrite
//   bên dưới (auth.middleware.ts).
// - viewer: chỉ xem (read-only) — mọi request ghi (POST/PUT/PATCH/DELETE)
//   tới /api bị chặn ở middleware (xem requireWrite trong auth.middleware.ts).
// Role chỉ thực sự được ÁP DỤNG khi SSO_ENABLED=true — tắt SSO (mặc định ở
// dev/test) thì mọi request đi qua thẳng, giống hành vi requireAuth hiện có.
export type AppRole = "admin" | "subadmin" | "editor" | "bgd" | "viewer";

export const APP_ROLES: AppRole[] = ["admin", "subadmin", "editor", "bgd", "viewer"];

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
