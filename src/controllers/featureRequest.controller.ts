import type { Request, Response } from "express";
import {
  approveFeatureRequest,
  createFeatureRequest,
  deleteFeatureRequest,
  deleteFeatureRequestAttachment,
  deleteFeatureRequests,
  getFeatureRequest,
  getFeatureRequestAttachment,
  linkFeatureRequestToBacklog,
  linkFeatureRequestToRoadmap,
  listFeatureRequests,
  listLoaiYeuCau,
  rejectFeatureRequest,
  setFeatureRequestAttachment,
  transferFeatureRequest,
  updateFeatureRequest,
} from "../services/featureRequest.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";
import { listDepartments } from "../services/department.service.js";
import { listHeThong } from "../services/hethong.service.js";
import {
  buildFeatureRequestImportTemplate,
  importFeatureRequestsFromWorkbook,
} from "../services/featureRequest-import.service.js";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

// [DEMO 3002 - v2] Chỉ trả yêu cầu mà phòng đang xem (?department_id=X) là
// bên đề xuất HOẶC bên đích — phòng khác không thấy, kể cả biết ID.
export async function listFeatureRequestsHandler(req: Request, res: Response) {
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  res.json(await listFeatureRequests(Number.isFinite(departmentId as number) ? departmentId : null));
}

export async function createFeatureRequestHandler(req: Request, res: Response) {
  const { he_thong, tieu_de, target_department_id } = req.body ?? {};
  if (!isNonEmptyText(he_thong) || !isNonEmptyText(tieu_de)) {
    return res.status(400).json({ error: "Trường 'he_thong' và 'tieu_de' là bắt buộc" });
  }
  const targetDepartmentId = Number(target_department_id);
  if (!Number.isFinite(targetDepartmentId) || targetDepartmentId <= 0) {
    return res.status(400).json({ error: "Trường 'target_department_id' (Phòng ban đích) là bắt buộc" });
  }
  const created = await createFeatureRequest({ ...req.body, target_department_id: targetDepartmentId });
  res.status(201).json(created);
}

// Phòng đang thao tác (?department_id=X, FE luôn gửi kèm qua deptParam())
// phải là bên đề xuất hoặc bên đích thì mới được xem/sửa/xóa — chặn cả
// việc đoán ID để truy cập yêu cầu của phòng khác, không chỉ ẩn ở list.
function isInScope(item: { department_id: number | null; target_department_id: number | null }, departmentId: number | null): boolean {
  if (departmentId == null) return false;
  return item.department_id === departmentId || item.target_department_id === departmentId;
}

export async function updateFeatureRequestHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const existing = await getFeatureRequest(id);
  if (!existing || !isInScope(existing, departmentId)) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  }
  const updated = await updateFeatureRequest(id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  res.json(updated);
}

// Xóa nhiều yêu cầu đã chọn (checkbox trên bảng) — CHỈ admin gọi tới được
// (chặn ở app.ts qua requireAdmin, scope đúng tiền tố route này, không đè
// lên toàn bộ /api/feature-requests — cùng cách làm với /api/users và
// /api/action-logs). Vẫn lọc theo isInScope() y như xóa từng cái (đề phòng
// admin đứng ở phòng A nhưng cố xóa id của phòng B/C không liên quan).
export async function deleteSelectedFeatureRequestsHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const numericIds = ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id));
  const deleted = await deleteFeatureRequests(numericIds, departmentId);
  res.json({ deleted });
}

export async function deleteFeatureRequestHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const existing = await getFeatureRequest(id);
  if (!existing || !isInScope(existing, departmentId)) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  }
  const ok = await deleteFeatureRequest(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  res.status(204).send();
}

export async function getFeatureRequestHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const item = await getFeatureRequest(id);
  if (!item || !isInScope(item, departmentId)) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  }
  res.json(item);
}

// ---- File đính kèm — cùng phạm vi xem/sửa với isInScope() ở trên (bên đề
// xuất hoặc bên đích), khác Duyệt/Từ chối/Đưa vào Backlog-Roadmap (chỉ
// phòng đích) vì đính kèm tài liệu bổ sung là việc cả 2 bên đều có thể cần
// làm trong lúc trao đổi. ----

