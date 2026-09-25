import { db } from "../db/database.js";
import { isMssql } from "../db/connection.js";
import type { ActionLog, ActionLogInput, ListActionLogsFilter } from "../types/actionLog.js";

// Trần số dòng trả về / mặc định độ dài lịch sử — action_logs tích luỹ
// liên tục theo thời gian (không "theo tháng/theo phòng ban" như các bảng
// khác nên không tự giới hạn quy mô), tránh trả về hàng triệu dòng khi
// không lọc gì. Client lọc theo date_from/date_to để xem xa hơn.
const MAX_ROWS = 2000;
const DEFAULT_WINDOW_DAYS = 90;

// Mốc thời gian để so với cột created_at. SQLite lưu created_at dạng chuỗi
// "YYYY-MM-DD HH:MM:SS" nên phải so chuỗi CÙNG định dạng. SQL Server thì
// "YYYY-MM-DD ..." phụ thuộc SET DATEFORMAT/ngôn ngữ của login (có thể bị
// hiểu thành YYYY-DD-MM) — dùng "YYYYMMDD HH:MM:SS", định dạng duy nhất
// không phụ thuộc cấu hình đó.
function toDbDateTime(date: string, time: string): string {
  return isMssql ? `${date.replace(/-/g, "")} ${time}` : `${date} ${time}`;
}

// Ghi 1 dòng nhật ký — KHÔNG BAO GIỜ throw ra ngoài (ghi log là tác dụng
// phụ, không được làm hỏng request nghiệp vụ chính đang chạy). Gọi từ
// actionLog.middleware.ts (mọi request ghi tới /api) và auth.controller.ts
// (đăng nhập/đăng xuất, nằm ngoài /api nên middleware không bắt được).
export async function recordActionLog(input: ActionLogInput): Promise<void> {
  try {
    let departmentName: string | null = null;
    if (input.department_id != null) {
      const dept = await db("departments").where({ id: input.department_id }).first();
      departmentName = (dept as { name?: string } | undefined)?.name ?? null;
    }
    await db("action_logs").insert({
      user_id: input.user_id,
      user_name: input.user_name,
      department_id: input.department_id,
      department_name: departmentName,
      action: input.action,
      module: input.module,
      description: input.description,
      method: input.method ?? null,
      path: input.path ?? null,
      ip: input.ip ?? null,
    });
  } catch (err) {
    console.error("Lỗi ghi action log:", err);
  }
}

export async function listActionLogs(filter: ListActionLogsFilter): Promise<ActionLog[]> {
  const query = db("action_logs");
  if (filter.user_id != null) query.where({ user_id: filter.user_id });
  if (filter.action) query.where({ action: filter.action });
  if (filter.module) query.where({ module: filter.module });
  if (filter.q) {
    const term = `%${filter.q}%`;
    query.where((qb) => {
      qb.whereRaw("description LIKE ?", [term]).orWhereRaw("user_name LIKE ?", [term]);
    });
  }

  // Không lọc ngày gì cả -> mặc định chỉ lấy DEFAULT_WINDOW_DAYS ngày gần
  // nhất, tránh quét toàn bộ bảng khi mở trang lần đầu. Tính mốc ở JS thay
  // vì datetime('now', ...) — hàm đó chỉ có ở SQLite.
  if (filter.date_from) {
    query.where("created_at", ">=", toDbDateTime(filter.date_from, "00:00:00"));
  } else if (!filter.date_to) {
    const cutoff = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    query.where("created_at", ">=", toDbDateTime(cutoff.slice(0, 10), cutoff.slice(11, 19)));
  }
  if (filter.date_to) query.where("created_at", "<=", toDbDateTime(filter.date_to, "23:59:59"));

  const rows = await query
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(Math.min(filter.limit ?? MAX_ROWS, MAX_ROWS));

  return rows as ActionLog[];
}

// Danh sách module đã TỪNG xuất hiện trong log — dùng đổ vào dropdown lọc
// "Module" ở FE (không cần khai báo tay 1 danh mục cố định, cứ có log ghi
// module nào thì hiện module đó).
export async function listActionLogModules(): Promise<string[]> {
  const rows = await db("action_logs")
    .distinct("module")
    .whereNotNull("module")
    .orderBy("module", "asc");
  return (rows as { module: string }[]).map((r) => r.module).filter(Boolean);
}
