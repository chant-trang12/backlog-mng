import { applyUserCodes } from "./user.service.js";
import { db } from "../db/database.js";
import type {
  CbnvKiEntry,
  CbnvXepLoaiRecord,
  CbnvXepLoaiRecordWithDept,
  UpsertCbnvXepLoaiInput,
} from "../types/summaryPlan.js";
import { assertDepartmentInScope, type DataScope } from "./scope.util.js";
import { softDeleteWhere } from "./softDelete.util.js";

export async function getCbnvXepLoaiRecord(id: number): Promise<CbnvXepLoaiRecord | undefined> {
  const row = await db("cbnv_xep_loai_records").where({ id, is_deleted: false }).first();
  return row as CbnvXepLoaiRecord | undefined;
}

// Danh sách theo tháng (period_id) + phòng ban (department_id — null/
// undefined = scope.all, không lọc gì; SCOPE_EMPTY đã bị chặn ở controller
// trước khi gọi tới đây). Sắp theo Tổ nhóm rồi Họ và tên cho dễ nhìn theo
// từng team liền kề nhau, khớp đúng bố cục bảng mẫu HR user gửi.
export async function listCbnvXepLoai(periodId: number, departmentId?: number | null): Promise<CbnvXepLoaiRecordWithDept[]> {
  const query = db("cbnv_xep_loai_records as r")
    .leftJoin("departments as d", "d.id", "r.department_id")
    .leftJoin("periods as p", "p.id", "r.period_id")
    // Chức danh LẤY TỪ cột "Chức vụ" của nhân sự (tab Nhân sự, Team & Nhân
    // sự — bảng members, khớp qua member_id; user yêu cầu) — bản ghi chưa
    // khớp được nhân sự (member_id NULL) hoặc nhân sự chưa có Chức vụ thì
    // fallback về giá trị Chức danh đã lưu (Import Excel/nhập tay).
    .leftJoin("members as m", "m.id", "r.member_id")
    .select("r.*", "d.name as department_name", "p.label as period_label", "m.chuc_vu as member_chuc_vu")
    .where("r.period_id", periodId)
    .where("r.is_deleted", false);
  if (departmentId != null) query.where("r.department_id", departmentId);
  const rows = await query.orderBy("r.to_nhom", "asc").orderBy("r.ho_va_ten", "asc");
  const mapped = (rows as (CbnvXepLoaiRecordWithDept & { member_chuc_vu: string | null })[]).map((row) => {
    const { member_chuc_vu, ...rest } = row;
    return { ...rest, chuc_danh: member_chuc_vu ?? rest.chuc_danh ?? null };
  });
  return applyUserCodes(mapped);
}

export async function createCbnvXepLoaiRecords(
  periodId: number,
  departmentId: number,
  rows: UpsertCbnvXepLoaiInput[],
  scope: DataScope,
): Promise<number> {
  assertDepartmentInScope(scope, departmentId);
  if (rows.length === 0) return 0;
  await db("cbnv_xep_loai_records").insert(
    rows.map((r) => ({
      period_id: periodId,
      department_id: departmentId,
      ma_nhan_vien: r.ma_nhan_vien?.trim() || null,
      ho_va_ten: r.ho_va_ten.trim(),
      chuc_danh: r.chuc_danh?.trim() || null,
      don_vi: r.don_vi?.trim() || null,
      to_nhom: r.to_nhom?.trim() || null,
      diem_danh_gia: r.diem_danh_gia ?? null,
      xep_loai_ket_qua: r.xep_loai_ket_qua?.trim() || null,
      tuan_thu_dia_diem: r.tuan_thu_dia_diem?.trim() || null,
      tuan_thu_noi_quy: r.tuan_thu_noi_quy?.trim() || null,
      xep_loai: r.xep_loai?.trim() || null,
      xep_loai_muc_do: r.xep_loai_muc_do?.trim() || null,
      ghi_chu_de_xuat: r.ghi_chu_de_xuat?.trim() || null,
      nghi_thai_san: !!r.nghi_thai_san,
      khong_ki: !!r.khong_ki,
      chu_y: r.chu_y?.trim() || null,
    })),
  );
  return rows.length;
}

export async function updateCbnvXepLoaiRecord(
  id: number,
  input: UpsertCbnvXepLoaiInput,
  scope: DataScope,
): Promise<CbnvXepLoaiRecord | undefined> {
  const existing = await getCbnvXepLoaiRecord(id);
  if (!existing) return undefined;
  assertDepartmentInScope(scope, existing.department_id);

  const [updated] = await db("cbnv_xep_loai_records")
    .where({ id })
    .update({
      ma_nhan_vien: input.ma_nhan_vien?.trim() || null,
      ho_va_ten: input.ho_va_ten.trim(),
      chuc_danh: input.chuc_danh?.trim() || null,
      don_vi: input.don_vi?.trim() || null,
      to_nhom: input.to_nhom?.trim() || null,
      diem_danh_gia: input.diem_danh_gia ?? null,
      xep_loai_ket_qua: input.xep_loai_ket_qua?.trim() || null,
      tuan_thu_dia_diem: input.tuan_thu_dia_diem?.trim() || null,
      tuan_thu_noi_quy: input.tuan_thu_noi_quy?.trim() || null,
      xep_loai: input.xep_loai?.trim() || null,
      xep_loai_muc_do: input.xep_loai_muc_do?.trim() || null,
      ghi_chu_de_xuat: input.ghi_chu_de_xuat?.trim() || null,
      nghi_thai_san: !!input.nghi_thai_san,
      khong_ki: !!input.khong_ki,
      chu_y: input.chu_y?.trim() || null,
      updated_at: db.fn.now(),
    })
    .returning("*");
  return updated as CbnvXepLoaiRecord;
}

