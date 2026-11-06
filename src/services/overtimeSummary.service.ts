import { applyUserCodes } from "./user.service.js";
import { db } from "../db/database.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";

export class OvertimeSummaryError extends Error {}

// Quy định luật lao động dùng để tính các cột đánh giá.
export const LIMIT_MONTH_HOURS = 40;
export const LIMIT_YEAR_HOURS = 200;
export const EVAL_IN_LIMIT = "Trong giới hạn số giờ theo quy định của luật lao động";
export const EVAL_OVER_LIMIT = "Quá số giờ theo quy định của luật lao động";

export interface SummaryInput {
  ma_nhan_vien?: string | null;
  ho_va_ten: string;
  don_vi?: string | null;
  bo_phan?: string | null;
  ban_ngay_so_gio?: number | string | null;
  ban_dem_so_gio?: number | string | null;
  tong_cac_thang_truoc_nhap?: number | string | null;
  ghi_chu?: string | null;
}

const txt = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};
const num = (v: unknown, label: string): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new OvertimeSummaryError(`"${label}" phải là số không âm.`);
  return n;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const days = (h: number | null) => (h == null ? null : round2(h / 8)); // Số ngày = Số giờ / 8

// Chuẩn hoá dữ liệu NHẬP (Số ngày tự tính từ Số giờ).
export function normalizeSummary(i: SummaryInput) {
  const name = txt(i.ho_va_ten);
  if (!name) throw new OvertimeSummaryError('Trường "Họ và Tên" là bắt buộc.');
  const dg = num(i.ban_ngay_so_gio, "Ban ngày - Số giờ");
  const eg = num(i.ban_dem_so_gio, "Ban đêm - Số giờ");
  return {
    ma_nhan_vien: txt(i.ma_nhan_vien),
    ho_va_ten: name,
    don_vi: txt(i.don_vi),
    bo_phan: txt(i.bo_phan),
    ban_ngay_so_gio: dg,
    ban_ngay_so_ngay: days(dg),
    ban_dem_so_gio: eg,
    ban_dem_so_ngay: days(eg),
    tong_cac_thang_truoc_nhap: num(i.tong_cac_thang_truoc_nhap, "Tổng số giờ làm thêm các tháng trước"),
    ghi_chu: txt(i.ghi_chu),
  };
}

type Person = { ma_nhan_vien: string | null; ho_va_ten: string };
const nameKey = (r: Person) => r.ho_va_ten.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
const maKey = (r: Person) => (r.ma_nhan_vien ?? "").trim().toLowerCase();
// Cùng 1 nhân sự: cả hai có mã NV thì so mã; thiếu mã ở 1 bên thì so họ tên.
const samePerson = (a: Person, b: Person) => (maKey(a) && maKey(b) ? maKey(a) === maKey(b) : nameKey(a) === nameKey(b));

export interface SummaryRow {
  id: number;
  period_id: number;
  department_id: number | null;
  ma_nhan_vien: string | null;
  ho_va_ten: string;
  don_vi: string | null;
  bo_phan: string | null;
  ban_ngay_so_gio: number | null;
  ban_ngay_so_ngay: number | null;
  ban_dem_so_gio: number | null;
  ban_dem_so_ngay: number | null;
  tong_cac_thang_truoc_nhap: number | null;
  ghi_chu: string | null;
  // các cột TÍNH
  tong_thang: number;
  vuot_quy_dinh: number;
  danh_gia_thang: string;
  tong_cac_thang_truoc: number;
  luy_ke: number;
  ty_le: number; // % so với 200h/năm
  danh_gia_nam: string;
}

