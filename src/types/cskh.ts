// Trang CSKH: 3 bảng CRUD theo team và theo tháng — Sự cố, Hỗ trợ ticket, Tỉ lệ khởi tạo.

// Sự cố — bộ cột chi tiết theo bảng dữ liệu mới (xem migrations/core.ts):
// giữ Tháng (period_id) + Team (team_id), 2 cột thời điểm lưu chuỗi
// "YYYY-MM-DDTHH:mm" (datetime-local, giờ local), còn lại text tự do.
export interface Incident {
  id: number;
  period_id: number;
  team_id: number;
  tao_boi: string | null;
  dich_vu_idc: string | null;
  ten_su_co: string;
  hien_tuong: string | null;
  pham_vi_anh_huong: string | null;
  nguyen_nhan: string | null;
  hanh_dong: string | null;
  thoi_diem_ghi_nhan: string | null;
  thoi_diem_hoan_thanh: string | null;
  thoi_gian_xu_ly: string | null;
  gian_doad_dich_vu: string | null;
  thoi_gian_gian_doad: string | null;
  ly_do_khong_gian_doad: string | null;
  dich_vu: string | null;
  nhom_dich_vu: string | null;
  don_vi_trach_nhiem: string | null;
  bu_site_trach_nhiem: string | null;
  cap_do_anh_huong: string | null;
  tinh_trang: string | null;
  link_ticket: string | null;
  link_itsm: string | null;
  danh_gia_sla: string | null;
  danh_gia_nguyen_nhan: string | null;
  dien_giai_vuot_sla: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentWithTeam extends Incident {
  team_name: string;
  period_label: string;
  member_count: number;
}

export interface CreateIncidentInput {
  period_id: number;
  team_id: number;
  ten_su_co: string;
  tao_boi?: string | null;
  dich_vu_idc?: string | null;
  hien_tuong?: string | null;
  pham_vi_anh_huong?: string | null;
  nguyen_nhan?: string | null;
  hanh_dong?: string | null;
  thoi_diem_ghi_nhan?: string | null;
  thoi_diem_hoan_thanh?: string | null;
  thoi_gian_xu_ly?: string | null;
  gian_doad_dich_vu?: string | null;
  thoi_gian_gian_doad?: string | null;
  ly_do_khong_gian_doad?: string | null;
  dich_vu?: string | null;
  nhom_dich_vu?: string | null;
  don_vi_trach_nhiem?: string | null;
  bu_site_trach_nhiem?: string | null;
  cap_do_anh_huong?: string | null;
  tinh_trang?: string | null;
  link_ticket?: string | null;
  link_itsm?: string | null;
  danh_gia_sla?: string | null;
  danh_gia_nguyen_nhan?: string | null;
  dien_giai_vuot_sla?: string | null;
}

export type UpdateIncidentInput = Partial<CreateIncidentInput>;

// Nhân sự liên quan sự cố (popup "Nhân sự liên quan" trang Sự cố) — join
// thêm cột members để hiển thị tên/chức vụ + trạng thái KI hiện tại.
export interface IncidentMember {
  id: number;
  incident_id: number;
  member_id: number;
  noi_dung_cong_viec: string | null;
  nguyen_nhan: string | null;
  tru_diem_luc: string | null;
  tru_diem_so_diem: number | null;
  tru_diem_ly_do: string | null;
  created_at: string;
  updated_at: string;
  member_name: string;
  member_chuc_vu: string | null;
  member_ha_ki: boolean;
  member_tang_ki: boolean;
}

export interface CreateIncidentMemberInput {
  member_id: number;
  noi_dung_cong_viec?: string | null;
  nguyen_nhan?: string | null;
}

export interface Ticket {
  id: number;
  period_id: number;
  team_id: number;
  tong_ticket: number;
  ticket_vuot: number;
  dung_han: number;
  created_at: string;
  updated_at: string;
}

// ty_le = dung_han / tong_ticket — tính khi trả về, không lưu trong DB.
export interface TicketWithTeam extends Ticket {
  team_name: string;
  period_label: string;
  ty_le: number;
}

export interface CreateTicketInput {
  period_id: number;
  team_id: number;
  tong_ticket?: number;
  ticket_vuot?: number;
  dung_han?: number;
}

export type UpdateTicketInput = Partial<CreateTicketInput>;

export interface CreationRate {
  id: number;
  period_id: number;
  team_id: number;
  so_luong_thanh_cong: number;
  so_luong_that_bai: number;
  created_at: string;
  updated_at: string;
}

// total = thanh_cong + that_bai; grand_total = thanh_cong / total — tính khi
// trả về, không lưu trong DB.
export interface CreationRateWithTeam extends CreationRate {
  team_name: string;
  period_label: string;
  total: number;
  grand_total: number;
}

export interface CreateCreationRateInput {
  period_id: number;
  team_id: number;
  so_luong_thanh_cong?: number;
  so_luong_that_bai?: number;
}

export type UpdateCreationRateInput = Partial<CreateCreationRateInput>;

// Trang Team & Nhân sự, tab Tuân thủ — theo dõi vi phạm quy trình/kế hoạch
// chung của từng nhân sự theo tháng backlog (Tháng theo dõi = period_id).
export interface ComplianceRecord {
  id: number;
  period_id: number;
  member_id: number;
  vi_pham: number;
  noi_dung: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceRecordWithDetails extends ComplianceRecord {
  member_name: string;
  team_id: number;
  team_name: string;
  period_label: string;
}

export interface CreateComplianceRecordInput {
  period_id: number;
  member_id: number;
  vi_pham?: number;
  noi_dung?: string;
}

export interface UpdateComplianceRecordInput {
  member_id?: number;
  vi_pham?: number;
  noi_dung?: string;
}

// Trang Team & Nhân sự, tab "Đào tạo nội bộ và Chứng chỉ quốc tế" — từng đợt
// đào tạo/chứng chỉ của nhân sự theo tháng backlog (Tháng theo dõi =
// period_id). Cột "Đào tạo" ở bảng Nhân sự = số lượng bản ghi (+N), không
// phải tổng 1 field số. "loai" chọn từ list cố định: "Đào tạo" / "Chứng chỉ QT".
export interface TrainingRecord {
  id: number;
  period_id: number;
  member_id: number;
  loai: string | null;
  ngay_thuc_hien: string | null;
  nguoi_xac_nhan: string | null;
  noi_dung: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingRecordWithDetails extends TrainingRecord {
  member_name: string;
  team_id: number;
  team_name: string;
  period_label: string;
}

export interface CreateTrainingRecordInput {
  period_id: number;
  member_id: number;
  loai?: string;
  ngay_thuc_hien?: string;
  nguoi_xac_nhan?: string;
  noi_dung?: string;
}

export interface UpdateTrainingRecordInput {
  member_id?: number;
  loai?: string;
  ngay_thuc_hien?: string;
  nguoi_xac_nhan?: string;
  noi_dung?: string;
}

// Trang Team & Nhân sự, tab Hỗ trợ — nhân sự (kèm team của nhân sự đó =
// "Team thực hiện hỗ trợ") hỗ trợ cho 1 team khác ("Team nhận hỗ trợ") theo
// tháng theo dõi (period_id).
export interface SupportRecord {
  id: number;
  period_id: number;
  member_id: number;
  team_nhan_ho_tro_id: number;
  noi_dung: string | null;
  ngay_ho_tro: string | null;
  nguoi_xac_nhan: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportRecordWithDetails extends SupportRecord {
  member_name: string;
  team_id: number; // team thực hiện hỗ trợ (team của member_id)
  team_name: string; // tên team thực hiện hỗ trợ
  team_nhan_ho_tro_name: string;
  period_label: string;
}

export interface CreateSupportRecordInput {
  period_id: number;
  member_id: number;
  team_nhan_ho_tro_id: number;
  noi_dung?: string;
  ngay_ho_tro?: string;
  nguoi_xac_nhan?: string;
}

export interface UpdateSupportRecordInput {
  member_id?: number;
  team_nhan_ho_tro_id?: number;
  noi_dung?: string;
  ngay_ho_tro?: string;
  nguoi_xac_nhan?: string;
}

// Trang Team & Nhân sự, tab Đánh giá — thêm/sửa theo cả 1 team cùng lúc:
// chọn team, nhập Số thứ tự cho từng nhân sự trong team đó. 1 nhân sự chỉ
// có đúng 1 bản ghi / tháng theo dõi.
export interface DanhGiaRecord {
  id: number;
  period_id: number;
  member_id: number;
  so_thu_tu: number | null;
  // Ghi chú tự do — nhập cùng Ranking ở popup "+ Thêm Đánh giá"/"Sửa",
  // không dùng trong công thức tính điểm/ranking nào.
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

export interface DanhGiaRecordWithDetails extends DanhGiaRecord {
  member_name: string;
  team_id: number;
  team_name: string;
  period_label: string;
}

export interface UpsertDanhGiaEntry {
  member_id: number;
  so_thu_tu: number;
  ghi_chu?: string | null;
}

// Trang Cấu hình, tab Tiêu chí — cấu hình tiêu chí + công thức tính điểm cho
// team, dùng chung mọi tháng backlog. Điểm chuẩn/chỉ tiêu lưu theo team_name.
// department_id null = tiêu chí DÙNG CHUNG cho mọi phòng; có giá trị = tiêu
// chí RIÊNG của đúng 1 phòng (xem listTieuChiConfigs() ở tieuchi.service.ts).
// kieu_tinh/nguon_du_lieu/he_so — công thức tính điểm cho tiêu chí này ở tab
// Tổng hợp (Home), thay cho việc hard-code theo tên trong app.js. kieu_tinh
// "khong_tinh" (mặc định) = tiêu chí thuần thông tin, không cộng vào Tổng
// điểm. Xem TIEU_CHI_KIEU_TINH ở app.js để biết đầy đủ danh sách kiểu tính +
// nguồn dữ liệu hợp lệ cho từng kiểu.
export interface TieuChiConfig {
  id: number;
  nhom: string;
  ten_tieu_chi: string;
  cach_tinh_diem: string | null;
  co_chi_tieu: boolean;
  thu_tu: number;
  department_id: number | null;
  kieu_tinh: string;
  nguon_du_lieu: string | null;
  he_so: number | null;
  created_at: string;
  updated_at: string;
}

export interface TieuChiDiemChuan {
  team_name: string;
  diem_chuan: string | null;
  chi_tieu: string | null;
}

export interface TieuChiConfigWithDiemChuan extends TieuChiConfig {
  diem_chuan: TieuChiDiemChuan[];
}

export interface CreateTieuChiConfigInput {
  nhom: string;
  ten_tieu_chi: string;
  cach_tinh_diem?: string;
  co_chi_tieu?: boolean;
  thu_tu?: number;
  department_id?: number | null;
  kieu_tinh?: string;
  nguon_du_lieu?: string | null;
  he_so?: number | null;
}

export interface UpdateTieuChiConfigInput {
  nhom?: string;
  ten_tieu_chi?: string;
  cach_tinh_diem?: string;
  co_chi_tieu?: boolean;
  thu_tu?: number;
  department_id?: number | null;
  kieu_tinh?: string;
  nguon_du_lieu?: string | null;
  he_so?: number | null;
}

// Trang Cấu hình, tab Ranking team — bảng tự do: hàng = vị trí xếp hạng, cột
// = kịch bản xếp hạng, ô = giá trị (VD A/B/C).
export interface RankingColumn {
  id: number;
  ten_cot: string;
  thu_tu: number;
}

export interface RankingCell {
  vi_tri: number;
  column_id: number;
  gia_tri: string | null;
}

export interface RankingConfigData {
  rows: number[];
  columns: RankingColumn[];
  cells: RankingCell[];
}

// Trang Team & Nhân sự, tab Chấm công — import file Excel, cột động theo
// file người dùng tải lên (không cố định schema). Mỗi dòng lưu dạng JSON
// object { [tên cột]: giá trị } trong row_data.
export interface AttendanceRecord {
  id: number;
  period_id: number;
  row_index: number;
  row_data: Record<string, string>;
  excluded_from_late: boolean;
  department_id?: number | null;
  created_at: string;
}

export interface ImportAttendanceResult {
  headers: string[];
  rows: AttendanceRecord[];
}

// Trang Team & Nhân sự, tab Nội quy — "Không tính công" ép Lượt đi
// muộn/Total của 1 nhân sự trong 1 tháng theo dõi về 0, lưu theo tên
// (member_name) vì Nội quy tổng hợp theo cột Name của Chấm công, không phải
// theo member_id (nhiều người trong file Chấm công không có trong Nhân sự).
export interface NoiQuyOverride {
  id: number;
  period_id: number;
  member_name: string;
  created_at: string;
}

// Trang Cấu hình, tab Tag & Phân loại — danh mục Tag và Phân loại (tinh_chat)
// dùng ở form nhập task Backlog, dùng chung mọi tháng backlog. Màu badge được
// gán tự động theo vị trí (thu_tu) ở phía client, không lưu trong DB.
export interface TagOption {
  id: number;
  ten_tag: string;
  thu_tu: number;
  created_at: string;
}

export interface CreateTagInput {
  ten_tag: string;
}

export interface UpdateTagInput {
  ten_tag?: string;
  thu_tu?: number;
}

// Trang Cấu hình, tab Cấu hình (Tag & Phân loại & Nhóm) — danh mục Nhóm hiển
// thị ở cột "Nhóm" của tab Tiêu chí, dùng chung mọi tháng backlog.
export interface NhomOption {
  id: number;
  ten_nhom: string;
  thu_tu: number;
  created_at: string;
}

export interface CreateNhomInput {
  ten_nhom: string;
}

export interface UpdateNhomInput {
  ten_nhom?: string;
  thu_tu?: number;
}

// Trang Cấu hình, tab Cấu hình — danh mục Chức vụ hiển thị ở dropdown "Chức
// vụ" khi thêm/sửa nhân sự (Team & Nhân sự), dùng chung mọi tháng backlog.
export interface ChucVuOption {
  id: number;
  ten_chuc_vu: string;
  thu_tu: number;
  created_at: string;
}

export interface CreateChucVuInput {
  ten_chuc_vu: string;
}

export interface UpdateChucVuInput {
  ten_chuc_vu?: string;
  thu_tu?: number;
}

export interface PhanLoaiOption {
  id: number;
  ten_phan_loai: string;
  thu_tu: number;
  created_at: string;
}

export interface CreatePhanLoaiInput {
  ten_phan_loai: string;
}

export interface UpdatePhanLoaiInput {
  ten_phan_loai?: string;
  thu_tu?: number;
}

// Danh mục Hệ thống (Website, Nội bộ...) — dùng ở Roadmap năm.
export interface HeThongOption {
  id: number;
  ten_he_thong: string;
  thu_tu: number;
  created_at: string;
}
export interface CreateHeThongInput {
  ten_he_thong: string;
}
export interface UpdateHeThongInput {
  ten_he_thong?: string;
  thu_tu?: number;
}

// Danh mục Mục tiêu (Tính năng mới, Nâng cấp tính năng...) — dùng ở Roadmap năm.
export interface MucTieuOption {
  id: number;
  ten_muc_tieu: string;
  thu_tu: number;
  created_at: string;
}
export interface CreateMucTieuInput {
  ten_muc_tieu: string;
}
export interface UpdateMucTieuInput {
  ten_muc_tieu?: string;
  thu_tu?: number;
}

// Danh mục Phân loại nhân sự tham gia task (Thực hiện chính, Hỗ trợ...) —
// dùng ở dialog "Nhân sự tham gia" của Backlog, khác với danh mục Phân loại
// của Task/Roadmap (NVKH/NVPS...).
export interface PhanLoaiNhanSuOption {
  id: number;
  ten_phan_loai: string;
  thu_tu: number;
  created_at: string;
}
export interface CreatePhanLoaiNhanSuInput {
  ten_phan_loai: string;
}
export interface UpdatePhanLoaiNhanSuInput {
  ten_phan_loai?: string;
  thu_tu?: number;
}