export async function deleteCbnvXepLoaiRecord(id: number, scope: DataScope): Promise<boolean> {
  const existing = await getCbnvXepLoaiRecord(id);
  if (!existing) return false;
  assertDepartmentInScope(scope, existing.department_id);
  const count = await softDeleteWhere(db, "cbnv_xep_loai_records", { id });
  return count > 0;
}

// "Lấy thông tin xếp loại" — nhận kết quả Rank/KI ĐÃ TÍNH SẴN ở FE (dùng
// đúng thuật toán Ranking team ở Trang chủ, không viết lại ở backend — xem
// comment CbnvKiEntry) cho TOÀN BỘ team của phòng đang xem, rồi upsert theo
// (period_id, department_id, member_id):
// - Đã có dòng cho member đó trong tháng/phòng này -> cập nhật 5 trường suy
//   ra từ ranking (ho_va_ten/to_nhom/xep_loai/diem_danh_gia/xep_loai_ket_qua
//   — 2 trường sau quy đổi DÂY CHUYỀN từ xep_loai, xem CBNV_XEP_LOAI_DIEM/
//   cbnvXepLoaiKetQuaFromDiem ở 15-summary-plan.js, nên luôn ĐI KÈM
//   xep_loai, không coi là "nhập tay"), GIỮ NGUYÊN trường nhập tay còn lại
//   (Chú ý) — tránh bấm lại nút này xoá mất dữ liệu đã nhập. RIÊNG Tuân thủ
//   địa điểm/Nội quy + Xếp loại mức độ hoàn thành: mọi nhân sự qua "Lấy
//   thông tin xếp loại" LUÔN cần hiện mặc định ("Tuân thủ"/"Tuân thủ"/
//   "Hoàn thành" — user yêu cầu) — chỉ ĐIỀN KHI CÒN TRỐNG
//   (existing?.x || "mặc định"), vẫn giữ nguyên nếu đã từng sửa tay thành
//   giá trị khác (không ghi đè lựa chọn thật).
// - Chưa có dòng -> tạo mới, điền 5 trường trên + 3 trường mặc định (Tuân
//   thủ/Tuân thủ/Hoàn thành), trường Chú ý để trống chờ nhập tay/Import.
export async function upsertKiFromRanking(
  periodId: number,
  departmentId: number,
  entries: CbnvKiEntry[],
  scope: DataScope,
): Promise<{ created: number; updated: number }> {
  assertDepartmentInScope(scope, departmentId);
  let created = 0;
  let updated = 0;
  await db.transaction(async (trx) => {
    for (const entry of entries) {
      const existing = await trx("cbnv_xep_loai_records")
        .where({ period_id: periodId, department_id: departmentId, member_id: entry.member_id, is_deleted: false })
        .first();
      if (existing) {
        await trx("cbnv_xep_loai_records").where({ id: existing.id }).update({
          ho_va_ten: entry.ho_va_ten,
          to_nhom: entry.to_nhom,
          xep_loai: entry.xep_loai,
          diem_danh_gia: entry.diem_danh_gia,
          xep_loai_ket_qua: entry.xep_loai_ket_qua,
          tuan_thu_dia_diem: (existing as any).tuan_thu_dia_diem || "Tuân thủ",
          tuan_thu_noi_quy: (existing as any).tuan_thu_noi_quy || "Tuân thủ",
          xep_loai_muc_do: (existing as any).xep_loai_muc_do || "Hoàn thành",
          updated_at: trx.fn.now(),
        });
        updated++;
      } else {
        await trx("cbnv_xep_loai_records").insert({
          period_id: periodId,
          department_id: departmentId,
          member_id: entry.member_id,
          ho_va_ten: entry.ho_va_ten,
          to_nhom: entry.to_nhom,
          xep_loai: entry.xep_loai,
          diem_danh_gia: entry.diem_danh_gia,
          xep_loai_ket_qua: entry.xep_loai_ket_qua,
          tuan_thu_dia_diem: "Tuân thủ",
          tuan_thu_noi_quy: "Tuân thủ",
          xep_loai_muc_do: "Hoàn thành",
        });
        created++;
      }
    }
  });
  return { created, updated };
}