// Danh sách theo tháng + phòng ban kèm các cột tính toán:
//  tổng tháng = giờ ban ngày + giờ ban đêm; vượt = tổng tháng - 40 nếu tổng > 40, ngược lại 0; đánh giá tháng: vượt = 0 "Trong giới hạn số giờ theo quy định của luật lao động" / vượt > 0 "Quá số giờ theo quy định của luật lao động";
//  tổng các tháng trước = số nhập tay nếu có, KHÔNG thì cộng tổng tháng của CÙNG NHÂN SỰ (khớp mã NV, không có thì họ tên) ở các tháng
//  trước trong cùng năm + cùng phòng; lũy kế = trước + tháng này; tỷ lệ = lũy kế / 200h; đánh giá năm: <=200h "Trong giới hạn số giờ theo quy định của luật lao động" / >200h "Quá số giờ theo quy định của luật lao động".
export async function listSummary(periodId: number, departmentId?: number | null) {
  const period = (await db("periods").where({ id: periodId }).first()) as { id: number; year: number; month: number } | undefined;
  const q = db("overtime_summary_records").where({ period_id: periodId, is_deleted: false });
  if (departmentId != null) q.where({ department_id: departmentId });
  const rows = (await q.orderBy("id", "asc")) as any[];

  // Lũy kế chạy của từng nhân sự qua các tháng TRƯỚC trong cùng năm (cùng phòng ban), theo thứ tự tháng:
  //   lũy kế tháng m = "Tổng các tháng trước" của tháng m + tổng tháng m,
  //   "Tổng các tháng trước" của tháng m = số NHẬP TAY nếu có, KHÔNG thì = LŨY KẾ của tháng gần nhất trước đó có nhân sự này.
  // => tháng n+1 tự lấy "Tổng các tháng trước" = "Lũy kế" của tháng n (kể cả khi tháng n có nhập tay số các tháng trước).
  const chain: { p: Person; luyKe: number }[] = [];
  if (period && rows.length) {
    const eq = db("overtime_summary_records as r")
      .join("periods as p", "p.id", "r.period_id")
      .where({ "r.is_deleted": false, "p.year": period.year })
      .where("p.month", "<", period.month);
    if (departmentId != null) eq.where("r.department_id", departmentId);
    const prev = (await eq.orderBy("p.month", "asc").orderBy("r.id", "asc").select("r.ma_nhan_vien", "r.ho_va_ten", "r.ban_ngay_so_gio", "r.ban_dem_so_gio", "r.tong_cac_thang_truoc_nhap")) as any[];
    for (const r of prev) {
      let e = chain.find((c) => samePerson(c.p, r));
      if (!e) {
        e = { p: r, luyKe: 0 };
        chain.push(e);
      }
      const truoc = r.tong_cac_thang_truoc_nhap != null ? r.tong_cac_thang_truoc_nhap : e.luyKe;
      e.luyKe = round2(truoc + (r.ban_ngay_so_gio ?? 0) + (r.ban_dem_so_gio ?? 0));
    }
  }

  const out: SummaryRow[] = rows.map((r) => {
    const tong = round2((r.ban_ngay_so_gio ?? 0) + (r.ban_dem_so_gio ?? 0));
    // Vượt quy định = tổng tháng - 40 nếu tổng > 40, ngược lại 0.
    const vuot = tong > LIMIT_MONTH_HOURS ? round2(tong - LIMIT_MONTH_HOURS) : 0;
    const truoc = round2(r.tong_cac_thang_truoc_nhap != null ? r.tong_cac_thang_truoc_nhap : chain.find((c) => samePerson(c.p, r))?.luyKe ?? 0);
    const luyKe = round2(truoc + tong);
    return {
      ...r,
      tong_thang: tong,
      vuot_quy_dinh: vuot,
      // Đánh giá tháng theo số giờ vượt: = 0 -> "Trong giới hạn...", > 0 -> "Quá số giờ...".
      danh_gia_thang: vuot === 0 ? EVAL_IN_LIMIT : EVAL_OVER_LIMIT,
      tong_cac_thang_truoc: truoc,
      luy_ke: luyKe,
      ty_le: round2((luyKe / LIMIT_YEAR_HOURS) * 100),
      // Đánh giá năm giống đánh giá tháng: lũy kế <= 200h "Trong giới hạn...", > 200h "Quá số giờ...".
      danh_gia_nam: luyKe > LIMIT_YEAR_HOURS ? EVAL_OVER_LIMIT : EVAL_IN_LIMIT,
    };
  });
  return { period, rows: await applyUserCodes(out) };
}

export async function getSummaryRecord(id: number) {
  return (await db("overtime_summary_records").where({ id, is_deleted: false }).first()) as any | undefined;
}

export async function createSummaryRecords(periodId: number, departmentId: number | null, inputs: SummaryInput[], scope: DataScope): Promise<number> {
  if (departmentId == null) throw new OvertimeSummaryError("Hãy chọn 1 phòng ban cụ thể trước.");
  assertDepartmentInScope(scope, departmentId);
  const rows = inputs.map((i) => ({ period_id: periodId, department_id: departmentId, nguon: "nhap_tay", ...normalizeSummary(i) }));
  if (rows.length) await db.batchInsert("overtime_summary_records", rows, 50);
  return rows.length;
}

