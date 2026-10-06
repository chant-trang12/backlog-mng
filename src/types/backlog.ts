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
  // Phòng ban "xem full" (Quy tắc 9.2) — nhân sự thuộc phòng này xem được
  // dữ liệu nghiệp vụ của mọi phòng ban, không bị giới hạn theo phòng chủ
  // quản. VD Ban Giám đốc, PMO, Kế toán.
  is_full_access: boolean;
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
  // Nút "Hạ KI" ở tab Nhân sự — hạ KI của nhân sự này xuống 1 bậc (thang
  // A+ > A > B > C > D > E) khi hiển thị ở Home > Ranking > "Ranking thành
  // viên team". Toggle được (bấm lại để bỏ hạ). Theo period_id (mỗi tháng
  // backlog có bảng members riêng nên field này tự động cũng theo tháng).
  ha_ki: boolean;
  // Nút "Tăng KI" ở tab Nhân sự — đối nghịch với ha_ki: tăng KI của nhân
  // sự này lên 1 bậc (thang D > C > B > A > A+) khi hiển thị ở Home >
  // Ranking > "Ranking thành viên team". Loại trừ với ha_ki — bật cờ này
  // tự tắt ha_ki và ngược lại (xem updateMember, member.service.ts).
  tang_ki: boolean;
  // Lý do của lần Hạ KI/Tăng KI gần nhất — nhập bắt buộc qua popup xác nhận
  // khi bấm "Hạ KI"/"Tăng KI". Tự về null khi bấm "Bỏ hạ KI"/"Bỏ tăng KI".
  ki_ly_do: string | null;
  // Ghi chú tự do — nhập/sửa ở dialog Thêm/Sửa nhân sự (dạng textarea),
  // không dùng trong bất kỳ công thức KPI/Nội quy nào.
  ghi_chu: string | null;
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
  ghi_chu?: string;
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
  ha_ki?: boolean;
  tang_ki?: boolean;
  ki_ly_do?: string;
  ghi_chu?: string;
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
  // Cột "Đầu mối phối hợp" ở bảng Backlog (sau cột Trạng thái) — text tự do
  // (tên người/phòng ban phối hợp), nhập/sửa cùng Nhiệm vụ/DoD/Deadline.
  dau_moi_phoi_hop: string | null;
  tien_do: string | null;
  cpo_danh_gia: number | null;
  cpo_comment: string | null;
  cpo_graded_at: string | null;
  cpo_graded_by: string | null;
  prev_cpo_danh_gia: number | null;
  prev_cpo_comment: string | null;
  prev_cpo_graded_at: string | null;
  prev_cpo_graded_by: string | null;
  grading_history: string | null; // JSON: { period_label, cpo_danh_gia, cpo_comment, graded_at, graded_by }[]
  tien_do_history: string | null; // JSON: { period_label, tien_do }[] — lịch sử Tiến độ qua các tháng, cùng cơ chế với grading_history.
  da_chuyen_thang: number;
  // Id của task bản sao đã tạo ra khi "Chuyển sang tháng sau" (null nếu
  // chưa từng chuyển, hoặc dữ liệu cũ trước khi có cột này). Dùng để kiểm
  // tra bản sao CÒN TỒN TẠI hay không khi bấm chuyển lại — nếu bản sao đã
  // bị xóa (kể cả xóa mềm), cho phép chuyển lại thay vì chặn cứng theo cờ
  // da_chuyen_thang (xem moveTasksToNextMonth, task.service.ts).
  moved_to_task_id: number | null;
  // Id task thay thế được tạo khi task này bị Hủy quá sớm (chưa trôi qua
  // 1/4 thời gian mục tiêu) — xem computeElapsedFraction, task.service.ts.
  thay_the_task_id: number | null;
  // Chiều ngược lại — lưu trên chính task THAY THẾ, trỏ về id task GỐC đã
  // bị hủy. FE tự tra task gốc (cùng period) để hiển thị tách biệt với DoD.
  thay_cho_task_id: number | null;
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
  dau_moi_phoi_hop?: string;
  phan_tram_hoan_thanh?: number;
  trang_thai?: TaskStatus;
  tien_do?: string;
  cpo_danh_gia?: number;
  cpo_comment?: string;
}

// Cập nhật tiến độ: mọi trường đều optional, dùng chung cho cả sửa thông tin
// task lẫn cập nhật tiến độ định kỳ (% hoàn thành, trạng thái, tiến độ, CPO...).
export type UpdateTaskInput = Partial<CreateTaskInput> & {
  // Khai báo task thay thế — BẮT BUỘC kèm theo khi chuyển trang_thai sang
  // "Hủy" lúc chưa trôi qua 1/4 thời gian mục tiêu (xem updateTask,
  // task.service.ts). Không phải field lưu trực tiếp vào task đang sửa —
  // dùng để tạo 1 task MỚI, rồi lưu id vào thay_the_task_id của task này.
  replacement_task?: CreateTaskInput;
};

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
  // Nội dung công việc cụ thể nhân sự này đảm nhận trong task — khác Ghi
  // chú (ghi_chu là ghi chú tự do chung chung).
  noi_dung_cong_viec: string | null;
  ghi_chu: string | null;
  // "Việc cần xử lý gấp" — tick ở cột hành động bảng Nhân sự tham gia,
  // CÙNG CƠ CHẾ với task_items.treo_viec (bắt buộc lý do + tự ghi ngày).
  can_xu_ly_gap: boolean;
  can_xu_ly_gap_ly_do: string | null;
  can_xu_ly_gap_tu_ngay: string | null;
  created_at: string;
  updated_at: string;
}

