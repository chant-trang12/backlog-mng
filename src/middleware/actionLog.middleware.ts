import type { Request, Response, NextFunction } from "express";
import { db } from "../db/database.js";
import { recordActionLog } from "../services/actionLog.service.js";
import type { ActionLogType } from "../types/actionLog.js";

// Ghi Action Log TỰ ĐỘNG cho mọi request ghi (POST/PUT/PATCH/DELETE) tới
// /api — 1 middleware chung, không phải sửa tay từng service/controller
// (tránh sót module khi thêm tính năng mới sau này quên gọi log). Suy luận
// "hành động gì, trên đối tượng nào" từ path + body theo kiểu TỔNG QUÁT
// (không hiểu sâu nghiệp vụ từng module) nên mô tả chỉ mang tính TÓM TẮT,
// KHÔNG lưu nội dung trước/sau khi sửa — phạm vi đã thống nhất với người
// dùng. Đăng nhập/đăng xuất KHÔNG đi qua middleware này (route /auth/* nằm
// ngoài /api) — ghi trực tiếp ở auth.controller.ts.
//
// Không chặn/làm chậm response thật ở phần GHI (recordActionLog() chỉ gọi
// SAU khi response đã gửi xong — res.on("finish") — và tự nuốt lỗi). Riêng
// buildDescription() giờ có thể cần 1 lượt SELECT nhẹ (tra tên bản ghi theo
// id khi body không có sẵn tên — VD PUT chỉ đổi 1 field như "Hạ KI") nên
// chạy TRƯỚC next(), thêm ~1 query rẻ (theo PK, có index) vào mỗi request
// ghi — chấp nhận được, đổi lại mô tả log mới đủ rõ "sửa CÁI GÌ".

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Segment đầu tiên của path (Express đã cắt "/api" — xem req.path, giống
// requireWrite ở auth.middleware.ts) -> nhãn module + tên đối tượng tiếng
// Việt để ghép câu mô tả. table/nameColumn (khi có) dùng để TRA TÊN bản ghi
// theo id lúc body không mang sẵn tên (VD PUT chỉ gửi {ha_ki: true}) — xem
// resolveEntityName(). Không cần phủ tuyệt đối mọi route — segment lạ thì
// fallback dùng thẳng segment làm tên đối tượng, không tra tên gì cả.
const MODULE_LABELS: Record<string, { module: string; entity: string; table?: string; nameColumn?: string }> = {
  tasks: { module: "Backlog", entity: "Nhiệm vụ", table: "tasks", nameColumn: "nhiem_vu" },
  "task-members": { module: "Backlog", entity: "Nhân sự tham gia task" },
  periods: { module: "Backlog", entity: "Tháng backlog", table: "periods", nameColumn: "label" },
  teams: { module: "Team & Nhân sự", entity: "Team", table: "teams", nameColumn: "name" },
  members: { module: "Team & Nhân sự", entity: "Nhân sự", table: "members", nameColumn: "name" },
  "compliance-records": { module: "Team & Nhân sự", entity: "Tuân thủ" },
  "training-records": { module: "Team & Nhân sự", entity: "Đào tạo" },
  "attendance-records": { module: "Team & Nhân sự", entity: "Chấm công" },
  "noiquy-overrides": { module: "Team & Nhân sự", entity: "Miễn trừ nội quy" },
  "danh-gia-records": { module: "Team & Nhân sự", entity: "Đánh giá" },
  incidents: { module: "CSKH", entity: "Sự cố", table: "incidents", nameColumn: "su_co" },
  tickets: { module: "CSKH", entity: "Ticket hỗ trợ" },
  "creation-rates": { module: "CSKH", entity: "Tỷ lệ khởi tạo" },
  "support-records": { module: "CSKH", entity: "Hỗ trợ" },
  "roadmap-items": { module: "Roadmap năm", entity: "Dòng roadmap", table: "roadmap_items", nameColumn: "nhiem_vu" },
  "roadmap-details": { module: "Roadmap năm", entity: "Chi tiết công việc theo tháng" },
  "feature-requests": { module: "Yêu cầu tính năng", entity: "Yêu cầu tính năng", table: "feature_requests", nameColumn: "tieu_de" },
  departments: { module: "Cấu hình", entity: "Phòng ban", table: "departments", nameColumn: "name" },
  users: { module: "Cấu hình", entity: "User", table: "users", nameColumn: "name" },
  tags: { module: "Cấu hình", entity: "Tag", table: "tags", nameColumn: "ten_tag" },
  "phan-loai": { module: "Cấu hình", entity: "Phân loại", table: "phan_loai_options", nameColumn: "ten_phan_loai" },
  nhom: { module: "Cấu hình", entity: "Nhóm", table: "nhom_options", nameColumn: "ten_nhom" },
  "chuc-vu": { module: "Cấu hình", entity: "Chức vụ", table: "chuc_vu_options", nameColumn: "ten_chuc_vu" },
  "he-thong": { module: "Cấu hình", entity: "Hệ thống", table: "he_thong_options", nameColumn: "ten_he_thong" },
  "muc-tieu": { module: "Cấu hình", entity: "Mục tiêu", table: "muc_tieu_options", nameColumn: "ten_muc_tieu" },
  "phan-loai-nhan-su": { module: "Cấu hình", entity: "Phân loại nhân sự", table: "phan_loai_nhan_su_options", nameColumn: "ten_phan_loai" },
  "tieu-chi": { module: "Cấu hình", entity: "Tiêu chí", table: "tieu_chi_configs", nameColumn: "ten_tieu_chi" },
  "ranking-config": { module: "Cấu hình", entity: "Ranking team" },
};

// Route lồng dạng "/<root>/:id/<subResource>" (VD /tasks/:id/members,
// /roadmap-items/:id/details) — segments[0] ("tasks") KHÔNG PHẢI đối
// tượng thật sự bị tác động, mà là subResource ("members" = nhân sự tham
// gia task). Không override thì entity bị suy nhầm theo root (VD ra
// "Thêm Nhiệm vụ" trong khi thực ra là thêm 1 dòng nhân sự tham gia task)
// — khớp theo "root/subResource".
const SUB_RESOURCE_LABELS: Record<string, { module: string; entity: string }> = {
  "tasks/members": { module: "Backlog", entity: "Nhân sự tham gia task" },
  "roadmap-items/details": { module: "Roadmap năm", entity: "Chi tiết công việc theo tháng" },
};

// Segment CUỐI (khi KHÔNG phải số, VD "approve"/"delete-selected") -> hành
// động cụ thể hơn mặc định theo HTTP method.
const VERB_LABELS: Record<string, { action: ActionLogType; verb: string }> = {
  "delete-selected": { action: "xoa", verb: "Xóa hàng loạt" },
  "mark-excluded": { action: "cap_nhat", verb: "Đánh dấu loại trừ" },
  approve: { action: "cap_nhat", verb: "Duyệt" },
  reject: { action: "cap_nhat", verb: "Từ chối" },
  "to-backlog": { action: "chuyen_du_lieu", verb: "Đưa vào Backlog" },
  "to-roadmap": { action: "chuyen_du_lieu", verb: "Đưa vào Roadmap năm" },
  clone: { action: "tao_moi", verb: "Sao chép" },
  bulk: { action: "cap_nhat", verb: "Lưu hàng loạt" },
  "move-to-next-month": { action: "chuyen_du_lieu", verb: "Chuyển sang tháng sau" },
  "mark-no-score": { action: "cap_nhat", verb: "Đánh dấu Không tính điểm" },
  "unmark-no-score": { action: "cap_nhat", verb: "Bỏ đánh dấu Không tính điểm" },
  "mark-ton": { action: "cap_nhat", verb: "Đánh dấu Nhiệm vụ tồn" },
  "unmark-ton": { action: "cap_nhat", verb: "Bỏ đánh dấu Nhiệm vụ tồn" },
  import: { action: "tao_moi", verb: "Nhập Excel" },
  "diem-chuan": { action: "cap_nhat", verb: "Sửa điểm chuẩn" },
  details: { action: "tao_moi", verb: "Thêm" }, // POST /roadmap-items/:id/details
  members: { action: "tao_moi", verb: "Thêm" }, // POST /tasks/:id/members
  cells: { action: "cap_nhat", verb: "Sửa" }, // PUT /ranking-config/cells
  rows: { action: "tao_moi", verb: "Thêm dòng" },
  columns: { action: "tao_moi", verb: "Thêm cột" },
};

const DEFAULT_VERB: Record<string, { action: ActionLogType; verb: string }> = {
  POST: { action: "tao_moi", verb: "Tạo mới" },
  PUT: { action: "cap_nhat", verb: "Cập nhật" },
  PATCH: { action: "cap_nhat", verb: "Cập nhật" },
  DELETE: { action: "xoa", verb: "Xóa" },
};

// Vài trường hay dùng làm "tên gợi nhớ" của bản ghi, theo thứ tự ưu tiên —
// không cần đúng 100% mọi trường hợp, chỉ cần đủ để nhận ra là dòng nào.
const NAME_FIELDS = [
  "nhiem_vu", "tieu_de", "ten_muc_tieu", "ten_he_thong", "ten_phan_loai",
  "ten_nhom", "ten_chuc_vu", "ten_tag", "muc_tieu", "he_thong", "team",
  "name", "ten", "label", "title", "username", "su_co", "noi_dung",
];

const USER_ROLE_LABEL: Record<string, string> = { admin: "Admin", editor: "Biên tập", viewer: "Chỉ xem" };

// Vài request chỉ đổi ĐÚNG 1 field cụ thể (nút bấm/checkbox nhỏ, không phải
// form đầy đủ — VD "Hạ KI", khóa/mở tài khoản...) — method mặc định theo
// HTTP verb ("Cập nhật") không mô tả đúng Ý NGHĨA nghiệp vụ của thao tác.
// Khớp theo "root:tênField" — chỉ áp dụng khi field đó THỰC SỰ có mặt
// trong body (không quan tâm body còn field nào khác).
const FIELD_VERB_OVERRIDES: Record<string, (value: unknown) => { action: ActionLogType; verb: string }> = {
  "members:ha_ki": (v) => ({ action: "cap_nhat", verb: v ? "Hạ KI" : "Bỏ hạ KI" }),
  "users:active": (v) => ({ action: "cap_nhat", verb: v ? "Mở khóa tài khoản" : "Khóa tài khoản" }),
  "users:role": (v) => ({ action: "cap_nhat", verb: `Đổi quyền thành "${USER_ROLE_LABEL[String(v)] ?? v}"` }),
  "users:department_id": (v) => ({ action: "cap_nhat", verb: v == null ? "Gỡ gán phòng ban" : "Gán phòng ban" }),
  "departments:is_full_access": (v) => ({ action: "cap_nhat", verb: v ? `Bật "Xem full"` : `Tắt "Xem full"` }),
  "departments:dung_tieu_chi_chung": (v) => ({
    action: "cap_nhat",
    verb: v ? "Bật dùng tiêu chí chung" : "Tắt dùng tiêu chí chung",
  }),
  "departments:cach_tinh_kpi": (v) => ({ action: "cap_nhat", verb: `Đổi cách tính KPI thành "${v}"` }),
  // Cả 3 dialog "Sửa"/"Chấm điểm"/"Cập nhật tiến độ" ở Backlog đều PUT
  // /tasks/:id — chỉ khác nhau ở field nào có mặt trong body (dialog Sửa
  // luôn có "nhiem_vu", không trùng field với 2 dialog dưới). Không khai
  // báo override cho dialog Sửa — verb mặc định "Cập nhật" vẫn đúng, chỉ
  // cần TÁCH BIỆT rõ 2 dialog còn lại khỏi "Cập nhật" chung chung.
  "tasks:cpo_danh_gia": () => ({ action: "cap_nhat", verb: "Chấm điểm" }),
  "tasks:cpo_comment": () => ({ action: "cap_nhat", verb: "Chấm điểm" }),
  "tasks:phan_tram_hoan_thanh": () => ({ action: "cap_nhat", verb: "Cập nhật tiến độ" }),
};

const isNumericSegment = (s: string | undefined): boolean => !!s && /^\d+$/.test(s);

function pickNameSnippet(body: unknown): string {
  if (!body || typeof body !== "object" || Buffer.isBuffer(body) || Array.isArray(body)) return "";
  const obj = body as Record<string, unknown>;
  for (const field of NAME_FIELDS) {
    const val = obj[field];
    if (typeof val === "string" && val.trim()) {
      const trimmed = val.trim();
      return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
    }
  }
  return "";
}

// Body chỉ đổi 1 field "toggle" đã biết (VD {ha_ki: true}) -> verb cụ thể
// hơn "Cập nhật" — xem FIELD_VERB_OVERRIDES.
function pickFieldVerbOverride(root: string, body: unknown): { action: ActionLogType; verb: string } | null {
  if (!body || typeof body !== "object" || Buffer.isBuffer(body) || Array.isArray(body)) return null;
  const obj = body as Record<string, unknown>;
  for (const field of Object.keys(obj)) {
    const fn = FIELD_VERB_OVERRIDES[`${root}:${field}`];
    if (fn) return fn(obj[field]);
  }
  return null;
}

// Body không có tên (VD toggle 1 field, hoặc DELETE không có body) -> tra
// thẳng DB theo id để biết "bản ghi nào" — chỉ áp dụng khi module này có
// khai báo table/nameColumn ở MODULE_LABELS. Lỗi (bảng/cột đổi tên, id
// không tồn tại...) thì bỏ qua lặng lẽ, không được làm hỏng request chính.
async function resolveEntityName(table: string | undefined, nameColumn: string | undefined, id: string | undefined): Promise<string> {
  if (!table || !nameColumn || !id) return "";
  try {
    const row = await db(table).where({ id: Number(id) }).first(nameColumn);
    const val = row?.[nameColumn];
    if (typeof val === "string" && val.trim()) {
      const trimmed = val.trim();
      return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
    }
  } catch {
    // im lặng bỏ qua — bảng/cột không khớp (schema đổi) hoặc lỗi truy vấn.
  }
  return "";
}

// Nhiều module (Đánh giá/Sự cố/Ticket/Tỷ lệ khởi tạo/Nhân sự...) gửi
// team_id trong body — bản thân entity đó không có tên riêng biệt gì (VD
// "Lưu hàng loạt Đánh giá" cho 1 team KHÔNG nói team nào), nên LUÔN cố
// thêm " — Team <tên>" khi body có team_id, không phụ thuộc đã có
// detail (tên) hay chưa.
async function resolveTeamSuffix(body: unknown): Promise<string> {
  if (!body || typeof body !== "object" || Buffer.isBuffer(body) || Array.isArray(body)) return "";
  const teamId = (body as Record<string, unknown>).team_id;
  if (teamId == null || !Number.isFinite(Number(teamId))) return "";
  const name = await resolveEntityName("teams", "name", String(teamId));
  return name ? ` — Team ${name}` : "";
}

// "Nhân sự tham gia task" (task_members) không có cột tên riêng — chỉ có
// member_id trỏ sang members.name:
// - Tạo mới (POST /tasks/:taskId/members): member_id nằm trong BODY.
// - Sửa/Xóa (PUT|DELETE /task-members/:id): id (task_members.id) nằm trên
//   URL, phải JOIN sang members mới ra tên.
async function resolveTaskMemberName(root: string, lastSegment: string | undefined, idSegment: string | undefined, body: unknown): Promise<string> {
  try {
    if (root === "tasks" && lastSegment === "members") {
      const memberId = body && typeof body === "object" ? (body as Record<string, unknown>).member_id : undefined;
      if (memberId == null || !Number.isFinite(Number(memberId))) return "";
      return await resolveEntityName("members", "name", String(memberId));
    }
    if (root === "task-members" && idSegment) {
      const row = await db("task_members as tm")
        .join("members as m", "m.id", "tm.member_id")
        .where("tm.id", Number(idSegment))
        .first("m.name as name");
      const name = (row as { name?: string } | undefined)?.name;
      return typeof name === "string" && name.trim() ? name.trim() : "";
    }
  } catch {
    // im lặng bỏ qua — lỗi truy vấn không được làm hỏng request chính.
  }
  return "";
}

async function buildDescription(req: Request): Promise<{ module: string | null; action: ActionLogType; description: string }> {
  const segments = req.path.split("/").filter(Boolean);
  const root = segments[0] ?? "";
  const lastSegment = segments[segments.length - 1];
  const verbEntry = segments.length > 1 && !isNumericSegment(lastSegment) ? VERB_LABELS[lastSegment as string] : undefined;

  // Route lồng "/<root>/:id/<subResource>" -> ưu tiên nhãn theo subResource
  // (xem SUB_RESOURCE_LABELS), không dùng nhãn của root.
  const subKey = segments.length === 3 && isNumericSegment(segments[1]) && !isNumericSegment(segments[2]) ? `${segments[0]}/${segments[2]}` : undefined;
  const subBase = subKey ? SUB_RESOURCE_LABELS[subKey] : undefined;
  const base = subBase ?? MODULE_LABELS[root];
  const moduleLabel = base?.module ?? null;
  const entityLabel = base?.entity ?? (root || "Dữ liệu");
  const nameLookup = "table" in (base ?? {}) ? (base as { table?: string; nameColumn?: string }) : undefined;

  const body = req.body as unknown;
  const fieldOverride = !verbEntry ? pickFieldVerbOverride(root, body) : null;
  const defaultVerb = DEFAULT_VERB[req.method] ?? { action: "cap_nhat" as ActionLogType, verb: "Thao tác" };
  const { action, verb } = verbEntry ?? fieldOverride ?? defaultVerb;

  // Chỉ dùng để TRA CỨU (resolveEntityName bên dưới) — id thô (#31) không
  // có ý nghĩa gì với người xem log nên không đưa vào description nữa,
  // chỉ hiện TÊN đã tra được (hoặc không hiện gì nếu tra không ra).
  const idSegment = segments.find((s) => isNumericSegment(s));

  // Body dạng {ids:[...]} (xóa/đánh dấu hàng loạt) -> hiện số lượng thay vì
  // tên; còn lại -> thử lấy tên gợi nhớ từ body, không có thì tra DB theo
  // id (bù cho các request chỉ gửi 1 field không phải tên, VD {ha_ki:true},
  // hoặc DELETE không có body đáng kể) — "Nhân sự tham gia task" tra riêng
  // qua resolveTaskMemberName() vì không có table/nameColumn đơn giản.
  let detail = "";
  if (body && typeof body === "object" && !Buffer.isBuffer(body) && Array.isArray((body as Record<string, unknown>).ids)) {
    detail = ` (${((body as Record<string, unknown>).ids as unknown[]).length} mục)`;
  } else {
    const snippet = req.method !== "DELETE" ? pickNameSnippet(body) : "";
    const resolved =
      snippet ||
      (await resolveTaskMemberName(root, lastSegment, idSegment, body)) ||
      (await resolveEntityName(nameLookup?.table, nameLookup?.nameColumn, idSegment));
    if (resolved) detail = ` "${resolved}"`;
  }

  const teamSuffix = await resolveTeamSuffix(body);
  const description = `${verb} ${entityLabel}${detail}${teamSuffix}`.trim();
  return { module: moduleLabel, action, description };
}

export async function actionLogMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!WRITE_METHODS.has(req.method)) return next();

  // Snapshot NGAY tại đây (trước khi controller phía sau xử lý/redirect) —
  // req.path/req.body không đổi tới lúc response kết thúc trong thực tế,
  // nhưng chụp sớm cho chắc, tránh phụ thuộc side-effect của handler sau.
  const method = req.method;
  const path = req.path;
  const appUser = req.appUser;
  const ip = req.ip ?? null;

  let moduleLabel: string | null = null;
  let action: ActionLogType = "cap_nhat";
  let description = "";
  try {
    ({ module: moduleLabel, action, description } = await buildDescription(req));
  } catch {
    // Không dựng được mô tả (lỗi tra DB...) -> vẫn tiếp tục request chính
    // bình thường, chỉ đơn giản không ghi được log ý nghĩa cho lần này.
    return next();
  }

  res.on("finish", () => {
    // Chỉ ghi khi request THỰC SỰ thành công (2xx) — request bị chặn/lỗi
    // validate (400/403/404...) không tạo ra thay đổi dữ liệu thật, ghi vào
    // sẽ gây nhiễu (VD ghi "Đã xóa" dù thực ra 404 không tìm thấy).
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    void recordActionLog({
      user_id: appUser?.id ?? null,
      user_name: appUser?.name ?? null,
      department_id: appUser?.department_id ?? null,
      action,
      module: moduleLabel,
      description,
      method,
      path,
      ip,
    });
  });

  next();
}
