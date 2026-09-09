import type { Request, Response } from "express";
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from "../services/department.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listDepartmentsHandler(_req: Request, res: Response) {
  res.json(await listDepartments());
}

export async function createDepartmentHandler(req: Request, res: Response) {
  const { name, code } = req.body ?? {};
  if (!isNonEmptyText(name)) {
    return res.status(400).json({ error: "Trường 'name' là bắt buộc" });
  }
  const department = await createDepartment({ name, code });
  res.status(201).json(department);
}

export async function updateDepartmentHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { name, code } = req.body ?? {};
  const department = await updateDepartment(id, { name, code });
  if (!department) return res.status(404).json({ error: "Không tìm thấy phòng" });
  res.json(department);
}

export async function deleteDepartmentHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const result = await deleteDepartment(id);
  if (!result.ok) {
    return res.status(result.reason ? 409 : 404).json({ error: result.reason ?? "Không tìm thấy phòng" });
  }
  res.status(204).send();
}
