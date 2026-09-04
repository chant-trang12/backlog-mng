import { db } from "../db/database.js";
import type { RankingCell, RankingColumn, RankingConfigData } from "../types/cskh.js";

export function getRankingConfig(): RankingConfigData {
  const rows = (db.prepare(`SELECT vi_tri FROM ranking_rows ORDER BY vi_tri ASC`).all() as { vi_tri: number }[]).map(
    (r) => r.vi_tri,
  );
  const columns = db.prepare(`SELECT * FROM ranking_columns ORDER BY thu_tu ASC, id ASC`).all() as RankingColumn[];
  const cells = db.prepare(`SELECT vi_tri, column_id, gia_tri FROM ranking_cells`).all() as RankingCell[];
  return { rows, columns, cells };
}

// Thêm 1 hàng (vị trí xếp hạng) mới — mặc định là vị trí kế tiếp sau vị trí
// lớn nhất hiện có (1, 2, 3, ...).
export function addRankingRow(): number {
  const max = db.prepare(`SELECT MAX(vi_tri) AS m FROM ranking_rows`).get() as { m: number | null };
  const nextViTri = (max.m ?? 0) + 1;
  db.prepare(`INSERT INTO ranking_rows (vi_tri) VALUES (?)`).run(nextViTri);
  return nextViTri;
}

export function deleteRankingRow(viTri: number): boolean {
  const result = db.prepare(`DELETE FROM ranking_rows WHERE vi_tri = ?`).run(viTri);
  return result.changes > 0;
}

export function addRankingColumn(tenCot: string): RankingColumn {
  const max = db.prepare(`SELECT MAX(thu_tu) AS m FROM ranking_columns`).get() as { m: number | null };
  return db
    .prepare(`INSERT INTO ranking_columns (ten_cot, thu_tu) VALUES (?, ?) RETURNING *`)
    .get(tenCot.trim(), (max.m ?? 0) + 1) as RankingColumn;
}

export function renameRankingColumn(id: number, tenCot: string): RankingColumn | undefined {
  return db
    .prepare(`UPDATE ranking_columns SET ten_cot = ? WHERE id = ? RETURNING *`)
    .get(tenCot.trim(), id) as RankingColumn | undefined;
}

export function deleteRankingColumn(id: number): boolean {
  const result = db.prepare(`DELETE FROM ranking_columns WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function setRankingCell(viTri: number, columnId: number, giaTri: string | null): void {
  db.prepare(
    `INSERT INTO ranking_cells (vi_tri, column_id, gia_tri) VALUES (?, ?, ?)
     ON CONFLICT(vi_tri, column_id) DO UPDATE SET gia_tri = excluded.gia_tri`,
  ).run(viTri, columnId, giaTri?.trim() || null);
}
