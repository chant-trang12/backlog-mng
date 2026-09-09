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
  phan_loai?: string;
  thoi_gian_bat_dau?: string;
  thoi_gian_ket_thuc?: string;
  trang_thai?: TaskStatus;
  ghi_chu?: string;
}

export type UpdateRoadmapItemInput = Partial<CreateRoadmapItemInput>;
