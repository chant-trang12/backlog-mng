import { db } from "../db/database.js";
import type { OvertimeRecord, UpsertOvertimeInput } from "../types/summaryPlan.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";
import { parseDateToIso } from "./workbook.util.js";

export class OvertimeError extends Error {}

// Danh sách Địa điểm tác động (chọn từ list ở popup/file mẫu/import).
export const OVERTIME_LOCATIONS = ["TT DL Hòa Lạc", "TT DL Pháp Vân", "TT DL Hoàng Hoa Thám", "TT DL Bình Dương"] as const;
// Khoảng thời gian tác động: chọn Ban ngày / Ban đêm.
export const OVERTIME_PERIODS = ["Tác động ban ngày", "Tác động ban đêm"] as const;
const locKey = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

const txt = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};
const num = (v: unknown, label: string): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new OvertimeError(`"${label}" phải là số không âm.`);
  return n;
};

// Phần RIÊNG của từng nhân sự (dòng con chỉ lưu phần này): Mã NV, Họ và Tên, Đơn vị.
export function normalizePerson(input: UpsertOvertimeInput) {
  const hoVaTen = txt(input.ho_va_ten);
  if (!hoVaTen) throw new OvertimeError('Trường "Họ và Tên" là bắt buộc.');
  return {
    ma_nhan_vien: txt(input.ma_nhan_vien),
    ho_va_ten: hoVaTen,
    don_vi: txt(input.don_vi),
  };
}

// Phần Bộ phận + thời gian/số giờ/Ghi chú DÙNG CHUNG cho mọi nhân sự của 1 lượt tác động (chỉ dòng đầu lưu).
function normalizeTiming(input: UpsertOvertimeInput) {
  // Ca tác động: "Tác động ban ngày"/"Tác động ban đêm" (nhận thêm "ban ngày"/"ban đêm"
  // viết ngắn, không phân biệt hoa/thường). Ban ngày -> số liệu ban đêm = 0, ban
  // đêm -> số liệu ban ngày = 0; để trống thì giữ cả hai (dữ liệu cũ/import không rõ ca).
  let ca = txt(input.ca_tac_dong);
  if (ca) {
    const k = locKey(ca);
    const match = OVERTIME_PERIODS.find((p) => locKey(p) === k || locKey(p) === `tác động ${k}`);
    if (!match) throw new OvertimeError(`"Tác động" phải là một trong: ${OVERTIME_PERIODS.join(", ")}.`);
    ca = match;
  }
  // Số ngày = Số giờ / 8 (tự tính, làm tròn 2 chữ số) — bỏ qua Số ngày client/file gửi lên.
  const toDays = (gio: number | null) => (gio == null ? null : Math.round((gio / 8) * 100) / 100);
  const dayHours = num(input.ban_ngay_so_gio, "Ban ngày - Số giờ");
  const nightHours = num(input.ban_dem_so_gio, "Ban đêm - Số giờ");
  const isDay = ca === "Tác động ban ngày";
  const isNight = ca === "Tác động ban đêm";
  return {
    bo_phan: txt(input.bo_phan),
    khoang_thoi_gian: txt(input.khoang_thoi_gian),
    ca_tac_dong: ca,
    // Chọn ca nào thì số liệu ca còn lại = 0.
    ban_ngay_so_gio: isNight ? 0 : dayHours,
    ban_ngay_so_ngay: isNight ? 0 : toDays(dayHours),
    ban_dem_so_gio: isDay ? 0 : nightHours,
    ban_dem_so_ngay: isDay ? 0 : toDays(nightHours),
    ghi_chu: txt(input.ghi_chu),
  };
}

// Phần DÙNG CHUNG của 1 lượt tác động (chỉ dòng đầu lưu): Ngày, Nội dung, Số kế hoạch,
// Địa điểm + Khoảng thời gian, ca ban ngày/đêm, số giờ/số ngày, Ghi chú.
export function normalizeShared(input: UpsertOvertimeInput, keepLocation?: string | null) {
  let ngay: string | null = null;
  if (txt(input.ngay_tac_dong)) {
    ngay = parseDateToIso(String(input.ngay_tac_dong)) || null;
    if (!ngay) throw new OvertimeError('"Ngày tác động/làm thêm giờ" không hợp lệ.');
  }
  // Địa điểm phải thuộc danh sách (không phân biệt hoa/thường); giữ nguyên giá
  // trị cũ ngoài danh sách khi sửa dòng mà không đổi địa điểm (dữ liệu trước đây).
  let diaDiem = txt(input.dia_diem);
  if (diaDiem) {
    const match = OVERTIME_LOCATIONS.find((l) => locKey(l) === locKey(diaDiem as string));
    if (match) diaDiem = match;
    else if (diaDiem !== keepLocation) {
      throw new OvertimeError(`"Địa điểm tác động" phải là một trong: ${OVERTIME_LOCATIONS.join(", ")}.`);
    }
  }
  return {
    ngay_tac_dong: ngay,
    noi_dung: txt(input.noi_dung),
    so_ke_hoach: txt(input.so_ke_hoach),
    dia_diem: diaDiem,
    ...normalizeTiming(input),
  };
}