export async function updateSummaryRecord(id: number, input: SummaryInput, scope: DataScope) {
  const existing = await getSummaryRecord(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, existing.department_id);
  const [row] = await db("overtime_summary_records").where({ id }).update({ ...normalizeSummary(input), updated_at: db.fn.now() }).returning("*");
  return row;
}

export async function deleteSummaryRecord(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getSummaryRecord(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, existing.department_id);
  return (await softDeleteWhere(db, "overtime_summary_records", { id })) > 0;
}

// "Lấy từ Chi tiết": ĐỒNG BỘ với tab Chi tiết làm thêm giờ cùng tháng + phòng:
//  - nhân sự có trong Chi tiết: cộng giờ ban ngày/ban đêm, thêm mới dòng tổng hợp hoặc cập nhật số giờ (Mã NV/Đơn vị/Bộ phận chỉ điền vào chỗ trống);
//  - dòng tổng hợp KHÔNG còn nhân sự đó trong Chi tiết (đã xoá bên Chi tiết) -> bị xoá, trừ dòng do người dùng NHẬP TAY/Import.
// dryRun = true: chỉ tính, trả danh sách để người dùng xác nhận (không ghi gì).
export async function importFromDetail(
  periodId: number,
  departmentId: number | null,
  scope: DataScope,
  dryRun = false,
): Promise<{ created: number; updated: number; removed: number; removed_names: string[] }> {
  if (departmentId == null) throw new OvertimeSummaryError("Hãy chọn 1 phòng ban cụ thể trước.");
  assertDepartmentInScope(scope, departmentId);
  const detail = (await db("overtime_records").where({ period_id: periodId, department_id: departmentId, is_deleted: false }).orderBy("id", "asc")) as any[];
  const heads = new Map<number, any>(detail.filter((r) => r.parent_id == null).map((r) => [r.id, r]));
  const sums: { sample: any; dg: number; eg: number; ma: string | null; don_vi: string | null; bo_phan: string | null }[] = [];
  for (const r of detail) {
    const head = r.parent_id == null ? r : heads.get(r.parent_id);
    if (!head) continue;
    let cur = sums.find((s) => samePerson(s.sample, r));
    if (!cur) {
      cur = { sample: r, dg: 0, eg: 0, ma: null, don_vi: null, bo_phan: null };
      sums.push(cur);
    }
    // Mã NV/Đơn vị của nhân sự; Bộ phận nằm ở DÒNG ĐẦU của lượt tác động (dùng chung) — lấy giá trị đầu tiên có nội dung.
    cur.ma ||= r.ma_nhan_vien ?? null;
    cur.don_vi ||= r.don_vi ?? null;
    cur.bo_phan ||= head.bo_phan ?? null;
    // Giá trị giờ dùng chung nằm ở dòng đầu của lượt tác động; mỗi nhân sự của lượt nhận cùng số giờ đó.
    cur.dg += head.ban_ngay_so_gio ?? 0;
    cur.eg += head.ban_dem_so_gio ?? 0;
  }
  const existing = (await db("overtime_summary_records").where({ period_id: periodId, department_id: departmentId, is_deleted: false })) as any[];
  const matched = new Set<number>();
  let created = 0;
  let updated = 0;
  const plan = sums.map((s) => ({ s, hit: existing.find((e) => samePerson(e, s.sample)) }));
  for (const p of plan) {
    if (p.hit) {
      matched.add(p.hit.id);
      updated++;
    } else created++;
  }
  const stale = existing.filter((e) => !matched.has(e.id) && e.nguon !== "nhap_tay");
  const result = { created, updated, removed: stale.length, removed_names: stale.map((e) => e.ho_va_ten as string) };
  if (dryRun) return result;

  await db.transaction(async (trx) => {
    for (const { s, hit } of plan) {
      const dg = round2(s.dg);
      const eg = round2(s.eg);
      const vals = { ban_ngay_so_gio: dg, ban_ngay_so_ngay: days(dg), ban_dem_so_gio: eg, ban_dem_so_ngay: days(eg) };
      if (hit) {
        // Cập nhật số giờ; Mã NV/Đơn vị/Bộ phận chỉ ĐIỀN VÀO chỗ đang trống (không ghi đè nội dung đã nhập).
        await trx("overtime_summary_records")
          .where({ id: hit.id })
          .update({ ...vals, ma_nhan_vien: hit.ma_nhan_vien || s.ma, don_vi: hit.don_vi || s.don_vi, bo_phan: hit.bo_phan || s.bo_phan, nguon: hit.nguon ?? "chi_tiet", updated_at: trx.fn.now() });
      } else {
        await trx("overtime_summary_records").insert({
          period_id: periodId,
          department_id: departmentId,
          ma_nhan_vien: s.ma,
          ho_va_ten: s.sample.ho_va_ten,
          don_vi: s.don_vi,
          bo_phan: s.bo_phan,
          nguon: "chi_tiet",
          ...vals,
        });
      }
    }
    for (const e of stale) await softDeleteWhere(trx as any, "overtime_summary_records", { id: e.id });
  });
  return result;
}

