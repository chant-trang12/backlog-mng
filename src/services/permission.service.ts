import { db } from "../db/database.js";
import type { AppRole } from "../types/user.js";

// 7 "Chức năng" cho phép cấu hình quyền qua UI (Cấu hình → Phân quyền) —
// khớp 1-1 với "module" mà resolveModuleAndAction() (actionLog.middleware.ts)
// suy ra từ path, TRỪ "nhiem_vu_cham_diem" (route riêng PUT /tasks/:id/grade,
// tách khỏi "nhiem_vu" ngay trong requireWrite — xem auth.middleware.ts).
// Cố ý KHÔNG gồm Cấu hình/Quản lý User/Nhật ký hoạt động (vẫn admin-only
// tuyệt đối qua requireAdmin, không cấu hình được) và Trang chủ (không có
// thao tác ghi nào).
export const PERMISSION_FUNCTIONS = [
  {
    key: "nhiem_vu",
    label: "Nhiệm vụ",
    desc: "CRUD Nhiệm vụ (Backlog), Nhân sự tham gia, Việc (task con), cập nhật tiến độ.",
  },
  {
    key: "nhiem_vu_cham_diem",
    label: "Nhiệm vụ — Chấm điểm",
    desc: 'Nút "Chấm điểm" (% Đánh giá + Nội dung đánh giá) — tách quyền riêng với phần còn lại của Nhiệm vụ.',
  },
  {
    key: "team_nhan_su",
    label: "Team & Nhân sự",
    desc: "Nhân sự, Tuân thủ, Nội quy, Đào tạo, Hỗ trợ, Đánh giá, Chấm công; Hạ KI/Tăng KI/Trừ điểm cá nhân.",
  },
  {
    key: "cskh",
    label: "CSKH",
    desc: "Sự cố, Nhân sự liên quan sự cố, Hỗ trợ ticket, Tỷ lệ khởi tạo.",
  },
  {
    key: "roadmap",
    label: "Roadmap năm",
    desc: "Danh sách roadmap theo năm + chi tiết công việc theo tháng.",
  },
  {
    key: "yeu_cau_tinh_nang",
    label: "Yêu cầu tính năng",
    desc: "Hộp thư đề xuất dùng chung mọi phòng ban — Duyệt/Từ chối/Đưa vào Backlog/Roadmap.",
  },
  {
    key: "quan_ly_tinh_nang_so_hoa",
    label: "Quản lý tính năng số hoá",
    desc: "Danh mục tính năng số hoá + 4 bảng con (Màn hình, Tích hợp, Đối tượng dữ liệu, Dữ liệu chủ).",
  },
] as const;
export type PermissionFunctionKey = (typeof PERMISSION_FUNCTIONS)[number]["key"];
const FUNCTION_KEYS = new Set<string>(PERMISSION_FUNCTIONS.map((f) => f.key));

// 3 role cấu hình được qua màn này — "admin" luôn toàn quyền (bypass trước
// khi requireWrite tra bảng, xem auth.middleware.ts), không có dòng riêng.
export const PERMISSION_ROLES: AppRole[] = ["editor", "bgd", "viewer"];

export interface RolePermissionRow {
  function_key: string;
  role: string;
  can_read: boolean;
  can_add: boolean;
  can_edit: boolean;
}

// Trả ĐỦ function_key × role (kể cả thiếu dòng trong DB — mặc định
// false/false/false, can_read=true) để FE luôn vẽ đủ lưới, không cần tự
// lo "ô trống". Chuẩn hóa boolean (SQLite trả 0/1).
export async function getPermissionMatrix(): Promise<RolePermissionRow[]> {
  const rows = await db("role_permissions").select("function_key", "role", "can_read", "can_add", "can_edit");
  const byKey = new Map<string, RolePermissionRow>();
  for (const r of rows as any[]) {
    byKey.set(`${r.function_key}:${r.role}`, {
      function_key: r.function_key,
      role: r.role,
      can_read: !!r.can_read,
      can_add: !!r.can_add,
      can_edit: !!r.can_edit,
    });
  }
  const full: RolePermissionRow[] = [];
  for (const fn of PERMISSION_FUNCTIONS) {
    for (const role of PERMISSION_ROLES) {
      full.push(byKey.get(`${fn.key}:${role}`) ?? { function_key: fn.key, role, can_read: true, can_add: false, can_edit: false });
    }
  }
  return full;
}

// Tra 1 ô (function_key × role) — dùng ở requireWrite (auth.middleware.ts),
// chạy trên MỌI request ghi nên chỉ SELECT đúng 1 dòng theo unique index,
// không kéo cả bảng như getPermissionMatrix(). Role không nằm trong
// PERMISSION_ROLES (VD "admin") hoặc function_key lạ -> null, nơi gọi tự
// quyết định hành vi mặc định (admin bypass trước khi gọi tới đây rồi).
export async function getRolePermission(
  functionKey: string,
  role: string,
): Promise<{ can_read: boolean; can_add: boolean; can_edit: boolean } | null> {
  if (!FUNCTION_KEYS.has(functionKey) || !PERMISSION_ROLES.includes(role as AppRole)) return null;
  const row = await db("role_permissions").where({ function_key: functionKey, role }).first();
  if (!row) return { can_read: true, can_add: false, can_edit: false }; // seed thiếu dòng -> mặc định an toàn
  return { can_read: !!row.can_read, can_add: !!row.can_add, can_edit: !!row.can_edit };
}

export class InvalidPermissionTargetError extends Error {}

// Update 1 ô (function_key × role) — upsert (dòng có thể chưa tồn tại nếu
// DB cũ hơn danh sách PERMISSION_FUNCTIONS, VD thêm chức năng mới sau này
// mà chưa kịp chạy lại migration seed).
export async function updateRolePermission(
  functionKey: string,
  role: string,
  input: { can_read?: boolean; can_add?: boolean; can_edit?: boolean },
): Promise<RolePermissionRow> {
  if (!FUNCTION_KEYS.has(functionKey)) {
    throw new InvalidPermissionTargetError(`Chức năng "${functionKey}" không hợp lệ hoặc không cho cấu hình quyền.`);
  }
  if (!PERMISSION_ROLES.includes(role as AppRole)) {
    throw new InvalidPermissionTargetError(`Role "${role}" không hợp lệ hoặc không cấu hình được ở màn này (chỉ editor/bgd/viewer).`);
  }

  const existing = await db("role_permissions").where({ function_key: functionKey, role }).first();
  const next = {
    can_read: input.can_read ?? (existing ? !!existing.can_read : true),
    can_add: input.can_add ?? (existing ? !!existing.can_add : false),
    can_edit: input.can_edit ?? (existing ? !!existing.can_edit : false),
  };
  if (existing) {
    await db("role_permissions").where({ id: existing.id }).update({ ...next, updated_at: db.fn.now() });
  } else {
    await db("role_permissions").insert({ function_key: functionKey, role, ...next });
  }
  return { function_key: functionKey, role, ...next };
}
