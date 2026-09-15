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
      department_id: input.department_id ?? null,
    })
    .returning("*");

  return { ...row, co_chi_tieu: Boolean(row.co_chi_tieu) } as TieuChiConfig;
}

export async function getTieuChiConfig(id: number): Promise<TieuChiConfig | undefined> {
  const row = await db("tieu_chi_configs").where({ id }).first();
  if (!row) return undefined;
  return { ...row, co_chi_tieu: Boolean(row.co_chi_tieu) } as TieuChiConfig;
}

// Danh sách tiêu chí "thấy được" của 1 phòng, kèm điểm chuẩn/chỉ tiêu theo
// từng team (client tự lọc/map theo team_name của tháng đang xem).
//
// 1 phòng thấy: tiêu chí DÙNG CHUNG (department_id NULL) — CHỈ khi phòng đó
// bật departments.dung_tieu_chi_chung — cộng với tiêu chí RIÊNG của chính
// phòng đó (department_id = departmentId). Không truyền departmentId (hoặc
// không tìm thấy phòng) thì chỉ trả về tiêu chí dùng chung, an toàn khi
// caller chưa xác định được phòng đang xem.
export async function listTieuChiConfigs(
  departmentId?: number | null,
): Promise<TieuChiConfigWithDiemChuan[]> {
  const query = db("tieu_chi_configs");
  if (departmentId != null) {
    const dept = await db("departments").where({ id: departmentId }).first();
    const dungChung = dept ? Boolean((dept as any).dung_tieu_chi_chung) : true;
    if (dungChung) {
      query.where((qb) => qb.whereNull("department_id").orWhere({ department_id: departmentId }));
    } else {
      query.where({ department_id: departmentId });
    }
  } else {
    query.whereNull("department_id");
  }

  const configs = (await query
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
    department_id: input.department_id !== undefined ? input.department_id : existing.department_id,
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

// Sao chép tiêu chí RIÊNG của phòng nguồn (KHÔNG gồm tiêu chí dùng chung —
// phòng đích tự thấy tiêu chí dùng chung rồi, nếu bật dùng chung, nên sao
// chép cả 2 sẽ tạo trùng lặp) thành tiêu chí RIÊNG mới của phòng đích — điểm
// chuẩn/chỉ tiêu KHÔNG copy theo (team của phòng đích khác phòng nguồn, cần
// nhập lại). Dùng để phòng ban mới "gần giống" phòng khác có ngay 1 bộ khởi
// điểm thay vì phải gõ lại từ đầu.
export async function cloneTieuChiConfigs(
  fromDepartmentId: number,
  toDepartmentId: number,
): Promise<number> {
  const source = (await db("tieu_chi_configs").where({ department_id: fromDepartmentId })) as TieuChiConfig[];
  if (source.length === 0) return 0;

  // Bỏ qua tiêu chí đã có sẵn (riêng của phòng đích, trùng nhóm + tên) —
  // bấm "Sao chép" nhiều lần không tạo trùng lặp.
  const existingOwn = await db("tieu_chi_configs")
    .where({ department_id: toDepartmentId })
    .select("nhom", "ten_tieu_chi");
  const existingKeys = new Set(existingOwn.map((r: any) => `${r.nhom}::${r.ten_tieu_chi}`));

  const rows = source
    .filter((c) => !existingKeys.has(`${c.nhom}::${c.ten_tieu_chi}`))
    .map((c) => ({
      nhom: c.nhom,
      ten_tieu_chi: c.ten_tieu_chi,
      cach_tinh_diem: c.cach_tinh_diem,
      co_chi_tieu: c.co_chi_tieu ? 1 : 0,
      thu_tu: c.thu_tu,
      department_id: toDepartmentId,
    }));
  if (rows.length === 0) return 0;
  await db("tieu_chi_configs").insert(rows);
  return rows.length;
}
