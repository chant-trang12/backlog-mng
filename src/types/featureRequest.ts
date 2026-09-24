// [DEMO 3002] "Yêu cầu tính năng" — xem comment đầu file
// src/db/migrations/featureRequests.ts để biết bối cảnh/thiết kế.

export interface FeatureRequest {
  id: number;
  he_thong: string;
  loai_yeu_cau: string | null;
  tieu_de: string;
  mo_ta: string | null;
  ket_qua_mong_muon: string | null;
  thoi_gian_mong_muon: string | null;
  department_id: number | null; // phòng đề xuất (nguồn)
  target_department_id: number | null; // phòng đích (nơi tiếp nhận/xử lý)
  nguoi_de_xuat: string | null;
  do_uu_tien: string;
  // "Chờ duyệt" | "Đã duyệt" | "Từ chối" — xem comment ở migration.
  trang_thai: string;
  ghi_chu_xu_ly: string | null;
  linked_task_id: number | null;
  linked_roadmap_item_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureRequestWithDept extends FeatureRequest {
  department_name: string | null;
  target_department_name: string | null;
}

export interface CreateFeatureRequestInput {
  he_thong: string;
  loai_yeu_cau?: string;
  tieu_de: string;
  mo_ta?: string;
  ket_qua_mong_muon?: string;
  thoi_gian_mong_muon?: string;
  department_id?: number | null;
  target_department_id: number;
  nguoi_de_xuat?: string;
  do_uu_tien?: string;
}

export interface UpdateFeatureRequestInput {
  he_thong?: string;
  loai_yeu_cau?: string;
  tieu_de?: string;
  mo_ta?: string;
  ket_qua_mong_muon?: string;
  thoi_gian_mong_muon?: string;
  department_id?: number | null;
  target_department_id?: number;
  nguoi_de_xuat?: string;
  do_uu_tien?: string;
  trang_thai?: string;
  ghi_chu_xu_ly?: string;
}

export interface LoaiYeuCauOption {
  id: number;
  ten_loai: string;
  thu_tu: number;
  created_at: string;
}

export interface LinkToBacklogInput {
  period_id: number;
  team: string;
}

export interface LinkToRoadmapInput {
  year: number;
  team: string;
}
