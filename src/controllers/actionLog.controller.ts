import type { Request, Response } from "express";
import { listActionLogModules, listActionLogs } from "../services/actionLog.service.js";
import { ACTION_LOG_TYPES, type ActionLogType } from "../types/actionLog.js";

// GET /api/action-logs?user_id=&action=&module=&q=&date_from=&date_to=
// Chỉ Admin gọi được (requireAdmin mount ở app.ts, giống /api/users).
export async function listActionLogsHandler(req: Request, res: Response) {
  const userId = req.query.user_id != null ? Number(req.query.user_id) : undefined;
  const action =
    typeof req.query.action === "string" && (ACTION_LOG_TYPES as string[]).includes(req.query.action)
      ? (req.query.action as ActionLogType)
      : undefined;
  const moduleFilter = typeof req.query.module === "string" && req.query.module ? req.query.module : undefined;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
  // Chỉ nhận đúng "YYYY-MM-DD" (input type=date) — chuỗi lạ gửi thẳng
  // xuống SQL Server sẽ lỗi chuyển kiểu datetime (500) thay vì bỏ qua.
  const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const dateFrom = isoDate(req.query.date_from);
  const dateTo = isoDate(req.query.date_to);

  const rows = await listActionLogs({
    user_id: Number.isFinite(userId) ? userId : undefined,
    action,
    module: moduleFilter,
    q,
    date_from: dateFrom,
    date_to: dateTo,
  });
  res.json(rows);
}

export async function listActionLogModulesHandler(_req: Request, res: Response) {
  res.json(await listActionLogModules());
}
