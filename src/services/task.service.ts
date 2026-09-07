import { db } from "../db/database.js";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/backlog.js";
import { createPeriod, getPeriod } from "./period.service.js";

const TINH_CHAT_TON = "Nhiệm vụ tồn";
const KHONG_TINH_DIEM = "Không tính điểm";

async function nextStt(periodId: number): Promise<number> {
  const row = await db("tasks")
    .where({ period_id: periodId })
    .max({ max_stt: "stt" })
    .first();
  const max = Number(row?.max_stt ?? 0);
  return max + 1;
}

// 1.3 Nhập mới task cho một team trong một tháng (period) — STT tự tăng theo
// thứ tự nhập trong từng period, dùng làm cột STT khi xuất Excel.
export async function createTask(periodId: number, input: CreateTaskInput): Promise<Task> {
  const stt = await nextStt(periodId);
  const trangThai = input.trang_thai ?? "Chưa thực hiện";
  // Trạng thái Hủy mặc định đánh dấu Không tính điểm ở cột Tính chất.
  const khongTinhDiem = trangThai === "Hủy" ? KHONG_TINH_DIEM : null;

  const [created] = await db("tasks")
    .insert({
      period_id: periodId,
      stt,
      tinh_chat: input.tinh_chat ?? null,
      tag: input.tag ?? null,
      team: input.team,
      nhiem_vu: input.nhiem_vu,
      dod: input.dod ?? null,
      ngay_thuc_hien: input.ngay_thuc_hien ?? null,
      deadline: input.deadline ?? null,
      nvtt: input.nvtt ?? null,
      phan_tram_hoan_thanh: input.phan_tram_hoan_thanh ?? 0,
      trang_thai: trangThai,
      tien_do: input.tien_do ?? null,
      cpo_danh_gia: input.cpo_danh_gia ?? null,
      cpo_comment: input.cpo_comment ?? null,
      khong_tinh_diem: khongTinhDiem,
    })
    .returning("*");

  return created as Task;
}

export async function listTasks(filter: { period_id: number; team?: string }): Promise<Task[]> {
  const query = db("tasks").where({ period_id: filter.period_id });
  if (filter.team) {
    query.where({ team: filter.team });
  }
  const rows = await query.orderBy("stt", "asc");
  return rows as Task[];
}

export async function getTask(id: number): Promise<Task | undefined> {
  const row = await db("tasks").where({ id }).first();
  return row as Task | undefined;
}

// 1.4 Cập nhật task — dùng chung cho sửa nội dung lẫn cập nhật tiến độ định kỳ
// (chỉ gửi các trường thay đổi, các trường còn lại giữ nguyên).
export async function updateTask(id: number, input: UpdateTaskInput): Promise<Task | undefined> {
  const existing = await getTask(id);
  if (!existing) return undefined;

  const merged = { ...existing, ...input };
  // Trạng thái Hủy mặc định đánh dấu Không tính điểm ở cột Tính chất; các
  // trạng thái khác giữ nguyên giá trị Không tính điểm đã có (nếu có).
  const khongTinhDiem = merged.trang_thai === "Hủy" ? KHONG_TINH_DIEM : existing.khong_tinh_diem;

  const [updated] = await db("tasks")
    .where({ id })
    .update({
      tinh_chat: merged.tinh_chat,
      tag: merged.tag,
      team: merged.team,
      nhiem_vu: merged.nhiem_vu,
      dod: merged.dod,
      ngay_thuc_hien: merged.ngay_thuc_hien,
      deadline: merged.deadline,
      nvtt: merged.nvtt,
      phan_tram_hoan_thanh: merged.phan_tram_hoan_thanh,
      trang_thai: merged.trang_thai,
      tien_do: merged.tien_do,
      cpo_danh_gia: merged.cpo_danh_gia,
      cpo_comment: merged.cpo_comment,
      khong_tinh_diem: khongTinhDiem,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return updated as Task;
}

export async function deleteTask(id: number): Promise<boolean> {
  const count = await db("tasks").where({ id }).delete();
  return count > 0;
}

function addTinhChatTon(tinhChat: string | null): string {
  const items = (tinhChat ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!items.includes(TINH_CHAT_TON)) items.push(TINH_CHAT_TON);
  return items.join(", ");
}

function isDeadlineBeforeTarget(deadline: string | null, targetYear: number, targetMonth: number): boolean {
  if (!deadline || deadline.length < 7) return true;
  const year = Number(deadline.slice(0, 4));
  const month = Number(deadline.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return true;
  return year < targetYear || (year === targetYear && month < targetMonth);
}

export async function moveTasksToNextMonth(
  fromPeriodId: number,
  taskIds: number[],
): Promise<{ targetPeriod: Awaited<ReturnType<typeof createPeriod>>; moved: Task[]; skippedAlreadyMoved: Task[] } | undefined> {
  const fromPeriod = await getPeriod(fromPeriodId);
  if (!fromPeriod) return undefined;

  let nextYear = fromPeriod.year;
  let nextMonth = fromPeriod.month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const targetPeriod = await createPeriod({ year: nextYear, month: nextMonth });

  const moved: Task[] = [];
  const skippedAlreadyMoved: Task[] = [];
  for (const id of taskIds) {
    const task = await getTask(id);
    if (!task || task.period_id !== fromPeriodId) continue;
    if (task.da_chuyen_thang) {
      skippedAlreadyMoved.push(task);
      continue;
    }
    const stt = await nextStt(targetPeriod.id);
    const isTon = isDeadlineBeforeTarget(task.deadline, targetPeriod.year, targetPeriod.month);
    const tinhChat = isTon ? addTinhChatTon(task.tinh_chat) : task.tinh_chat;
    const khongTinhDiem = isTon ? KHONG_TINH_DIEM : task.khong_tinh_diem;

    const [clone] = await db("tasks")
      .insert({
        period_id: targetPeriod.id,
        stt,
        tinh_chat: tinhChat,
        tag: task.tag,
        team: task.team,
        nhiem_vu: task.nhiem_vu,
        dod: task.dod,
        ngay_thuc_hien: task.ngay_thuc_hien,
        deadline: task.deadline,
        nvtt: task.nvtt,
        phan_tram_hoan_thanh: task.phan_tram_hoan_thanh,
        trang_thai: task.trang_thai,
        tien_do: task.tien_do,
        cpo_danh_gia: task.cpo_danh_gia,
        cpo_comment: task.cpo_comment,
        khong_tinh_diem: khongTinhDiem,
      })
      .returning("*");

    await db("tasks").where({ id: task.id }).update({ da_chuyen_thang: 1, updated_at: db.fn.now() });
    moved.push(clone as Task);
  }

  return { targetPeriod, moved, skippedAlreadyMoved };
}

export async function markTasksNoScore(taskIds: number[]): Promise<Task[]> {
  if (taskIds.length === 0) return [];
  const updated = await db("tasks")
    .whereIn("id", taskIds)
    .update({ khong_tinh_diem: KHONG_TINH_DIEM, updated_at: db.fn.now() })
    .returning("*");
  return updated as Task[];
}
