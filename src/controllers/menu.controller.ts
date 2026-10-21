import type { Request, Response } from "express";
import { listDepartments } from "../services/department.service.js";
import {
  getDepartmentMenuMatrix,
  setDepartmentMenuVisibility,
  InvalidMenuTargetError,
  MENU_ITEMS,
} from "../services/menu.service.js";

// "Phân quyền theo phòng ban" (Cấu hình → Phân quyền) — admin-only (chặn ở
// app.ts theo tiền tố "/api/menu-visibility", requireAdmin).
export async function listMenuVisibilityHandler(_req: Request, res: Response) {
  const departments = await listDepartments();
  const rows = await getDepartmentMenuMatrix(departments.map((d) => d.id));
  res.json({ menuItems: MENU_ITEMS, departments, rows });
}

export async function updateMenuVisibilityHandler(req: Request, res: Response) {
  const { department_id, menu_key, is_visible } = req.body ?? {};
  const departmentId = Number(department_id);
  if (!Number.isInteger(departmentId) || departmentId <= 0) {
    return res.status(400).json({ error: "Trường 'department_id' không hợp lệ." });
  }
  if (typeof menu_key !== "string" || typeof is_visible !== "boolean") {
    return res.status(400).json({ error: "Thiếu menu_key/is_visible." });
  }
  try {
    const row = await setDepartmentMenuVisibility(departmentId, menu_key, is_visible);
    res.json(row);
  } catch (err) {
    if (err instanceof InvalidMenuTargetError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}