// POST /api/feature-requests/:id/attachment?department_id=X&filename=Y —
// body là bytes thô của file (client gửi File object trực tiếp qua
// express.raw() ở route, giống mọi chỗ upload file khác trong hệ thống —
// xem member.controller.ts/task.controller.ts). filename nằm ở QUERY vì
// request kiểu byte thô không có chỗ nào khác mang được tên file gốc.
export async function uploadFeatureRequestAttachmentHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const existing = await getFeatureRequest(id);
  if (!existing || !isInScope(existing, departmentId)) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  }

  const filename = typeof req.query.filename === "string" ? req.query.filename.trim() : "";
  if (!filename) return res.status(400).json({ error: "Thiếu tên file (query 'filename')" });
  const data = req.body;
  if (!Buffer.isBuffer(data) || data.length === 0) {
    return res.status(400).json({ error: "Thiếu nội dung file" });
  }
  if (data.length > MAX_ATTACHMENT_BYTES) {
    return res.status(413).json({ error: "File vượt quá 10MB — vui lòng chọn file nhỏ hơn" });
  }

  await setFeatureRequestAttachment(id, {
    filename,
    mime: req.get("content-type") || "application/octet-stream",
    data,
  });
  res.json(await getFeatureRequest(id));
}

// GET /api/feature-requests/:id/attachment?department_id=X — tải file gốc.
export async function downloadFeatureRequestAttachmentHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const existing = await getFeatureRequest(id);
  if (!existing || !isInScope(existing, departmentId)) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  }
  const attachment = await getFeatureRequestAttachment(id);
  if (!attachment) return res.status(404).json({ error: "Yêu cầu này chưa có file đính kèm" });
  res.setHeader("Content-Type", attachment.mime || "application/octet-stream");
  // Tên file có dấu tiếng Việt -> cần cả 2 dạng trong header: filename=
  // (bản ASCII lược dấu, trình duyệt cũ không hiểu filename* sẽ dùng cái
  // này) và filename*=UTF-8''... (chuẩn RFC 5987, trình duyệt hiện đại ưu
  // tiên dùng, giữ đúng nguyên tên có dấu).
  const asciiFallback = attachment.filename.replace(/[^\x20-\x7E]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
  );
  res.send(attachment.data);
}

export async function deleteFeatureRequestAttachmentHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const existing = await getFeatureRequest(id);
  if (!existing || !isInScope(existing, departmentId)) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  }
  await deleteFeatureRequestAttachment(id);
  res.json(await getFeatureRequest(id));
}

export async function listLoaiYeuCauHandler(_req: Request, res: Response) {
  res.json(await listLoaiYeuCau());
}

// ---- Luồng Duyệt/Từ chối/Đưa vào Backlog/Roadmap — CHỈ phòng ĐÍCH được
// gọi (khác isInScope ở trên vốn cho cả 2 phía xem/sửa/xóa cơ bản). ----

async function requireTargetScope(
  req: Request,
  res: Response,
  id: number,
): Promise<Awaited<ReturnType<typeof getFeatureRequest>> | null> {
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const item = await getFeatureRequest(id);
  if (!item || departmentId == null || item.target_department_id !== departmentId) {
    res.status(404).json({ error: "Không tìm thấy yêu cầu" });
    return null;
  }
  return item;
}

export async function approveFeatureRequestHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await requireTargetScope(req, res, id))) return;
  const updated = await approveFeatureRequest(id);
  if (!updated) return res.status(400).json({ error: "Yêu cầu không ở trạng thái Chờ duyệt" });
  res.json(updated);
}

export async function rejectFeatureRequestHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await requireTargetScope(req, res, id))) return;
  const { ghi_chu } = req.body ?? {};
  const updated = await rejectFeatureRequest(id, ghi_chu);
  if (!updated) return res.status(400).json({ error: "Yêu cầu không ở trạng thái Chờ duyệt" });
  res.json(updated);
}

