import { db } from "../db/database.js";
import type { AppRole } from "../types/user.js";
import { getPermissionMatrix } from "./permission.service.js";

// Danh mục ĐẦY ĐỦ các mục menu trái (sidebar-nav, index.html) — "menu_key"
// khớp đúng data-page của từng <button class="nav-item">. function_key
// (nếu có) nối sang bảng role_permissions — mục menu đó ẩn/hiện theo
// can_read của Chức năng tương ứng (xem computeHiddenMenuKeysForRole() bên
// dưới). "config"/"action-logs"/"hdsd" KHÔNG có function_key (không cấu
// hình được qua Ma trận phân quyền theo Role — Cấu hình/Nhật ký hoạt động
// vẫn admin/subadmin-only tuyệt đối qua requireAdmin; HDSD luôn mở) nhưng
// VẪN cấu hình ẩn/hiện được theo phòng ban (department_menu_visibility).
export const MENU_ITEMS = [
  { key: "home", label: "Trang chủ", function_key: "trang_chu" },
  { key: "backlog", label: "Nhiệm vụ", function_key: "nhiem_vu" },
  { key: "team", label: "Team & Nhân sự", function_key: "team_nhan_su" },
  { key: "roadmap", label: "Roadmap năm", function_key: "roadmap" },
  { key: "feature-requests", label: "Yêu cầu tính năng", function_key: "yeu_cau_tinh_nang" },
  { key: "digital-features", label: "Tính năng số hoá", function_key: "quan_ly_tinh_nang_so_hoa" },
  { key: "config", label: "Cấu hình", function_key: null },
  { key: "action-logs", label: "Nhật ký hoạt động", function_key: null },
  { key: "hdsd", label: "HDSD", function_key: null },
] as const;
export type MenuKey = (typeof MENU_ITEMS)[number]["key"];
const MENU_KEYS = new Set<string>(MENU_ITEMS.map((m) => m.key));

// Chỉ 3 role cấu hình riêng được (giống PERMISSION_ROLES) — admin/subadmin
// KHÔNG bao giờ bị ẩn menu, bỏ qua cả role_permissions.can_read lẫn
// department_menu_visibility khi tính cho 2 role này (gọi trực tiếp trả
// mảng rỗng ở nơi dùng, xem meHandler — auth.controller.ts).
const DEPT_HIDE_EXEMPT_ROLES = new Set<AppRole>(["admin", "subadmin"]);

// Mục menu bị ẩn vì role_permissions.can_read=false (editor/bgd/viewer) —
// dùng getPermissionMatrix() đã có sẵn (đọc nguyên bảng 1 lần, đủ rẻ vì
// chỉ gọi ở /auth/me, không phải mỗi request API).
export async function computeHiddenMenuKeysByRole(role: AppRole): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (DEPT_HIDE_EXEMPT_ROLES.has(role)) return hidden;
  const matrix = await getPermissionMatrix();
  const canReadByFn = new Map(matrix.filter((r) => r.role === role).map((r) => [r.function_key, r.can_read]));
  for (const item of MENU_ITEMS) {
    if (item.function_key && canReadByFn.get(item.function_key) === false) hidden.add(item.key);
  }
  return hidden;
}

// Mục menu bị ẩn vì department_menu_visibility (is_visible=false) — role
// admin/subadmin hoặc chưa gán phòng ban (departmentId=null) thì bỏ qua
// hoàn toàn (mảng rỗng), KHÔNG tra DB — đúng yêu cầu "trừ admin/sub-admin
// ở bất kỳ phòng ban nào".
export async function computeHiddenMenuKeysByDepartment(role: AppRole, departmentId: number | null): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (DEPT_HIDE_EXEMPT_ROLES.has(role) || departmentId == null) return hidden;
  const rows = await db("department_menu_visibility")
    .where({ department_id: departmentId, is_visible: false })
    .select("menu_key");
  for (const r of rows as any[]) hidden.add(r.menu_key);
  return hidden;
}

// Ma trận ĐẦY ĐỦ department × menu_key (cả ô chưa có dòng trong DB, mặc
// định is_visible=true) — dùng cho UI admin "Phân quyền theo phòng ban".
export interface DepartmentMenuRow {
  department_id: number;
  menu_key: string;
  is_visible: boolean;
}
export async function getDepartmentMenuMatrix(departmentIds: number[]): Promise<DepartmentMenuRow[]> {
  const rows = await db("department_menu_visibility")
    .whereIn("department_id", departmentIds)
    .select("department_id", "menu_key", "is_visible");
  const byKey = new Map<string, boolean>();
  for (const r of rows as any[]) byKey.set(`${r.department_id}:${r.menu_key}`, !!r.is_visible);
  const full: DepartmentMenuRow[] = [];
  for (const deptId of departmentIds) {
    for (const item of MENU_ITEMS) {
      full.push({ department_id: deptId, menu_key: item.key, is_visible: byKey.get(`${deptId}:${item.key}`) ?? true });
    }
  }
  return full;
}

export class InvalidMenuTargetError extends Error {}

export async function setDepartmentMenuVisibility(
  departmentId: number,
  menuKey: string,
  isVisible: boolean,
): Promise<DepartmentMenuRow> {
  if (!MENU_KEYS.has(menuKey)) {
    throw new InvalidMenuTargetError(`Mục menu "${menuKey}" không hợp lệ.`);
  }
  const existing = await db("department_menu_visibility").where({ department_id: departmentId, menu_key: menuKey }).first();
  if (existing) {
    await db("department_menu_visibility").where({ id: existing.id }).update({ is_visible: isVisible, updated_at: db.fn.now() });
  } else {
    await db("department_menu_visibility").insert({ department_id: departmentId, menu_key: menuKey, is_visible: isVisible });
  }
  return { department_id: departmentId, menu_key: menuKey, is_visible: isVisible };
}
