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
  const dateFrom = typeof req.query.date_from === "string" && req.query.date_from ? req.query.date_from : undefined;
  const dateTo = typeof req.query.date_to === "string" && req.query.date_to ? `${req.query.date_to} 23:59:59` : undefined;

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
