import type { Request, Response } from "express";
import {
  approveFeatureRequest,
  createFeatureRequest,
  deleteFeatureRequest,
  deleteFeatureRequestAttachment,
  getFeatureRequest,
  getFeatureRequestAttachment,
  linkFeatureRequestToBacklog,
  linkFeatureRequestToRoadmap,
  listFeatureRequests,
  listLoaiYeuCau,
  rejectFeatureRequest,
  setFeatureRequestAttachment,
  updateFeatureRequest,
} from "../services/featureRequest.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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
