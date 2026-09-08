import type { Request, Response } from "express";
import {
  createMember,
  deleteMember,
  deleteMembers,
  listMembers,
  updateMember,
} from "../services/member.service.js";
import { getTeam } from "../services/team.service.js";
import { getPeriod } from "../services/period.service.js";
import {
  buildMemberImportTemplate,
  importMembersFromWorkbook,
} from "../services/member-import.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

// Khai báo nhân sự mới — dạng bảng CRUD: Họ và Tên, Chức vụ, Team. Gắn theo
// period_id (tháng backlog) — xóa/sửa ở tháng nào chỉ ảnh hưởng tháng đó.
export async function createMemberHandler(req: Request, res: Response) {
  const { name, chuc_vu, team_id, period_id, tuan_thu, noi_quy, dao_tao, ho_tro, danh_gia } = req.body ?? {};
  if (!isNonEmptyText(name)) {
    return res.status(400).json({ error: "Trường 'name' là bắt buộc" });
  }
  const teamId = Number(team_id);
  const team = await getTeam(teamId);
  if (!team) {
    return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
  }
  const periodId = Number(period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }

  const member = await createMember({
    name,
    chuc_vu,
    team_id: teamId,
    period_id: periodId,
    tuan_thu,
    noi_quy,
    dao_tao,
    ho_tro,
    danh_gia,
  });
  res.status(201).json(member);
}

// GET /api/members?period_id=X — danh sách nhân sự của 1 tháng backlog.
export async function listMembersHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(await listMembers(periodId));
}

export async function updateMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });

  const { name, chuc_vu, team_id, tuan_thu, noi_quy, dao_tao, ho_tro, danh_gia } = req.body ?? {};
  if (team_id !== undefined) {
    const team = await getTeam(Number(team_id));
    if (!team) {
      return res.status(400).json({ error: "Trường 'team_id' không hợp lệ" });
    }
  }

  const member = await updateMember(id, {
    name,
    chuc_vu,
    team_id: team_id !== undefined ? Number(team_id) : undefined,
    tuan_thu,
    noi_quy,
    dao_tao,
    ho_tro,
    danh_gia,
  });
  if (!member) return res.status(404).json({ error: "Không tìm thấy nhân sự" });
  res.json(member);
}

export async function deleteMemberHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteMember(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy nhân sự" });
  res.status(204).send();
}

// GET /api/members/import-template — tải file .xlsx mẫu (3 cột: Họ và Tên,
// Chức vụ, Team) để nhập nhân sự hàng loạt.
export async function downloadMemberTemplateHandler(_req: Request, res: Response) {
  const buffer = await buildMemberImportTemplate();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="mau-nhap-nhan-su.xlsx"`);
  res.send(Buffer.from(buffer));
}

// POST /api/members/import?period_id=X — body là bytes thô của file .xlsx
// (client gửi trực tiếp File object, không dùng multipart form). Chỉ thêm
// mới, không xóa nhân sự sẵn có.
export async function importMembersHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  const period = await getPeriod(periodId);
  if (!period) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return res.status(400).json({ error: "Không nhận được nội dung file" });
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: "File vượt quá 20MB" });
  }

  try {
    const result = await importMembersFromWorkbook(periodId, buffer);
    res.status(201).json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "File không đúng định dạng Excel (.xlsx)";
    res.status(400).json({ error: message });
  }
}

// Xóa nhiều nhân sự theo checkbox đã chọn trên bảng.
export async function deleteSelectedMembersHandler(req: Request, res: Response) {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Trường 'ids' phải là mảng không rỗng" });
  }
  const deleted = await deleteMembers(ids.map((id: unknown) => Number(id)));
  res.json({ deleted });
}
