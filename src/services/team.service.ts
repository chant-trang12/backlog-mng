import { db } from "../db/database.js";
import type { Team } from "../types/backlog.js";

// Khai báo team theo từng tháng backlog (period_id) — làm trước khi nhập
// task, để task chọn team từ danh sách đã khai báo thay vì gõ tự do (tránh
// trùng tên do gõ sai chính tả). Idempotent theo (period_id, name) — thêm
// team ở tháng nào chỉ hiển thị từ tháng đó trở đi, không ảnh hưởng các
// tháng đã tạo trước đó.
export function createTeam(name: string, periodId: number): Team {
  const trimmed = name.trim();
  const existing = db.prepare(`SELECT * FROM teams WHERE period_id = ? AND name = ?`).get(periodId, trimmed) as
    | Team
    | undefined;
  if (existing) return existing;

  return db
    .prepare(`INSERT INTO teams (period_id, name) VALUES (?, ?) RETURNING *`)
    .get(periodId, trimmed) as Team;
}

export function getTeam(id: number): Team | undefined {
  return db.prepare(`SELECT * FROM teams WHERE id = ?`).get(id) as Team | undefined;
}

export function listTeams(periodId: number): Team[] {
  return db.prepare(`SELECT * FROM teams WHERE period_id = ? ORDER BY name ASC`).all(periodId) as Team[];
}

export function deleteTeam(id: number): boolean {
  const result = db.prepare(`DELETE FROM teams WHERE id = ?`).run(id);
  return result.changes > 0;
}

// Tháng mới tạo kế thừa danh sách team từ tháng gần nhất (giống nhân sự) —
// idempotent theo (period_id, name) nên gọi lại không tạo trùng.
export function cloneTeamsFromPeriod(fromPeriodId: number, toPeriodId: number): void {
  db.prepare(
    `INSERT INTO teams (period_id, name)
     SELECT ?, name FROM teams WHERE period_id = ?
     ON CONFLICT(period_id, name) DO NOTHING`,
  ).run(toPeriodId, fromPeriodId);
}
