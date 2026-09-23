import type { AppUser } from "../types/user.js";
import { getDepartment } from "./department.service.js";
import { db } from "../db/database.js";

// Quy tắc 9.2 — phạm vi xem/ghi dữ liệu theo phòng ban, tính 1 lần ngay sau
// requireAuth (xem attachScope ở auth.middleware.ts) rồi dùng lại ở mọi
// controller/service cần lọc theo phòng ban. KHÔNG tự viết lại điều kiện lọc
// ở từng nơi — chỉ cần sót 1 endpoint là rò rỉ dữ liệu.
//
// - all=true: không giới hạn (admin, hoặc phòng ban đang gán có
//   is_full_access=true). departmentId khi đó có thể null hoặc có giá trị,
//   không có ý nghĩa lọc.
// - all=false, departmentId=number: chỉ thấy/ghi được đúng phòng đó.
// - all=false, departmentId=null: KHÔNG thấy/ghi được gì (chưa gán phòng ban).
export interface DataScope {
  all: boolean;
  departmentId: number | null;
}

// SSO tắt -> không có req.appUser -> không giới hạn gì (giữ nguyên hành vi
// dev/test hiện có). Có req.appUser -> admin luôn scope=ALL; role khác tùy
// theo department_id của chính họ + is_full_access của phòng đó.
export async function computeScope(appUser: AppUser | undefined): Promise<DataScope> {
  if (!appUser) return { all: true, departmentId: null };
  if (appUser.role === "admin") return { all: true, departmentId: null };
  if (appUser.department_id == null) return { all: false, departmentId: null };
  const department = await getDepartment(appUser.department_id);
  return { all: !!department?.is_full_access, departmentId: appUser.department_id };
}

// Dùng cho các endpoint GET danh sách: quy ra department_id thực sự sẽ lọc,
// dựa trên phạm vi của người gọi + department_id client yêu cầu (VD bộ lọc
// phòng ban trên giao diện — có thể null nếu client không lọc gì).
// - scope.all=true: tôn trọng lựa chọn của client (giữ đúng hành vi cũ).
// - scope bị giới hạn 1 phòng: LUÔN ép về đúng phòng đó, bỏ qua yêu cầu của
//   client — trừ khi client xin đúng 1 phòng KHÁC phạm vi, khi đó trả rỗng
//   (không phải lỗi — GET không nên 403, chỉ đơn giản không có gì để xem).
// - scope=NONE (chưa gán phòng ban): luôn trả rỗng.
export function resolveListDepartmentId(
  scope: DataScope,
  requestedDepartmentId: number | null,
): number | null | typeof SCOPE_EMPTY {
  if (scope.all) return requestedDepartmentId;
  if (scope.departmentId == null) return SCOPE_EMPTY;
  if (requestedDepartmentId != null && requestedDepartmentId !== scope.departmentId) return SCOPE_EMPTY;
  return scope.departmentId;
}

// Giá trị đặc biệt: phạm vi không cho thấy gì — controller nên trả thẳng
// mảng/kết quả rỗng, KHÔNG gọi xuống service (tránh service hiểu nhầm
// "không lọc gì" khi nhận null).
export const SCOPE_EMPTY = Symbol("SCOPE_EMPTY");

// Dùng cho các endpoint ghi (POST/PUT/PATCH/DELETE) — Quy tắc 5.1 phương án
// A: chỉ ghi được bản ghi có department_id nằm trong phạm vi xem của chính
// mình. departmentId=null (bản ghi cũ/chưa gán phòng) bị coi là ngoài phạm
// vi đối với role bị giới hạn — không có ngoại lệ "mồ côi cho ai cũng sửa
// được", tránh lỗ hổng ngầm.
export function isDepartmentInScope(scope: DataScope, departmentId: number | null): boolean {
  if (scope.all) return true;
  if (scope.departmentId == null) return false;
  return departmentId === scope.departmentId;
}

// Tra department_id "đóng băng" tại thời điểm tạo bản ghi — dùng ở các
// service tạo bản ghi theo team_id/member_id nhưng KHÔNG có sẵn department_id
// trực tiếp trong input (CSKH, Chấm điểm...).
export async function departmentIdFromTeamId(teamId: number): Promise<number | null> {
  const team = await db("teams").where({ id: teamId }).first();
  return (team as any)?.department_id ?? null;
}

export async function departmentIdFromMemberId(memberId: number): Promise<number | null> {
  const member = await db("members").where({ id: memberId }).first();
  return (member as any)?.department_id ?? null;
}

export async function departmentIdFromTaskId(taskId: number): Promise<number | null> {
  const task = await db("tasks").where({ id: taskId }).first();
  return (task as any)?.department_id ?? null;
}

export class ScopeForbiddenError extends Error {
  constructor(message = "Bạn không có quyền thao tác trên dữ liệu của phòng ban này.") {
    super(message);
    this.name = "ScopeForbiddenError";
  }
}

// Ném lỗi 403 nếu departmentId nằm ngoài phạm vi — dùng ở service ngay
// trước khi ghi (create/update/delete), controller bắt ScopeForbiddenError
// và trả 403 (xem asHttpError bên dưới hoặc middleware lỗi chung).
export function assertDepartmentInScope(scope: DataScope, departmentId: number | null): void {
  if (!isDepartmentInScope(scope, departmentId)) {
    throw new ScopeForbiddenError();
  }
}
