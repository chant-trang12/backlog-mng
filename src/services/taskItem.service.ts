import { db } from "../db/database.js";
import type {
  CreateTaskItemInput,
  CreateTaskItemMemberInput,
  TaskItemMemberWithName,
  TaskItemWithAssignees,
  TreoViecRow,
  UpdateTaskItemInput,
  UpdateTaskItemMemberInput,
} from "../types/backlog.js";
import { assertDepartmentInScope, departmentIdFromTaskId, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";
import { createTaskMember } from "./taskMember.service.js";

const GIO_MOT_MD = 8;

// "YYYY-MM-DD" theo giờ local — dùng cho treo_viec_tu_ngay (giống deadline,
// chỉ cần độ phân giải ngày, không cần giờ phút).
function todayDateString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function loadAssignees(taskItemId: number): Promise<TaskItemMemberWithName[]> {
  const rows = await db("task_item_members")
    .join("members", "task_item_members.member_id", "members.id")
    .where({ "task_item_members.task_item_id": taskItemId, "task_item_members.is_deleted": false })
    .select(
      "task_item_members.id",
      "task_item_members.task_item_id",
      "task_item_members.member_id",
      "task_item_members.gio_cong",
      "task_item_members.ghi_chu",
      "task_item_members.created_at",
      "task_item_members.updated_at",
      "members.name as member_name",
    )
    .orderBy("task_item_members.id", "asc");
  return rows as TaskItemMemberWithName[];
}

function withTotals(item: any, assignees: TaskItemMemberWithName[]): TaskItemWithAssignees {
  const tongGioCong = assignees.reduce((s, a) => s + (a.gio_cong != null ? Number(a.gio_cong) : 0), 0);
  return {
    ...item,
    treo_viec: !!item.treo_viec,
    assignees,
    tong_gio_cong: Math.round(tongGioCong * 100) / 100,
    tong_md: Math.round((tongGioCong / GIO_MOT_MD) * 100) / 100,
  };
}

// % Đánh giá của Task = trung bình cộng diem_danh_gia của các Việc ĐÃ CHẤM
// (bỏ qua Việc chưa chấm, không tính là 0) — chỉ áp dụng khi task còn ít
// nhất 1 Việc có điểm; nếu không còn Việc nào có điểm thì KHÔNG đụng vào
// tasks.cpo_danh_gia (giữ nguyên giá trị cuối, mở lại cho chấm tay bình
// thường ở popup "Chấm điểm" cấp Task — xem updateTaskGradeHandler).
export async function recomputeTaskScoreFromItems(taskId: number, graderName: string | null): Promise<void> {
  const graded = await db("task_items")
    .where({ task_id: taskId, is_deleted: false })
    .whereNotNull("diem_danh_gia")
    .select("diem_danh_gia");
  if (graded.length === 0) return;
  const avg = graded.reduce((s, r: any) => s + Number(r.diem_danh_gia), 0) / graded.length;
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const localTimestamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  await db("tasks")
    .where({ id: taskId })
    .update({
      cpo_danh_gia: Math.round(avg * 100) / 100,
      cpo_graded_at: localTimestamp,
      cpo_graded_by: graderName,
      updated_at: db.fn.now(),
    });
}

// task.cpo_danh_gia hiện đang do >=1 Việc con điều khiển hay không — dùng
// để FE/BE khóa ô chấm điểm thủ công cấp Task (tránh 2 nguồn ghi đè nhau).
export async function taskScoreControlledByItems(taskId: number): Promise<boolean> {
  const row = await db("task_items")
    .where({ task_id: taskId, is_deleted: false })
    .whereNotNull("diem_danh_gia")
    .first();
  return !!row;
}

export async function listTaskItems(taskId: number): Promise<TaskItemWithAssignees[]> {
  const items = await db("task_items").where({ task_id: taskId, is_deleted: false }).orderBy("id", "asc");
  const result: TaskItemWithAssignees[] = [];
  for (const item of items) {
    result.push(withTotals(item, await loadAssignees(item.id)));
  }
  return result;
}

export async function createTaskItem(
  taskId: number,
  input: CreateTaskItemInput,
  scope: DataScope,
): Promise<TaskItemWithAssignees> {
  const departmentId = await departmentIdFromTaskId(taskId);
  assertDepartmentInScope(scope, departmentId);
  if (!input.ten_viec?.trim()) throw new Error("Tên việc không được để trống");

  const [created] = await db("task_items")
    .insert({
      task_id: taskId,
      ten_viec: input.ten_viec.trim(),
      trang_thai: input.trang_thai ?? "Chưa thực hiện",
      ghi_chu: input.ghi_chu?.trim() || null,
    })
    .returning("*");
  return withTotals(created, []);
}

export async function updateTaskItem(
  id: number,
  input: UpdateTaskItemInput,
  scope: DataScope,
  graderName: string | null = null,
): Promise<TaskItemWithAssignees | undefined> {
  const existing = await db("task_items").where({ id, is_deleted: false }).first();
  if (!existing) return undefined;
  const departmentId = await departmentIdFromTaskId(existing.task_id);
  assertDepartmentInScope(scope, departmentId);

  if (input.treo_viec === true && !input.treo_viec_ly_do?.trim()) {
    throw new Error("Cần nhập lý do khi Treo việc");
  }

  const merged: Record<string, unknown> = {
    ten_viec: input.ten_viec !== undefined ? input.ten_viec.trim() : existing.ten_viec,
    trang_thai: input.trang_thai ?? existing.trang_thai,
    ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : existing.ghi_chu,
    updated_at: db.fn.now(),
  };
  if (input.treo_viec === true) {
    merged.treo_viec = true;
    merged.treo_viec_ly_do = input.treo_viec_ly_do!.trim();
    merged.treo_viec_tu_ngay = existing.treo_viec ? existing.treo_viec_tu_ngay : todayDateString();
  } else if (input.treo_viec === false) {
    merged.treo_viec = false;
    merged.treo_viec_ly_do = null;
    merged.treo_viec_tu_ngay = null;
  }
  if (input.diem_danh_gia !== undefined) merged.diem_danh_gia = input.diem_danh_gia;

  await db("task_items").where({ id }).update(merged);

  if (input.diem_danh_gia !== undefined) {
    await recomputeTaskScoreFromItems(existing.task_id, graderName);
  }

  const updated = await db("task_items").where({ id }).first();
  return withTotals(updated, await loadAssignees(id));
}

export async function deleteTaskItem(id: number, scope: DataScope, graderName: string | null = null): Promise<boolean> {
  const existing = await db("task_items").where({ id, is_deleted: false }).first();
  if (!existing) return false;
  const departmentId = await departmentIdFromTaskId(existing.task_id);
  assertDepartmentInScope(scope, departmentId);

  const hadScore = existing.diem_danh_gia != null;
  await db.transaction(async (trx) => {
    await softDeleteWhere(trx, "task_item_members", { task_item_id: id });
    await softDeleteWhere(trx, "task_items", { id });
  });
  if (hadScore) await recomputeTaskScoreFromItems(existing.task_id, graderName);
  return true;
}

export async function addTaskItemMember(
  taskItemId: number,
  input: CreateTaskItemMemberInput,
  scope: DataScope,
): Promise<TaskItemWithAssignees | undefined> {
  const item = await db("task_items").where({ id: taskItemId, is_deleted: false }).first();
  if (!item) return undefined;
  const departmentId = await departmentIdFromTaskId(item.task_id);
  assertDepartmentInScope(scope, departmentId);

  // UI không còn bước "Thêm nhân sự tham gia" riêng nữa (gộp vào "Thêm
  // việc"/gán nhân sự cho Việc luôn) — tự đảm bảo người này cũng có mặt ở
  // "Nhân sự tham gia" (task_members), idempotent sẵn (createTaskMember
  // trả về dòng cũ nếu đã có, không tạo trùng).
  await createTaskMember(item.task_id, { member_id: input.member_id }, scope);

  const existing = await db("task_item_members")
    .where({ task_item_id: taskItemId, member_id: input.member_id, is_deleted: false })
    .first();
  if (existing) {
    await db("task_item_members")
      .where({ id: existing.id })
      .update({
        gio_cong: input.gio_cong !== undefined ? input.gio_cong : existing.gio_cong,
        ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : existing.ghi_chu,
        updated_at: db.fn.now(),
      });
  } else {
    await db("task_item_members").insert({
      task_item_id: taskItemId,
      member_id: input.member_id,
      gio_cong: input.gio_cong ?? null,
      ghi_chu: input.ghi_chu?.trim() || null,
    });
  }
  return withTotals(item, await loadAssignees(taskItemId));
}

export async function updateTaskItemMember(
  id: number,
  input: UpdateTaskItemMemberInput,
  scope: DataScope,
): Promise<TaskItemWithAssignees | undefined> {
  const row = await db("task_item_members").where({ id, is_deleted: false }).first();
  if (!row) return undefined;
  const item = await db("task_items").where({ id: row.task_item_id, is_deleted: false }).first();
  if (!item) return undefined;
  const departmentId = await departmentIdFromTaskId(item.task_id);
  assertDepartmentInScope(scope, departmentId);

  await db("task_item_members")
    .where({ id })
    .update({
      gio_cong: input.gio_cong !== undefined ? input.gio_cong : row.gio_cong,
      ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : row.ghi_chu,
      updated_at: db.fn.now(),
    });
  return withTotals(item, await loadAssignees(item.id));
}

export async function removeTaskItemMember(id: number, scope: DataScope): Promise<boolean> {
  const row = await db("task_item_members").where({ id, is_deleted: false }).first();
  if (!row) return false;
  const item = await db("task_items").where({ id: row.task_item_id, is_deleted: false }).first();
  const departmentId = item ? await departmentIdFromTaskId(item.task_id) : null;
  assertDepartmentInScope(scope, departmentId);
  const count = await softDeleteWhere(db, "task_item_members", { id });
  return count > 0;
}

// Danh sách Việc đang Treo — cho card đôn đốc ở Trang chủ.
export async function listTreoViec(periodId: number, departmentId?: number | null): Promise<TreoViecRow[]> {
  const query = db("task_items as ti")
    .join("tasks as t", "ti.task_id", "t.id")
    .where("ti.is_deleted", false)
    .where("ti.treo_viec", true)
    .where("t.is_deleted", false)
    .where("t.period_id", periodId);
  if (departmentId != null) query.where("t.department_id", departmentId);

  const rows = await query.select(
    "ti.id",
    "ti.ten_viec",
    "ti.treo_viec_ly_do",
    "ti.treo_viec_tu_ngay",
    "ti.task_id",
    "t.nhiem_vu as task_nhiem_vu",
    "t.team as team",
  );

  const result: TreoViecRow[] = [];
  const today = Date.now();
  for (const r of rows as any[]) {
    const assignees = await loadAssignees(r.id);
    const tuNgay = r.treo_viec_tu_ngay ? new Date(r.treo_viec_tu_ngay).getTime() : today;
    const soNgay = Math.max(0, Math.round((today - tuNgay) / 86_400_000));
    result.push({
      id: r.id,
      ten_viec: r.ten_viec,
      treo_viec_ly_do: r.treo_viec_ly_do,
      treo_viec_tu_ngay: r.treo_viec_tu_ngay,
      so_ngay_treo: soNgay,
      task_id: r.task_id,
      task_nhiem_vu: r.task_nhiem_vu,
      team: r.team,
      assignee_names: assignees.map((a) => a.member_name),
    });
  }
  return result.sort((a, b) => b.so_ngay_treo - a.so_ngay_treo);
}
