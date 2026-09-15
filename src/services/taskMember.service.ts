import { db } from "../db/database.js";
import type {
  CreateTaskMemberInput,
  TaskMemberWithName,
  UpdateTaskMemberInput,
} from "../types/backlog.js";

const SELECT_COLUMNS = [
  "task_members.id",
  "task_members.task_id",
  "task_members.member_id",
  "task_members.ghi_chu",
  "task_members.created_at",
  "task_members.updated_at",
  "members.name as member_name",
  "members.chuc_vu as member_chuc_vu",
];

// Danh sách nhân sự tham gia 1 task, kèm tên + chức vụ (join members) để FE
// hiển thị trực tiếp — sắp theo thời điểm gán (id tăng dần). "Vai trò" hiển
// thị ở FE chính là member_chuc_vu — không có danh mục riêng, lấy thẳng
// theo Chức vụ đã khai báo sẵn cho nhân sự đó ở Team & Nhân sự.
export async function listTaskMembers(taskId: number): Promise<TaskMemberWithName[]> {
  const rows = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ task_id: taskId })
    .select(SELECT_COLUMNS)
    .orderBy("task_members.id", "asc");
  return rows as TaskMemberWithName[];
}

export async function getTaskMember(id: number): Promise<TaskMemberWithName | undefined> {
  const row = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ "task_members.id": id })
    .select(SELECT_COLUMNS)
    .first();
  return row as TaskMemberWithName | undefined;
}

// Gán 1 nhân sự vào task — idempotent theo (task_id, member_id): gán lại
// nhân sự đã có sẽ trả về dòng cũ (chỉ cập nhật ghi chú nếu có gửi kèm),
// tránh trùng lặp khi bấm nhiều lần. Không còn khái niệm "vai trò" riêng
// theo dòng — 1 nhân sự chỉ tham gia 1 lần / task.
export async function createTaskMember(
  taskId: number,
  input: CreateTaskMemberInput,
): Promise<TaskMemberWithName> {
  const existing = await db("task_members")
    .where({ task_id: taskId, member_id: input.member_id })
    .first();
  if (existing) {
    if (input.ghi_chu !== undefined) {
      await db("task_members")
        .where({ id: existing.id })
        .update({ ghi_chu: input.ghi_chu.trim() || null, updated_at: db.fn.now() });
    }
    return (await getTaskMember(existing.id)) as TaskMemberWithName;
  }

  const [created] = await db("task_members")
    .insert({
      task_id: taskId,
      member_id: input.member_id,
      ghi_chu: input.ghi_chu?.trim() || null,
    })
    .returning("*");
  return (await getTaskMember(created.id)) as TaskMemberWithName;
}

export async function updateTaskMember(
  id: number,
  input: UpdateTaskMemberInput,
): Promise<TaskMemberWithName | undefined> {
  const existing = await getTaskMember(id);
  if (!existing) return undefined;
  await db("task_members")
    .where({ id })
    .update({
      ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : existing.ghi_chu,
      updated_at: db.fn.now(),
    });
  return getTaskMember(id);
}

export async function deleteTaskMember(id: number): Promise<boolean> {
  const count = await db("task_members").where({ id }).delete();
  return count > 0;
}