// ---- Bảng "Tổng hợp đơn vị": mục tiêu 6 tháng cuối năm (nhập, sửa được) | lũy kế thực hiện đến tháng hiện tại (nhập, sửa được) |
// còn được thực hiện đến tháng 12 (= mục tiêu - lũy kế, chỉ có khi đã nhập cả hai).
export interface UnitSummary {
  department_id: number | null;
  department_name: string | null;
  year: number;
  month: number;
  target_hours: number | null;
  luy_ke: number | null;
  con_lai: number | null;
}

export async function getUnitSummary(periodId: number, departmentId: number | null): Promise<UnitSummary | null> {
  const period = (await db("periods").where({ id: periodId }).first()) as { id: number; year: number; month: number } | undefined;
  if (!period) return null;
  const dept = departmentId != null ? ((await db("departments").where({ id: departmentId }).select("name").first()) as { name: string } | undefined) : undefined;
  const t = departmentId != null ? ((await db("overtime_unit_targets").where({ department_id: departmentId, year: period.year }).first()) as { target_hours: number | null } | undefined) : undefined;
  // Lũy kế thực hiện đến tháng: số NHẬP TAY (không còn lấy từ tổng cột "Lũy kế" của bảng); để trống nếu chưa nhập.
  const p = departmentId != null ? ((await db("overtime_unit_progress").where({ department_id: departmentId, period_id: periodId }).first()) as { luy_ke_hours: number | null } | undefined) : undefined;
  const luyKe = p?.luy_ke_hours ?? null;
  const target = t?.target_hours ?? null;
  return {
    department_id: departmentId,
    department_name: dept?.name ?? null,
    year: period.year,
    month: period.month,
    target_hours: target,
    luy_ke: luyKe,
    con_lai: target == null || luyKe == null ? null : round2(target - luyKe),
  };
}

export async function setUnitTarget(periodId: number, departmentId: number | null, hours: unknown, scope: DataScope, luyKe?: unknown): Promise<UnitSummary | null> {
  if (departmentId == null) throw new OvertimeSummaryError("Hãy chọn 1 phòng ban cụ thể trước.");
  assertDepartmentInScope(scope, departmentId);
  const period = (await db("periods").where({ id: periodId }).first()) as { year: number } | undefined;
  if (!period) throw new OvertimeSummaryError("Tháng không hợp lệ.");
  // Mỗi trường chỉ cập nhật khi client gửi (undefined = giữ nguyên).
  if (hours !== undefined) {
    const value = num(hours, "Tổng số giờ làm thêm mục tiêu 6 tháng cuối năm");
    const hit = await db("overtime_unit_targets").where({ department_id: departmentId, year: period.year }).first();
    if (hit) await db("overtime_unit_targets").where({ id: hit.id }).update({ target_hours: value, updated_at: db.fn.now() });
    else await db("overtime_unit_targets").insert({ department_id: departmentId, year: period.year, target_hours: value });
  }
  if (luyKe !== undefined) {
    const value = num(luyKe, "Tổng số giờ làm thêm lũy kế thực hiện");
    const hit = await db("overtime_unit_progress").where({ department_id: departmentId, period_id: periodId }).first();
    if (hit) await db("overtime_unit_progress").where({ id: hit.id }).update({ luy_ke_hours: value, updated_at: db.fn.now() });
    else await db("overtime_unit_progress").insert({ department_id: departmentId, period_id: periodId, luy_ke_hours: value });
  }
  return getUnitSummary(periodId, departmentId);
}
