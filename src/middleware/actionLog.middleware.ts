import type { Request, Response, NextFunction } from "express";
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
// Không chặn/làm chậm response thật: buildDescription() chạy đồng bộ (rẻ,
// chỉ xử lý chuỗi) NGAY khi request tới, còn recordActionLog() (có query
// DB) chỉ gọi SAU khi response đã gửi xong (res.on("finish")) và tự nuốt
// lỗi — action log không bao giờ được làm hỏng hay làm chậm request chính.

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Segment đầu tiên của path (Express đã cắt "/api" — xem req.path, giống
// requireWrite ở auth.middleware.ts) -> nhãn module + tên đối tượng tiếng
// Việt để ghép câu mô tả. Không cần phủ tuyệt đối mọi route — segment lạ
// thì fallback dùng thẳng segment làm tên đối tượng.
const MODULE_LABELS: Record<string, { module: string; entity: string }> = {
  tasks: { module: "Backlog", entity: "Nhiệm vụ" },
  "task-members": { module: "Backlog", entity: "Nhân sự tham gia task" },
  periods: { module: "Backlog", entity: "Tháng backlog" },
  teams: { module: "Team & Nhân sự", entity: "Team" },
  members: { module: "Team & Nhân sự", entity: "Nhân sự" },
  "compliance-records": { module: "Team & Nhân sự", entity: "Tuân thủ" },
  "training-records": { module: "Team & Nhân sự", entity: "Đào tạo" },
  "attendance-records": { module: "Team & Nhân sự", entity: "Chấm công" },
  "noiquy-overrides": { module: "Team & Nhân sự", entity: "Miễn trừ nội quy" },
  "danh-gia-records": { module: "Team & Nhân sự", entity: "Đánh giá" },
  incidents: { module: "CSKH", entity: "Sự cố" },
  tickets: { module: "CSKH", entity: "Ticket hỗ trợ" },
  "creation-rates": { module: "CSKH", entity: "Tỷ lệ khởi tạo" },
  "support-records": { module: "CSKH", entity: "Hỗ trợ" },
  "roadmap-items": { module: "Roadmap năm", entity: "Dòng roadmap" },
  "roadmap-details": { module: "Roadmap năm", entity: "Chi tiết công việc theo tháng" },
  "feature-requests": { module: "Yêu cầu tính năng", entity: "Yêu cầu tính năng" },
  departments: { module: "Cấu hình", entity: "Phòng ban" },
  users: { module: "Cấu hình", entity: "User" },
  tags: { module: "Cấu hình", entity: "Tag" },
  "phan-loai": { module: "Cấu hình", entity: "Phân loại" },
  nhom: { module: "Cấu hình", entity: "Nhóm" },
  "chuc-vu": { module: "Cấu hình", entity: "Chức vụ" },
  "he-thong": { module: "Cấu hình", entity: "Hệ thống" },
  "muc-tieu": { module: "Cấu hình", entity: "Mục tiêu" },
  "phan-loai-nhan-su": { module: "Cấu hình", entity: "Phân loại nhân sự" },
  "tieu-chi": { module: "Cấu hình", entity: "Tiêu chí" },
  "ranking-config": { module: "Cấu hình", entity: "Ranking team" },
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
  "name", "ten", "label", "title", "username",
];

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

function buildDescription(req: Request): { module: string | null; action: ActionLogType; description: string } {
  const segments = req.path.split("/").filter(Boolean);
  const root = segments[0] ?? "";
  const lastSegment = segments[segments.length - 1];
  const verbEntry = segments.length > 1 && !isNumericSegment(lastSegment) ? VERB_LABELS[lastSegment as string] : undefined;

  const base = MODULE_LABELS[root];
  const moduleLabel = base?.module ?? null;
  const entityLabel = base?.entity ?? (root || "Dữ liệu");

  const defaultVerb = DEFAULT_VERB[req.method] ?? { action: "cap_nhat" as ActionLogType, verb: "Thao tác" };
  const { action, verb } = verbEntry ?? defaultVerb;

  const idSegment = segments.find((s) => isNumericSegment(s));
  const idSuffix = idSegment ? ` #${idSegment}` : "";

  // Body dạng {ids:[...]} (xóa/đánh dấu hàng loạt) -> hiện số lượng thay vì
  // tên; DELETE đơn lẻ không có body đáng kể -> chỉ hiện #id; còn lại (tạo
  // mới/cập nhật 1 dòng) -> thử lấy tên gợi nhớ từ body.
  const body = req.body as unknown;
  let detail = "";
  if (body && typeof body === "object" && !Buffer.isBuffer(body) && Array.isArray((body as Record<string, unknown>).ids)) {
    detail = ` (${((body as Record<string, unknown>).ids as unknown[]).length} mục)`;
  } else if (req.method !== "DELETE") {
    const snippet = pickNameSnippet(body);
    if (snippet) detail = ` "${snippet}"`;
  }

  const description = `${verb} ${entityLabel}${idSuffix}${detail}`.trim();
  return { module: moduleLabel, action, description };
}

export function actionLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) return next();

  // Snapshot NGAY tại đây (trước khi controller phía sau xử lý/redirect) —
  // req.path/req.body không đổi tới lúc response kết thúc trong thực tế,
  // nhưng chụp sớm cho chắc, tránh phụ thuộc side-effect của handler sau.
  const method = req.method;
  const path = req.path;
  const { module: moduleLabel, action, description } = buildDescription(req);
  const appUser = req.appUser;
  const ip = req.ip ?? null;

  res.on("finish", () => {
    // Chỉ ghi khi request THỰC SỰ thành công (2xx) — request bị chặn/lỗi
    // validate (400/403/404...) không tạo ra thay đổi dữ liệu thật, ghi vào
    // sẽ gây nhiễu (VD "Xóa Nhiệm vụ #999" dù thực ra 404 không tìm thấy).
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
