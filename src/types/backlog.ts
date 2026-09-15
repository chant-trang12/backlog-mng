export interface Period {
  id: number;
  year: number;
  month: number;
  label: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePeriodInput {
  year: number;
  month: number;
  label?: string;
}

export interface Department {
  id: number;
  name: string;
  code: string | null;
  thu_tu: number;
  // Phòng này có dùng chung danh mục Tiêu chí (department_id NULL) hay CHỈ
  // dùng đúng tiêu chí riêng của mình — xem tieuchi.service.ts.
  dung_tieu_chi_chung: boolean;
  // "theo_team" (mặc định) = KPI tính theo Team (tab Tổng hợp/Ranking);
  // "theo_task" = KPI tính trực tiếp theo từng nhân sự, cộng dồn Điểm cá
  // nhân từ các task họ tham gia (task_members), không chia theo team.
  cach_tinh_kpi: "theo_team" | "theo_task";
  created_at: string;
}

export interface Team {
  id: number;
  name: string;
  department_id: number | null;
  created_at: string;
}

export interface Member {
  id: number;
  period_id: number;
  team_id: number;
  name: string;
  chuc_vu: string | null;
  tuan_thu: string | null;
  noi_quy: string | null;
  dao_tao: string | null;
  ho_tro: string | null;
  danh_gia: string | null;
  created_at: string;
}

export interface MemberWithTeam extends Member {
  team_name: string;
}

export interface CreateMemberInput {
  period_id: number;
  team_id: number;
  name: string;
  chuc_vu?: string;
  tuan_thu?: string;
  noi_quy?: string;
  dao_tao?: string;
  ho_tro?: string;
  danh_gia?: string;
}

export interface UpdateMemberInput {
  team_id?: number;
  name?: string;
  chuc_vu?: string;
  tuan_thu?: string;
  noi_quy?: string;
  dao_tao?: string;
  ho_tro?: string;
  danh_gia?: string;
}

export type TaskStatus = "Chưa thực hiện" | "Đang thực hiện" | "Hoàn thành" | "Hủy";

export interface Task {
  id: number;
  period_id: number;
  department_id: number | null;
  stt: number;
  tinh_chat: string | null;
  khong_tinh_diem: string | null;
  tag: string | null;
  team: string;
  nhiem_vu: string;
  dod: string | null;
  ngay_thuc_hien: string | null;
  deadline: string | null;
  nvtt: string | null;
  phan_tram_hoan_thanh: number;
  trang_thai: TaskStatus;
  tien_do: string | null;
  cpo_danh_gia: number | null;
  cpo_comment: string | null;
  cpo_graded_at: string | null;
  prev_cpo_danh_gia: number | null;
  prev_cpo_comment: string | null;
  prev_cpo_graded_at: string | null;
  grading_history: string | null; // JSON: { period_label, cpo_danh_gia, cpo_comment, graded_at }[]
  da_chuyen_thang: number;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskInput {
  department_id?: number;
  tinh_chat?: string;
  tag?: string;
  team: string;
  nhiem_vu: string;
  dod?: string;
  ngay_thuc_hien?: string;
  deadline?: string;
  nvtt?: string;
  phan_tram_hoan_thanh?: number;
  trang_thai?: TaskStatus;
  tien_do?: string;
  cpo_danh_gia?: number;
  cpo_comment?: string;
}

// Cập nhật tiến độ: mọi trường đều optional, dùng chung cho cả sửa thông tin
// task lẫn cập nhật tiến độ định kỳ (% hoàn thành, trạng thái, tiến độ, CPO...).
export type UpdateTaskInput = Partial<CreateTaskInput>;

// ---- Roadmap năm (theo department_id + year) ----
export interface RoadmapItem {
  id: number;
  department_id: number | null;
  year: number;
  team: string;
  he_thong: string | null;
  muc_tieu: string | null;
  nhiem_vu: string;
  dod: string | null;
  dieu_kien_dam_bao: string | null;
  phan_loai: string | null;
  thoi_gian_bat_dau: string | null;
  thoi_gian_ket_thuc: string | null;
  trang_thai: TaskStatus;
  ghi_chu: string | null;
  synced_task_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoadmapItemInput {
  department_id?: number | null;
  year: number;
  team: string;
  he_thong?: string;
  muc_tieu?: string;
  nhiem_vu: string;
  dod?: string;
  dieu_kien_dam_bao?: string;
  phan_loai?: string | null;
  thoi_gian_bat_dau?: string;
  thoi_gian_ket_thuc?: string;
  trang_thai?: TaskStatus;
  ghi_chu?: string;
}

export type UpdateRoadmapItemInput = Partial<CreateRoadmapItemInput>;

// Nhân sự tham gia 1 task ở Backlog — quản lý sâu hơn "ai làm task này". Vai
// trò KHÔNG có danh mục riêng — lấy thẳng theo Chức vụ đã khai báo sẵn cho
// nhân sự đó ở Team & Nhân sự (member_chuc_vu, join qua members.chuc_vu).
//
// ty_le_dong_gop: % đóng góp của người này trong task (0-100) — tổng theo
// từng task không được vượt 100% (validate ở service). diem_ca_nhan: điểm
// cá nhân quy theo thang % (0-100), CHỈ có ý nghĩa khi task đã được chấm
// (tasks.cpo_danh_gia khác null) — để trống thì FE tự tính
// = cpo_danh_gia × ty_le_dong_gop / 100; nhập giá trị ở đây (FE cho nhập cả
// theo thang điểm 5, tự quy đổi sang % trước khi gửi lên) để ghi đè, chấm
// riêng cho người đó thay vì suy ra thuần theo tỷ lệ.
export interface TaskMember {
  id: number;
  task_id: number;
  member_id: number;
  ty_le_dong_gop: number | null;
  diem_ca_nhan: number | null;
  // Phân loại nhân sự tham gia (Thực hiện chính / Hỗ trợ...) — giá trị lấy
  // từ danh mục phan_loai_nhan_su_options, lưu dạng chuỗi tự do (không FK).
  phan_loai: string | null;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

// Kèm tên + chức vụ nhân sự (join bảng members) để hiển thị trực tiếp,
// không cần FE tự tra cứu lại theo member_id.
export interface TaskMemberWithName extends TaskMember {
  member_name: string;
  member_chuc_vu: string | null;
}

export interface CreateTaskMemberInput {
  member_id: number;
  ty_le_dong_gop?: number | null;
  diem_ca_nhan?: number | null;
  phan_loai?: string | null;
  ghi_chu?: string;
}

export interface UpdateTaskMemberInput {
  ty_le_dong_gop?: number | null;
  diem_ca_nhan?: number | null;
  phan_loai?: string | null;
  ghi_chu?: string;
}

// KPI nhân sự tính trực tiếp theo task (departments.cach_tinh_kpi =
// "theo_task") — cộng dồn Điểm cá nhân của 1 nhân sự từ mọi task họ tham
// gia trong 1 tháng backlog, không chia theo team. Xem
// taskMember.service.ts#listKpiTheoTask.
export interface KpiTheoTaskTaskEntry {
  task_id: number;
  nhiem_vu: string;
  team: string;
  phan_loai: string | null;
  // Trường tham chiếu/hiển thị — KHÔNG còn dùng để tính diem (xem
  // taskMember.service.ts#listKpiTheoTask).
  ty_le_dong_gop: number | null;
  cpo_danh_gia: number | null;
  // diem_ca_nhan ghi đè (nếu có) hoặc thẳng % Đánh giá (cpo_danh_gia).
  diem: number | null;
}

export interface KpiTheoTaskRow {
  member_id: number;
  member_name: string;
  member_chuc_vu: string | null;
  team_name: string | null;
  so_task: number;
  tong_diem: number;
  tasks: KpiTheoTaskTaskEntry[];
}

// Chi tiết công việc theo tháng của 1 dòng roadmap.
export interface RoadmapDetail {
  id: number;
  roadmap_item_id: number;
  month: number;
  noi_dung: string;
  trang_thai: TaskStatus;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateRoadmapDetailInput {
  month: number;
  noi_dung: string;
  trang_thai?: TaskStatus;
  ghi_chu?: string;
}

export type UpdateRoadmapDetailInput = Partial<CreateRoadmapDetailInput>;
