import { db } from "../db/database.js";
import type { ActionLog, ActionLogInput, ListActionLogsFilter } from "../types/actionLog.js";

// Trần số dòng trả về / mặc định độ dài lịch sử — action_logs tích luỹ
// liên tục theo thời gian (không "theo tháng/theo phòng ban" như các bảng
// khác nên không tự giới hạn quy mô), tránh trả về hàng triệu dòng khi
// không lọc gì. Client lọc theo date_from/date_to để xem xa hơn.
const MAX_ROWS = 2000;
const DEFAULT_WINDOW_DAYS = 90;

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
  // nhất, tránh quét toàn bộ bảng khi mở trang lần đầu.
  if (filter.date_from) {
    query.where("created_at", ">=", filter.date_from);
  } else if (!filter.date_to) {
    // Tính mốc ở JS thay vì datetime('now', ...) — hàm đó chỉ có ở SQLite,
    // SQL Server báo lỗi "'datetime' is not a recognized built-in function".
    // Chuỗi "YYYY-MM-DD HH:MM:SS" so sánh đúng trên cả 2 DB.
    const cutoff = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    query.where("created_at", ">=", cutoff);
  }
  if (filter.date_to) query.where("created_at", "<=", filter.date_to);

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
