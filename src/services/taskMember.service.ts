import { db } from "../db/database.js";
import type {
  CreateTaskMemberInput,
  TaskMemberWithName,
  UpdateTaskMemberInput,
} from "../types/backlog.js";

// Danh sách nhân sự tham gia 1 task, kèm tên nhân sự (join members) để FE
// hiển thị trực tiếp — sắp theo thời điểm gán (id tăng dần).
export async function listTaskMembers(taskId: number): Promise<TaskMemberWithName[]> {
  const rows = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ task_id: taskId })
    .select(
      "task_members.id",
      "task_members.task_id",
      "task_members.member_id",
      "task_members.vai_tro",
      "task_members.ghi_chu",
      "task_members.created_at",
      "task_members.updated_at",
      "members.name as member_name",
    )
    .orderBy("task_members.id", "asc");
  return rows as TaskMemberWithName[];
}

export async function getTaskMember(id: number): Promise<TaskMemberWithName | undefined> {
  const row = await db("task_members")
    .join("members", "task_members.member_id", "members.id")
    .where({ "task_members.id": id })
    .select(
      "task_members.id",
      "task_members.task_id",
      "task_members.member_id",
      "task_members.vai_tro",
      "task_members.ghi_chu",
      "task_members.created_at",
      "task_members.updated_at",
      "members.name as member_name",
    )
    .first();
  return row as TaskMemberWithName | undefined;
}

// Gán 1 nhân sự vào task với 1 vai trò — idempotent theo (task_id,
// member_id, vai_tro): gán lại đúng cặp đã có sẽ trả về dòng cũ, tránh
// trùng lặp khi bấm nhiều lần. 1 nhân sự vẫn có thể tham gia cùng task với
// NHIỀU vai trò khác nhau (mỗi vai trò là 1 dòng riêng).
export async function createTaskMember(
  taskId: number,
  input: CreateTaskMemberInput,
): Promise<TaskMemberWithName> {
  const vaiTro = input.vai_tro?.trim() || null;
  const existing = await db("task_members")
    .where({ task_id: taskId, member_id: input.member_id, vai_tro: vaiTro })
    .first();
  if (existing) return (await getTaskMember(existing.id)) as TaskMemberWithName;

  const [created] = await db("task_members")
    .insert({
      task_id: taskId,
      member_id: input.member_id,
      vai_tro: vaiTro,
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
      vai_tro: input.vai_tro !== undefined ? input.vai_tro.trim() || null : existing.vai_tro,
      ghi_chu: input.ghi_chu !== undefined ? input.ghi_chu.trim() || null : existing.ghi_chu,
      updated_at: db.fn.now(),
    });
  return getTaskMember(id);
}

export async function deleteTaskMember(id: number): Promise<boolean> {
  const count = await db("task_members").where({ id }).delete();
  return count > 0;
}
