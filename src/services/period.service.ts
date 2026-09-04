import { db } from "../db/database.js";
import { cloneMembersFromPeriod } from "./member.service.js";
import { cloneTeamsFromPeriod } from "./team.service.js";
import type { CreatePeriodInput, Period } from "../types/backlog.js";

const MONTH_NAMES = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function defaultLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]}/${year}`;
}

// 1.2 Tạo mới một backlog theo tháng — mỗi (năm, tháng) chỉ có một period, tạo
// lại nếu đã tồn tại thì trả về period cũ (idempotent) để tránh trùng lặp khi
// người dùng bấm "Tạo tháng mới" nhiều lần cho cùng một tháng.
export function createPeriod(input: CreatePeriodInput): Period {
  const existing = getPeriodByYearMonth(input.year, input.month);
  if (existing) return existing;

  const label = input.label?.trim() || defaultLabel(input.year, input.month);
  const created = db
    .prepare(
      `INSERT INTO periods (year, month, label) VALUES (?, ?, ?) RETURNING *`,
    )
    .get(input.year, input.month, label) as Period;

  // Tháng mới kế thừa danh sách team + nhân sự từ tháng gần nhất đã có (nếu
  // có), để không phải khai báo lại từ đầu — nhưng từ đây là các danh sách
  // độc lập. Phải nhân bản team TRƯỚC nhân sự vì nhân sự cần map team_id
  // đúng theo team (mới) của tháng vừa tạo.
  const latestOther = db
    .prepare(`SELECT id FROM periods WHERE id != ? ORDER BY year DESC, month DESC LIMIT 1`)
    .get(created.id) as { id: number } | undefined;
  if (latestOther) {
    cloneTeamsFromPeriod(latestOther.id, created.id);
    cloneMembersFromPeriod(latestOther.id, created.id);
  }

  return created;
}

export function getPeriodByYearMonth(year: number, month: number): Period | undefined {
  return db
    .prepare(`SELECT * FROM periods WHERE year = ? AND month = ?`)
    .get(year, month) as Period | undefined;
}

export function getPeriod(id: number): Period | undefined {
  return db.prepare(`SELECT * FROM periods WHERE id = ?`).get(id) as Period | undefined;
}

export function listPeriods(): Period[] {
  return db
    .prepare(`SELECT * FROM periods ORDER BY year DESC, month DESC`)
    .all() as Period[];
}

export function deletePeriod(id: number): boolean {
  const result = db.prepare(`DELETE FROM periods WHERE id = ?`).run(id);
  return result.changes > 0;
}