// Dòng đầu = phần dùng chung + nhân sự đầu tiên.
export function normalizeOvertime(input: UpsertOvertimeInput, keepLocation?: string | null) {
  return { ...normalizeShared(input, keepLocation), ...normalizePerson(input) };
}

export async function getOvertimeRecord(id: number): Promise<OvertimeRecord | undefined> {
  return (await db("overtime_records").where({ id, is_deleted: false }).first()) as OvertimeRecord | undefined;
}

// Theo tháng + phòng ban (departmentId null = scope.all, không lọc; SCOPE_EMPTY
// đã bị chặn ở controller). Thứ tự: lượt tác động theo ngày rồi id, mỗi lượt
// là dòng đầu rồi tới các nhân sự tham gia thêm.
export async function listOvertime(periodId: number, departmentId?: number | null): Promise<OvertimeRecord[]> {
  const q = db("overtime_records").where({ period_id: periodId, is_deleted: false });
  if (departmentId != null) q.where({ department_id: departmentId });
  const all = (await q.orderBy("id", "asc")) as OvertimeRecord[];
  const heads = all
    .filter((r) => r.parent_id == null)
    .sort((a, b) => (a.ngay_tac_dong ?? "").localeCompare(b.ngay_tac_dong ?? "") || a.id - b.id);
  return heads.flatMap((h) => [h, ...all.filter((r) => r.parent_id === h.id)]);
}

// Tạo hàng loạt các lượt tác động (mỗi khối = dòng đầu + nhân sự thêm) — dùng
// cho thêm tay (1 khối 1 dòng) và Import.
export async function createOvertimeBlocks(
  periodId: number,
  departmentId: number | null,
  blocks: { head: UpsertOvertimeInput; children: UpsertOvertimeInput[] }[],
  scope: DataScope,
): Promise<number> {
  if (departmentId == null) throw new OvertimeError("Hãy chọn 1 phòng ban cụ thể trước.");
  assertDepartmentInScope(scope, departmentId);
  let count = 0;
  await db.transaction(async (trx) => {
    for (const b of blocks) {
      const [head] = await trx("overtime_records")
        .insert({ period_id: periodId, department_id: departmentId, ...normalizeOvertime(b.head) })
        .returning("*");
      count++;
      for (const c of b.children) {
        await trx("overtime_records").insert({
          period_id: periodId,
          department_id: departmentId,
          parent_id: (head as OvertimeRecord).id,
          ...normalizePerson(c),
        });
        count++;
      }
    }
  });
  return count;
}

// Thêm 1 nhân sự tham gia vào lượt tác động có sẵn.
export async function addOvertimePerson(parentId: number, input: UpsertOvertimeInput, scope: DataScope): Promise<OvertimeRecord> {
  const parent = await getOvertimeRecord(parentId);
  if (!parent || parent.parent_id != null) throw new OvertimeError("Không tìm thấy lượt tác động để thêm nhân sự.");
  assertDepartmentInScope(scope, parent.department_id);
  const [row] = await db("overtime_records")
    .insert({ period_id: parent.period_id, department_id: parent.department_id, parent_id: parent.id, ...normalizePerson(input) })
    .returning("*");
  return row as OvertimeRecord;
}

export async function updateOvertimeRecord(id: number, input: UpsertOvertimeInput, scope: DataScope): Promise<OvertimeRecord | undefined> {
  const existing = await getOvertimeRecord(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, existing.department_id);
  // Dòng con chỉ cập nhật phần riêng của nhân sự (phần dùng chung thuộc dòng đầu).
  const fields = existing.parent_id != null ? normalizePerson(input) : normalizeOvertime(input, existing.dia_diem);
  const [row] = await db("overtime_records").where({ id }).update({ ...fields, updated_at: db.fn.now() }).returning("*");
  return row as OvertimeRecord;
}

export async function deleteOvertimeRecord(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getOvertimeRecord(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, existing.department_id);
  await db.transaction(async (trx) => {
    // Xoá dòng đầu thì xoá luôn các nhân sự tham gia thêm của lượt đó.
    if (existing.parent_id == null) await softDeleteWhere(trx as any, "overtime_records", { parent_id: id });
    await softDeleteWhere(trx as any, "overtime_records", { id });
  });
  return true;
}
