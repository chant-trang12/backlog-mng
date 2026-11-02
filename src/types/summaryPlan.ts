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
  chu_y?: string | null;
}

// Entry FE gửi lên cho "Lấy thông tin xếp loại" — tính Rank/KI bằng ĐÚNG
// thuật toán Ranking team đã có sẵn ở Trang chủ (08-home.js), chỉ gửi kết
// quả lên để upsert, không tính lại ở server (xem câu trả lời user: giữ
// nguyên thuật toán hiện có ở FE, không viết lại ở backend).
export interface CbnvKiEntry {
  member_id: number;
  ho_va_ten: string;
  to_nhom: string;
  xep_loai: string;
}
