// Trang "Kế hoạch tổng hợp" > tab "KQ xếp loại CBNV" — xem comment đầy đủ ở
// migrations/summaryPlan.ts.

export interface CbnvXepLoaiRecord {
  id: number;
  period_id: number;
  department_id: number | null;
  member_id: number | null;
  ma_nhan_vien: string | null;
  ho_va_ten: string;
  chuc_danh: string | null;
  don_vi: string | null;
  to_nhom: string | null;
  diem_danh_gia: number | null;
  xep_loai_ket_qua: string | null;
  tuan_thu_dia_diem: string | null;
  tuan_thu_noi_quy: string | null;
  xep_loai: string | null;
  xep_loai_muc_do: string | null;
  ghi_chu_de_xuat: string | null;
  chu_y: string | null;
  created_at: string;
  updated_at: string;
}

export interface CbnvXepLoaiRecordWithDept extends CbnvXepLoaiRecord {
  department_name: string | null;
  period_label: string;
}

export interface UpsertCbnvXepLoaiInput {
  ma_nhan_vien?: string | null;
  ho_va_ten: string;
  chuc_danh?: string | null;
  don_vi?: string | null;
  to_nhom?: string | null;
  diem_danh_gia?: number | null;
  xep_loai_ket_qua?: string | null;
  tuan_thu_dia_diem?: string | null;
  tuan_thu_noi_quy?: string | null;
  xep_loai?: string | null;
  xep_loai_muc_do?: string | null;
  ghi_chu_de_xuat?: string | null;
  chu_y?: string | null;
}

// Entry FE gửi lên cho "Lấy thông tin xếp loại" — tính Rank/KI bằng ĐÚNG
// thuật toán Ranking team đã có sẵn ở Trang chủ (08-home.js), chỉ gửi kết
// quả lên để upsert, không tính lại ở server (xem câu trả lời user: giữ
// nguyên thuật toán hiện có ở FE, không viết lại ở backend). diem_danh_gia
// suy TRỰC TIẾP từ xep_loai theo bảng quy đổi user chốt (A=4.00/B=3.40/
// C=3.00, D/E chưa có — null, K không tính — null); xep_loai_ket_qua suy
// TIẾP từ diem_danh_gia theo thang 5 mức user gửi ảnh (Vượt xa yêu cầu/
// Vượt yêu cầu/Đạt yêu cầu/Gần đạt yêu cầu/Không đạt yêu cầu/Không đánh
// giá) — xem CBNV_XEP_LOAI_DIEM/cbnvXepLoaiKetQuaFromDiem ở 15-summary-plan.js.
export interface CbnvKiEntry {
  member_id: number;
  ho_va_ten: string;
  to_nhom: string;
  xep_loai: string;
  diem_danh_gia: number | null;
  xep_loai_ket_qua: string | null;
}

// ---- Tab "GNV" (giao nhiệm vụ) ----
export interface GnvGroup {
  id: number;
  period_id: number;
  department_id: number | null;
  thu_tu: number;
  ten_nhom: string;
  created_at: string;
  updated_at: string;
}

export interface GnvItem {
  id: number;
  group_id: number;
  period_id: number;
  department_id: number | null;
  task_id: number | null;
  parent_item_id: number | null;
  thu_tu: number;
  muc_tieu: string | null;
  chi_so_kpi: string | null;
  phuong_phap_do: string | null;
  don_vi_do: string | null;
  ty_trong: number | null;
  muc_toi_thieu: string | null;
  muc_mong_doi: string | null;
  muc_thach_thuc: string | null;
  ngay_bat_dau: string | null;
  ngay_hoan_thanh: string | null;
  ket_qua_thuc_hien: string | null;
  cbnv_tu_danh_gia: number | null;
  qltt_danh_gia: number | null;
  created_at: string;
  updated_at: string;
}

export type GnvItemInput = Partial<
  Omit<GnvItem, "id" | "group_id" | "period_id" | "department_id" | "task_id" | "parent_item_id" | "thu_tu" | "created_at" | "updated_at">
>;

export interface GnvGroupWithItems extends GnvGroup {
  items: GnvItem[];
}

// ---- Tab "Làm thêm giờ" ----
export interface OvertimeRecord {
  id: number;
  parent_id: number | null;
  period_id: number;
  department_id: number | null;
  ngay_tac_dong: string | null;
  noi_dung: string | null;
  so_ke_hoach: string | null;
  dia_diem: string | null;
  ma_nhan_vien: string | null;
  ho_va_ten: string;
  don_vi: string | null;
  bo_phan: string | null;
  khoang_thoi_gian: string | null;
  ca_tac_dong: string | null;
  ban_ngay_so_gio: number | null;
  ban_ngay_so_ngay: number | null;
  ban_dem_so_gio: number | null;
  ban_dem_so_ngay: number | null;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

export type UpsertOvertimeInput = Partial<
  Omit<OvertimeRecord, "id" | "parent_id" | "period_id" | "department_id" | "created_at" | "updated_at" | "ho_va_ten">
> & { ho_va_ten: string };