// Kèm tên + chức vụ nhân sự (join bảng members) để hiển thị trực tiếp,
// không cần FE tự tra cứu lại theo member_id.
export interface TaskMemberWithName extends TaskMember {
  member_name: string;
  member_chuc_vu: string | null;
  // Tổng Giờ công/MD = SUM gio_cong của người này trên MỌI Việc (task_items)
  // của CHÍNH task — chỉ listTaskMembers() tính kèm (xem taskMember.service.ts),
  // optional vì getTaskMember() (dùng nội bộ khi tạo/sửa 1 dòng) không tính
  // lại, FE luôn gọi lại loadTaskMembers() sau đó để có số đúng.
  tong_gio_cong?: number;
  tong_md?: number;
}

export interface CreateTaskMemberInput {
  member_id: number;
  ty_le_dong_gop?: number | null;
  diem_ca_nhan?: number | null;
  phan_loai?: string | null;
  noi_dung_cong_viec?: string;
  ghi_chu?: string;
}

export interface UpdateTaskMemberInput {
  ty_le_dong_gop?: number | null;
  diem_ca_nhan?: number | null;
  phan_loai?: string | null;
  noi_dung_cong_viec?: string;
  ghi_chu?: string;
  // set true -> service tự ghi can_xu_ly_gap_tu_ngay = hôm nay (bắt buộc
  // kèm can_xu_ly_gap_ly_do); set false -> service tự clear ly do/ngày.
  can_xu_ly_gap?: boolean;
  can_xu_ly_gap_ly_do?: string;
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

// ---- "Việc" — tách nhỏ 1 Nhiệm vụ thành từng đầu việc cụ thể ----

export interface TaskItem {
  id: number;
  task_id: number;
  ten_viec: string;
  trang_thai: TaskStatus;
  treo_viec: boolean;
  treo_viec_ly_do: string | null;
  treo_viec_tu_ngay: string | null;
  diem_danh_gia: number | null;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskItemMember {
  id: number;
  task_item_id: number;
  member_id: number;
  gio_cong: number | null;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskItemMemberWithName extends TaskItemMember {
  member_name: string;
}

// Tổng giờ/MD tính sẵn (SUM gio_cong các assignee còn sống) — MD = Hours/8
// (cố định), xem taskItem.service.ts.
export interface TaskItemWithAssignees extends TaskItem {
  assignees: TaskItemMemberWithName[];
  tong_gio_cong: number;
  tong_md: number;
}

export interface CreateTaskItemInput {
  ten_viec: string;
  trang_thai?: TaskStatus;
  ghi_chu?: string;
}

export type UpdateTaskItemInput = Partial<CreateTaskItemInput> & {
  // set true -> service tự ghi treo_viec_tu_ngay = hôm nay; set false ->
  // service tự clear treo_viec_tu_ngay/treo_viec_ly_do. FE không tự gửi ngày.
  treo_viec?: boolean;
  treo_viec_ly_do?: string;
  diem_danh_gia?: number | null;
};

export interface CreateTaskItemMemberInput {
  member_id: number;
  gio_cong?: number | null;
  ghi_chu?: string;
  // Phân loại/Nội dung công việc/Ghi chú THAM GIA của người này (Thực hiện
  // chính/Hỗ trợ..., mô tả công việc, ghi chú tự do) — set luôn lên
  // task_members khi tự tạo participant (xem addTaskItemMember,
  // taskItem.service.ts), KHÔNG lưu trên task_item_members (các trường
  // này là thuộc tính của việc tham gia task nói chung, không riêng theo
  // Việc — ghi_chu ở trên vẫn ghi thêm vào task_item_members.ghi_chu song
  // song, không xung đột vì trường đó chưa dùng cho mục đích gì khác).
  phan_loai?: string;
  noi_dung_cong_viec?: string;
}

export interface UpdateTaskItemMemberInput {
  gio_cong?: number | null;
  ghi_chu?: string;
}

// Danh sách Việc đang Treo — cho card ở Trang chủ (đôn đốc).
export interface TreoViecRow {
  id: number;
  ten_viec: string;
  treo_viec_ly_do: string | null;
  treo_viec_tu_ngay: string | null;
  so_ngay_treo: number;
  task_id: number;
  task_nhiem_vu: string;
  team: string;
  assignee_names: string[];
}

// Danh sách Nhân sự đang bị đánh dấu "Việc cần xử lý gấp" — cho card ở
// Trang chủ (đôn đốc, cùng tinh thần TreoViecRow ở trên).
export interface CanXuLyGapRow {
  id: number; // task_members.id
  member_name: string;
  can_xu_ly_gap_ly_do: string | null;
  can_xu_ly_gap_tu_ngay: string | null;
  so_ngay: number;
  task_id: number;
  task_nhiem_vu: string;
  team: string;
}
