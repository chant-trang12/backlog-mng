// [DEMO 3002] "Yêu cầu tính năng" — xem comment đầu file
// src/db/migrations/featureRequests.ts để biết bối cảnh/thiết kế.

export interface FeatureRequest {
  id: number;
  he_thong: string;
  loai_yeu_cau: string | null;
  tieu_de: string;
  mo_ta: string | null;
  ket_qua_mong_muon: string | null;
  // ===== Nhóm trường theo biểu mẫu "Quy trình số hóa" (import Excel + bảng
  // hiển thị mới) — xem featureRequest-import.service.ts. mo_ta đóng vai
  // "Mô tả từng bước đang thực hiện", he_thong đóng vai "Hệ thống cần cải
  // tiến (nếu có)" — 2 cột này GỘP với cột cũ nên không thêm lại ở đây.
  linh_vuc: string | null;
  mang: string | null;
  hoat_dong_nghiep_vu: string | null;
  quy_trinh_so_hoa: string | null;
  ma_quy_trinh: string | null;
  buoc_so_hoa: string | null;
  van_de_ton_tai: string | null;
  de_xuat_quy_trinh: string | null;
  hieu_qua_khi_thuc_hien: string | null;
  quy_trinh_hien: string | null;
  ke_hoach_software: string | null;
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
  // Metadata file đính kèm — KHÔNG gồm nội dung file (attachment_data),
  // xem stripAttachmentData() ở featureRequest.service.ts. null = chưa có
  // file nào đính kèm.
  attachment_filename: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureRequestAttachment {
  filename: string;
  mime: string;
  data: Buffer;
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
  // number | null: luồng nhập tay bắt buộc chọn (validate ở controller) —
  // riêng import Excel có thể chưa có "phòng đích" (biểu mẫu không có cột
  // này) nên cho phép null, yêu cầu này sau được gán qua Sửa.
  target_department_id: number | null;
  nguoi_de_xuat?: string;
  do_uu_tien?: string;
  linh_vuc?: string;
  mang?: string;
  hoat_dong_nghiep_vu?: string;
  quy_trinh_so_hoa?: string;
  ma_quy_trinh?: string;
  buoc_so_hoa?: string;
  van_de_ton_tai?: string;
  de_xuat_quy_trinh?: string;
  hieu_qua_khi_thuc_hien?: string;
  quy_trinh_hien?: string;
  ke_hoach_software?: string;
  // Chỉ import Excel dùng (cột "Ghi chú" trong biểu mẫu) — nhập tay để trống
  // cho luồng Duyệt/Từ chối ghi sau.
  ghi_chu_xu_ly?: string;
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
  linh_vuc?: string;
  mang?: string;
  hoat_dong_nghiep_vu?: string;
  quy_trinh_so_hoa?: string;
  ma_quy_trinh?: string;
  buoc_so_hoa?: string;
  van_de_ton_tai?: string;
  de_xuat_quy_trinh?: string;
  hieu_qua_khi_thuc_hien?: string;
  quy_trinh_hien?: string;
  ke_hoach_software?: string;
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
