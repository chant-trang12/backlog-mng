import { db } from "../db/database.js";
import type {
  CreateCreationRateInput,
  CreationRate,
  CreationRateWithTeam,
  UpdateCreationRateInput,
} from "../types/cskh.js";

function withTotals(
  row: CreationRate & { team_name: string; period_label: string },
): CreationRateWithTeam {
  const total = row.so_luong_thanh_cong + row.so_luong_that_bai;
  return {
    ...row,
    total,
    grand_total: total > 0 ? row.so_luong_thanh_cong / total : 0,
  };
}

export function createCreationRate(input: CreateCreationRateInput): CreationRate {
  return db
    .prepare(
      `INSERT INTO creation_rates (period_id, team_id, so_luong_thanh_cong, so_luong_that_bai) VALUES (?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.period_id,
      input.team_id,
      input.so_luong_thanh_cong ?? 0,
      input.so_luong_that_bai ?? 0,
    ) as CreationRate;
}

export function getCreationRate(id: number): CreationRate | undefined {
  return db.prepare(`SELECT * FROM creation_rates WHERE id = ?`).get(id) as
    | CreationRate
    | undefined;
}

export function listCreationRates(): CreationRateWithTeam[] {
  const rows = db
    .prepare(
      `SELECT creation_rates.*, teams.name AS team_name, periods.label AS period_label
       FROM creation_rates
       JOIN teams ON teams.id = creation_rates.team_id
       JOIN periods ON periods.id = creation_rates.period_id
       ORDER BY periods.year DESC, periods.month DESC, teams.name ASC, creation_rates.id DESC`,
    )
    .all() as (CreationRate & { team_name: string; period_label: string })[];
  return rows.map(withTotals);
}

export function updateCreationRate(
  id: number,
  input: UpdateCreationRateInput,
): CreationRate | undefined {
  const existing = getCreationRate(id);
  if (!existing) return undefined;

  const merged = {
    period_id: input.period_id ?? existing.period_id,
    team_id: input.team_id ?? existing.team_id,
    so_luong_thanh_cong: input.so_luong_thanh_cong ?? existing.so_luong_thanh_cong,
    so_luong_that_bai: input.so_luong_that_bai ?? existing.so_luong_that_bai,
  };

  return db
    .prepare(
      `UPDATE creation_rates SET period_id = ?, team_id = ?, so_luong_thanh_cong = ?, so_luong_that_bai = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .get(
      merged.period_id,
      merged.team_id,
      merged.so_luong_thanh_cong,
      merged.so_luong_that_bai,
      id,
    ) as CreationRate;
}

export function deleteCreationRate(id: number): boolean {
  const result = db.prepare(`DELETE FROM creation_rates WHERE id = ?`).run(id);
  return result.changes > 0;
}
