import { db } from "../db/database.js";
import type { RankingCell, RankingColumn, RankingConfigData } from "../types/cskh.js";

export async function getRankingConfig(): Promise<RankingConfigData> {
  const rowObjs = await db("ranking_rows").orderBy("vi_tri", "asc");
  const rows = rowObjs.map((r: any) => r.vi_tri);
  const columns = (await db("ranking_columns")
    .orderBy("thu_tu", "asc")
    .orderBy("id", "asc")) as RankingColumn[];
  const cells = (await db("ranking_cells").select("vi_tri", "column_id", "gia_tri")) as RankingCell[];
  return { rows, columns, cells };
}

// Thêm 1 hàng (vị trí xếp hạng) mới — mặc định là vị trí kế tiếp sau vị trí
// lớn nhất hiện có (1, 2, 3, ...).
export async function addRankingRow(): Promise<number> {
  const max = await db("ranking_rows").max({ m: "vi_tri" }).first();
  const nextViTri = (Number(max?.m) || 0) + 1;
  await db("ranking_rows").insert({ vi_tri: nextViTri });
  return nextViTri;
}

export async function deleteRankingRow(viTri: number): Promise<boolean> {
  const count = await db("ranking_rows").where({ vi_tri: viTri }).delete();
  return count > 0;
}

export async function addRankingColumn(tenCot: string): Promise<RankingColumn> {
  const max = await db("ranking_columns").max({ m: "thu_tu" }).first();
  const nextThuTu = (Number(max?.m) || 0) + 1;
  const [created] = await db("ranking_columns")
    .insert({ ten_cot: tenCot.trim(), thu_tu: nextThuTu })
    .returning("*");
  return created as RankingColumn;
}

export async function renameRankingColumn(id: number, tenCot: string): Promise<RankingColumn | undefined> {
  const [updated] = await db("ranking_columns")
    .where({ id })
    .update({ ten_cot: tenCot.trim() })
    .returning("*");
  return updated as RankingColumn | undefined;
}

export async function deleteRankingColumn(id: number): Promise<boolean> {
  const count = await db("ranking_columns").where({ id }).delete();
  return count > 0;
}

export async function setRankingCell(viTri: number, columnId: number, giaTri: string | null): Promise<void> {
  const existing = await db("ranking_cells").where({ vi_tri: viTri, column_id: columnId }).first();
  if (existing) {
    await db("ranking_cells")
      .where({ id: existing.id })
      .update({ gia_tri: giaTri?.trim() || null });
  } else {
    await db("ranking_cells").insert({
      vi_tri: viTri,
      column_id: columnId,
      gia_tri: giaTri?.trim() || null,
    });
  }
}