// Chuyển đơn vị thực hiện — đổi phòng đích sang phòng khác, yêu cầu hiển thị
// tại hộp thư của phòng MỚI thay vì phòng cũ. Được gọi từ CẢ 2 phía (đề xuất
// hoặc đích — cùng luật isInScope với Sửa), chỉ khi còn "Chờ duyệt". Phòng
// mới phải khác phòng đích hiện tại (popup đã loại sẵn, chặn lại ở server)
// và phải tồn tại trong danh mục phòng ban.
export async function transferFeatureRequestHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  const existing = await getFeatureRequest(id);
  if (!existing || !isInScope(existing, departmentId)) {
    return res.status(404).json({ error: "Không tìm thấy yêu cầu" });
  }
  const { department_id: newTargetRaw } = req.body ?? {};
  const newTargetId = Number(newTargetRaw);
  if (!Number.isFinite(newTargetId)) {
    return res.status(400).json({ error: "Trường 'department_id' (Đơn vị thực hiện mới) là bắt buộc" });
  }
  if (existing.target_department_id === newTargetId) {
    return res.status(400).json({ error: "Đơn vị thực hiện mới phải khác đơn vị hiện tại" });
  }
  const departments = await listDepartments();
  if (!departments.some((d) => d.id === newTargetId)) {
    return res.status(400).json({ error: "Đơn vị thực hiện mới không có trong danh mục phòng ban" });
  }
  const updated = await transferFeatureRequest(id, newTargetId);
  if (!updated) return res.status(400).json({ error: "Yêu cầu không ở trạng thái Chờ duyệt" });
  res.json(updated);
}

export async function linkFeatureRequestToBacklogHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await requireTargetScope(req, res, id))) return;
  const { period_id, team } = req.body ?? {};
  const periodId = Number(period_id);
  if (!Number.isFinite(periodId) || !isNonEmptyText(team)) {
    return res.status(400).json({ error: "Trường 'period_id' và 'team' là bắt buộc" });
  }
  try {
    const updated = await linkFeatureRequestToBacklog(id, { period_id: periodId, team });
    if (!updated) {
      return res.status(400).json({ error: "Yêu cầu chưa Duyệt hoặc đã đưa vào Backlog trước đó" });
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Không đưa vào Backlog được" });
  }
}

export async function linkFeatureRequestToRoadmapHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  if (!(await requireTargetScope(req, res, id))) return;
  const { year, team } = req.body ?? {};
  const yearNum = Number(year);
  if (!Number.isFinite(yearNum) || !isNonEmptyText(team)) {
    return res.status(400).json({ error: "Trường 'year' và 'team' là bắt buộc" });
  }
  const updated = await linkFeatureRequestToRoadmap(id, { year: yearNum, team });
  if (!updated) {
    return res.status(400).json({ error: "Yêu cầu chưa Duyệt hoặc đã đưa vào Roadmap trước đó" });
  }
  res.json(updated);
}

// ---- Import Excel theo biểu mẫu Quy trình số hóa ----

// GET /api/feature-requests/import-template — file .xlsx mẫu (18 cột đúng
// biểu mẫu), có dropdown chọn Hệ thống cần cải tiến (danh mục Cấu hình >
// Hệ thống), Ưu tiên + Đơn vị đề xuất (danh mục phòng ban).
export async function downloadFeatureRequestTemplateHandler(_req: Request, res: Response) {
  const [departments, heThong] = await Promise.all([listDepartments(), listHeThong()]);
  const buffer = await buildFeatureRequestImportTemplate({
    departments: departments.map((d) => d.name),
    heThong: heThong.map((h) => h.ten_he_thong),
  });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="mau-yeu-cau-tinh-nang.xlsx"`);
  res.send(Buffer.from(buffer));
}

// POST /api/feature-requests/import — body là bytes thô file .xlsx (client
// gửi File trực tiếp, express.raw() gắn ở route). Mỗi dòng = 1 yêu cầu mới
// ("Chờ duyệt", phòng đề xuất lấy từ cột "Đơn vị đề xuất" — không tự tạo
// phòng ban mới, dòng không khớp bị bỏ qua kèm lý do). Phòng ban đích lấy
// theo cột "Phòng ban thực hiện" trong file (= Phòng ban đích của form,
// khớp theo tên/mã phòng); dòng trống cột này thì fallback về phòng đang
// xem (?department_id=X) — giữ logic "phòng import = phòng đích" cho file
// cũ không có cột này.
export async function importFeatureRequestsHandler(req: Request, res: Response) {
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }
  const departmentId = req.query.department_id != null ? Number(req.query.department_id) : null;
  try {
    const result = await importFeatureRequestsFromWorkbook(buffer, Number.isFinite(departmentId) ? departmentId : null);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "File không đúng định dạng" });
  }
}
