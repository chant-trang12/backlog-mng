import { db } from "../db/database.js";
import type {
  CreateTieuChiConfigInput,
  TieuChiConfig,
  TieuChiConfigWithDiemChuan,
  TieuChiDiemChuan,
  UpdateTieuChiConfigInput,
} from "../types/cskh.js";

export function createTieuChiConfig(input: CreateTieuChiConfigInput): TieuChiConfig {
  const row = db
    .prepare(
      `INSERT INTO tieu_chi_configs (nhom, ten_tieu_chi, cach_tinh_diem, co_chi_tieu, thu_tu)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(
      input.nhom.trim(),
      input.ten_tieu_chi.trim(),
      input.cach_tinh_diem?.trim() || null,
      input.co_chi_tieu ? 1 : 0,
      input.thu_tu ?? 0,
    ) as TieuChiConfig;
  return { ...row, co_chi_tieu: Boolean(row.co_chi_tieu) };
}

export function getTieuChiConfig(id: number): TieuChiConfig | undefined {
  return db.prepare(`SELECT * FROM tieu_chi_configs WHERE id = ?`).get(id) as TieuChiConfig | undefined;
}

// Danh sách tiêu chí kèm điểm chuẩn/chỉ tiêu theo từng team đã cấu hình cho
// tiêu chí đó (client tự lọc/map theo team_name của tháng đang xem).
export function listTieuChiConfigs(): TieuChiConfigWithDiemChuan[] {
  const configs = db
    .prepare(`SELECT * FROM tieu_chi_configs ORDER BY nhom ASC, thu_tu ASC, id ASC`)
    .all() as TieuChiConfig[];
  const diemChuanStmt = db.prepare(
    `SELECT team_name, diem_chuan, chi_tieu FROM tieu_chi_diem_chuan WHERE tieu_chi_id = ? ORDER BY team_name ASC`,
  );
  return configs.map((c) => ({
    ...c,
    co_chi_tieu: Boolean(c.co_chi_tieu),
    diem_chuan: diemChuanStmt.all(c.id) as TieuChiDiemChuan[],
  }));
}

export function updateTieuChiConfig(id: number, input: UpdateTieuChiConfigInput): TieuChiConfig | undefined {
  const existing = getTieuChiConfig(id);
  if (!existing) return undefined;

  const merged = {
    nhom: input.nhom?.trim() ?? existing.nhom,
    ten_tieu_chi: input.ten_tieu_chi?.trim() ?? existing.ten_tieu_chi,
    cach_tinh_diem: input.cach_tinh_diem !== undefined ? input.cach_tinh_diem.trim() || null : existing.cach_tinh_diem,
    co_chi_tieu: input.co_chi_tieu !== undefined ? (input.co_chi_tieu ? 1 : 0) : existing.co_chi_tieu ? 1 : 0,
    thu_tu: input.thu_tu ?? existing.thu_tu,
  };

  const row = db
    .prepare(
      `UPDATE tieu_chi_configs
       SET nhom = ?, ten_tieu_chi = ?, cach_tinh_diem = ?, co_chi_tieu = ?, thu_tu = ?, updated_at = datetime('now')
       WHERE id = ? RETURNING *`,
    )
    .get(merged.nhom, merged.ten_tieu_chi, merged.cach_tinh_diem, merged.co_chi_tieu, merged.thu_tu, id) as TieuChiConfig;
  return { ...row, co_chi_tieu: Boolean(row.co_chi_tieu) };
}

export function deleteTieuChiConfig(id: number): boolean {
  const result = db.prepare(`DELETE FROM tieu_chi_configs WHERE id = ?`).run(id);
  return result.changes > 0;
}

// Lưu điểm chuẩn/chỉ tiêu của 1 team cho 1 tiêu chí (upsert theo tieu_chi_id
// + team_name) — dùng để chỉnh trực tiếp từng ô trong bảng cấu hình.
export function setTieuChiDiemChuan(
  tieuChiId: number,
  teamName: string,
  diemChuan: string | null,
  chiTieu: string | null,
): void {
  db.prepare(
    `INSERT INTO tieu_chi_diem_chuan (tieu_chi_id, team_name, diem_chuan, chi_tieu)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tieu_chi_id, team_name) DO UPDATE SET diem_chuan = excluded.diem_chuan, chi_tieu = excluded.chi_tieu`,
  ).run(tieuChiId, teamName.trim(), diemChuan?.trim() || null, chiTieu?.trim() || null);
}
