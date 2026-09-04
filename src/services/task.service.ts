import { db } from "../db/database.js";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/backlog.js";
import { createPeriod, getPeriod } from "./period.service.js";

const TINH_CHAT_TON = "Nhiệm vụ tồn";
const KHONG_TINH_DIEM = "Không tính điểm";

function nextStt(periodId: number): number {
  const row = db
    .prepare(`SELECT COALESCE(MAX(stt), 0) AS max_stt FROM tasks WHERE period_id = ?`)
    .get(periodId) as { max_stt: number };
  return row.max_stt + 1;
}

// 1.3 Nhập mới task cho một team trong một tháng (period) — STT tự tăng theo
// thứ tự nhập trong từng period, dùng làm cột STT khi xuất Excel.
export function createTask(periodId: number, input: CreateTaskInput): Task {
  const stt = nextStt(periodId);
  const trangThai = input.trang_thai ?? "Chưa thực hiện";
  // Trạng thái Hủy mặc định đánh dấu Không tính điểm ở cột Tính chất.
  const khongTinhDiem = trangThai === "Hủy" ? KHONG_TINH_DIEM : null;
  return db
    .prepare(
      `INSERT INTO tasks (
         period_id, stt, tinh_chat, tag, team, nhiem_vu, dod, ngay_thuc_hien, deadline,
         nvtt, phan_tram_hoan_thanh, trang_thai, tien_do, cpo_danh_gia, cpo_comment, khong_tinh_diem
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .get(
      periodId,
      stt,
      input.tinh_chat ?? null,
      input.tag ?? null,
      input.team,
      input.nhiem_vu,
      input.dod ?? null,
      input.ngay_thuc_hien ?? null,
      input.deadline ?? null,
      input.nvtt ?? null,
      input.phan_tram_hoan_thanh ?? 0,
      trangThai,
      input.tien_do ?? null,
      input.cpo_danh_gia ?? null,
      input.cpo_comment ?? null,
      khongTinhDiem,
    ) as Task;
}

export function listTasks(filter: { period_id: number; team?: string }): Task[] {
  if (filter.team) {
    return db
      .prepare(
        `SELECT * FROM tasks WHERE period_id = ? AND team = ? ORDER BY stt ASC`,
      )
      .all(filter.period_id, filter.team) as Task[];
  }
  return db
    .prepare(`SELECT * FROM tasks WHERE period_id = ? ORDER BY stt ASC`)
    .all(filter.period_id) as Task[];
}

export function getTask(id: number): Task | undefined {
  return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as Task | undefined;
}

// 1.4 Cập nhật task — dùng chung cho sửa nội dung lẫn cập nhật tiến độ định kỳ
// (chỉ gửi các trường thay đổi, các trường còn lại giữ nguyên).
export function updateTask(id: number, input: UpdateTaskInput): Task | undefined {
  const existing = getTask(id);
  if (!existing) return undefined;

  const merged = { ...existing, ...input };
  // Trạng thái Hủy mặc định đánh dấu Không tính điểm ở cột Tính chất; các
  // trạng thái khác giữ nguyên giá trị Không tính điểm đã có (nếu có).
  const khongTinhDiem = merged.trang_thai === "Hủy" ? KHONG_TINH_DIEM : existing.khong_tinh_diem;
  return db
    .prepare(
      `UPDATE tasks
       SET tinh_chat = ?, tag = ?, team = ?, nhiem_vu = ?, dod = ?, ngay_thuc_hien = ?, deadline = ?,
           nvtt = ?, phan_tram_hoan_thanh = ?, trang_thai = ?, tien_do = ?, cpo_danh_gia = ?,
           cpo_comment = ?, khong_tinh_diem = ?, updated_at = datetime('now')
       WHERE id = ?
       RETURNING *`,
    )
    .get(
      merged.tinh_chat,
      merged.tag,
      merged.team,
      merged.nhiem_vu,
      merged.dod,
      merged.ngay_thuc_hien,
      merged.deadline,
      merged.nvtt,
      merged.phan_tram_hoan_thanh,
      merged.trang_thai,
      merged.tien_do,
      merged.cpo_danh_gia,
      merged.cpo_comment,
      khongTinhDiem,
      id,
    ) as Task;
}

export function deleteTask(id: number): boolean {
  const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  return result.changes > 0;
}

function addTinhChatTon(tinhChat: string | null): string {
  const items = (tinhChat ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!items.includes(TINH_CHAT_TON)) items.push(TINH_CHAT_TON);
  return items.join(", ");
}

// Deadline (YYYY-MM-DD) có tháng/năm SỚM HƠN tháng đích (chuyển sang) thì
// mới coi là "tồn đọng" — deadline null/không đọc được cũng coi là tồn đọng
// (an toàn, giữ hành vi đánh dấu như cũ khi thiếu dữ liệu). Deadline có
// tháng/năm >= tháng đích thì KHÔNG phải nhiệm vụ tồn — vẫn tính điểm bình
// thường, không tự đánh dấu "Không tính điểm".
function isDeadlineBeforeTarget(deadline: string | null, targetYear: number, targetMonth: number): boolean {
  if (!deadline || deadline.length < 7) return true;
  const year = Number(deadline.slice(0, 4));
  const month = Number(deadline.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return true;
  return year < targetYear || (year === targetYear && month < targetMonth);
}

// Nhân bản các task đã chọn (checkbox) sang tháng kế tiếp của tháng đang xem —
// tự tạo tháng đích nếu chưa có. Nếu Deadline của task có tháng/năm sớm hơn
// tháng đích thì bản sao được gắn thêm "Nhiệm vụ tồn" vào Tính chất và đánh
// dấu "Không tính điểm"; ngược lại (Deadline cùng tháng đích hoặc muộn hơn)
// giữ nguyên Tính chất/Không tính điểm gốc — vẫn tính điểm bình thường. Bản
// ghi gốc ở tháng cũ được giữ nguyên (không xóa hay chỉnh sửa nội dung) nhưng
// được đánh dấu da_chuyen_thang = 1 để chặn không cho chuyển tiếp lần nữa —
// task nào đã chuyển 1 lần rồi thì bị bỏ qua (trả về trong skippedAlreadyMoved).
export function moveTasksToNextMonth(
  fromPeriodId: number,
  taskIds: number[],
): { targetPeriod: ReturnType<typeof createPeriod>; moved: Task[]; skippedAlreadyMoved: Task[] } | undefined {
  const fromPeriod = getPeriod(fromPeriodId);
  if (!fromPeriod) return undefined;

  let nextYear = fromPeriod.year;
  let nextMonth = fromPeriod.month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const targetPeriod = createPeriod({ year: nextYear, month: nextMonth });

  const cloneOne = db.prepare(
    `INSERT INTO tasks (
       period_id, stt, tinh_chat, tag, team, nhiem_vu, dod, ngay_thuc_hien, deadline,
       nvtt, phan_tram_hoan_thanh, trang_thai, tien_do, cpo_danh_gia, cpo_comment, khong_tinh_diem
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`,
  );
  const markMoved = db.prepare(
    `UPDATE tasks SET da_chuyen_thang = 1, updated_at = datetime('now') WHERE id = ?`,
  );

  const moved: Task[] = [];
  const skippedAlreadyMoved: Task[] = [];
  for (const id of taskIds) {
    const task = getTask(id);
    if (!task || task.period_id !== fromPeriodId) continue;
    if (task.da_chuyen_thang) {
      skippedAlreadyMoved.push(task);
      continue;
    }
    const stt = nextStt(targetPeriod.id);
    const isTon = isDeadlineBeforeTarget(task.deadline, targetPeriod.year, targetPeriod.month);
    const tinhChat = isTon ? addTinhChatTon(task.tinh_chat) : task.tinh_chat;
    const khongTinhDiem = isTon ? KHONG_TINH_DIEM : task.khong_tinh_diem;
    const clone = cloneOne.get(
      targetPeriod.id,
      stt,
      tinhChat,
      task.tag,
      task.team,
      task.nhiem_vu,
      task.dod,
      task.ngay_thuc_hien,
      task.deadline,
      task.nvtt,
      task.phan_tram_hoan_thanh,
      task.trang_thai,
      task.tien_do,
      task.cpo_danh_gia,
      task.cpo_comment,
      khongTinhDiem,
    ) as Task;
    markMoved.run(task.id);
    moved.push(clone);
  }

  return { targetPeriod, moved, skippedAlreadyMoved };
}

// Đánh dấu các task đã chọn (checkbox) là "Không tính điểm" — hiển thị badge
// ở cột Tính chất (khác với cột Phân loại/tinh_chat).
export function markTasksNoScore(taskIds: number[]): Task[] {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => "?").join(", ");
  return db
    .prepare(
      `UPDATE tasks SET khong_tinh_diem = ?, updated_at = datetime('now')
       WHERE id IN (${placeholders})
       RETURNING *`,
    )
    .all(KHONG_TINH_DIEM, ...taskIds) as Task[];
}
