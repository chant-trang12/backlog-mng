import { db } from "../db/database.js";
import type {
  CreateTieuChiConfigInput,
  TieuChiConfig,
  TieuChiConfigWithDiemChuan,
  TieuChiDiemChuan,
  UpdateTieuChiConfigInput,
} from "../types/cskh.js";

export async function createTieuChiConfig(input: CreateTieuChiConfigInput): Promise<TieuChiConfig> {
  const [row] = await db("tieu_chi_configs")
    .insert({
      nhom: input.nhom.trim(),
      ten_tieu_chi: input.ten_tieu_chi.trim(),
      cach_tinh_diem: input.cach_tinh_diem?.trim() || null,
      co_chi_tieu: input.co_chi_tieu ? 1 : 0,
      thu_tu: input.thu_tu ?? 0,
    })
    .returning("*");

  return { ...row, co_chi_tieu: Boolean(row.co_chi_tieu) } as TieuChiConfig;
}

export async function getTieuChiConfig(id: number): Promise<TieuChiConfig | undefined> {
  const row = await db("tieu_chi_configs").where({ id }).first();
  if (!row) return undefined;
  return { ...row, co_chi_tieu: Boolean(row.co_chi_tieu) } as TieuChiConfig;
}

// Danh sách tiêu chí kèm điểm chuẩn/chỉ tiêu theo từng team đã cấu hình cho
// tiêu chí đó (client tự lọc/map theo team_name của tháng đang xem).
export async function listTieuChiConfigs(): Promise<TieuChiConfigWithDiemChuan[]> {
  const configs = (await db("tieu_chi_configs")
    .orderBy("nhom", "asc")
    .orderBy("thu_tu", "asc")
    .orderBy("id", "asc")) as TieuChiConfig[];

  const allDiemChuan = (await db("tieu_chi_diem_chuan")
    .select("tieu_chi_id", "team_name", "diem_chuan", "chi_tieu")
    .orderBy("team_name", "asc")) as (TieuChiDiemChuan & { tieu_chi_id: number })[];

  const mapByTieuChi = new Map<number, TieuChiDiemChuan[]>();
  for (const dc of allDiemChuan) {
    const list = mapByTieuChi.get(dc.tieu_chi_id) ?? [];
    list.push({
      team_name: dc.team_name,
      diem_chuan: dc.diem_chuan,
      chi_tieu: dc.chi_tieu,
    });
    mapByTieuChi.set(dc.tieu_chi_id, list);
  }

  return configs.map((c) => ({
    ...c,
    co_chi_tieu: Boolean(c.co_chi_tieu),
    diem_chuan: mapByTieuChi.get(c.id) ?? [],
  }));
}

export async function updateTieuChiConfig(
  id: number,
  input: UpdateTieuChiConfigInput,
): Promise<TieuChiConfig | undefined> {
  const existing = await getTieuChiConfig(id);
  if (!existing) return undefined;

  const merged = {
    nhom: input.nhom?.trim() ?? existing.nhom,
    ten_tieu_chi: input.ten_tieu_chi?.trim() ?? existing.ten_tieu_chi,
    cach_tinh_diem: input.cach_tinh_diem !== undefined ? input.cach_tinh_diem.trim() || null : existing.cach_tinh_diem,
    co_chi_tieu: input.co_chi_tieu !== undefined ? (input.co_chi_tieu ? 1 : 0) : existing.co_chi_tieu ? 1 : 0,
    thu_tu: input.thu_tu ?? existing.thu_tu,
  };

  const [row] = await db("tieu_chi_configs")
    .where({ id })
    .update({
      ...merged,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return { ...row, co_chi_tieu: Boolean(row.co_chi_tieu) } as TieuChiConfig;
}

export async function deleteTieuChiConfig(id: number): Promise<boolean> {
  const count = await db("tieu_chi_configs").where({ id }).delete();
  return count > 0;
}

// Lưu điểm chuẩn/chỉ tiêu của 1 team cho 1 tiêu chí (upsert theo tieu_chi_id
// + team_name) — dùng để chỉnh trực tiếp từng ô trong bảng cấu hình.
export async function setTieuChiDiemChuan(
  tieuChiId: number,
  teamName: string,
  diemChuan: string | null,
  chiTieu: string | null,
): Promise<void> {
  const trimmedTeam = teamName.trim();
  const existing = await db("tieu_chi_diem_chuan")
    .where({ tieu_chi_id: tieuChiId, team_name: trimmedTeam })
    .first();

  if (existing) {
    await db("tieu_chi_diem_chuan")
      .where({ id: existing.id })
      .update({
        diem_chuan: diemChuan?.trim() || null,
        chi_tieu: chiTieu?.trim() || null,
      });
  } else {
    await db("tieu_chi_diem_chuan").insert({
      tieu_chi_id: tieuChiId,
      team_name: trimmedTeam,
      diem_chuan: diemChuan?.trim() || null,
      chi_tieu: chiTieu?.trim() || null,
    });
  }
}
