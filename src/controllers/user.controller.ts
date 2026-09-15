import type { Request, Response } from "express";
import { deleteUser, isValidRole, listUsers, updateUser } from "../services/user.service.js";
import { parsePositiveInt } from "../utils/validate.js";

// Toàn bộ route này chỉ mount sau requireAdmin (xem app.ts) — không tự kiểm
// tra role lại ở đây.

export async function listUsersHandler(_req: Request, res: Response) {
  res.json(await listUsers());
}

export async function updateUserHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });

  const { role, active } = req.body ?? {};
  if (role !== undefined && !isValidRole(role)) {
    return res.status(400).json({ error: "Trường 'role' phải là admin/editor/viewer" });
  }
  if (active !== undefined && typeof active !== "boolean") {
    return res.status(400).json({ error: "Trường 'active' phải là boolean" });
  }

  const actingUserId = req.appUser?.id;
  if (!actingUserId) return res.status(401).json({ error: "Không xác định được người dùng hiện tại" });

  const result = await updateUser(id, actingUserId, { role, active });
  if (result === undefined) return res.status(404).json({ error: "Không tìm thấy user" });
  if ("error" in result) return res.status(400).json({ error: result.error });
  res.json(result);
}

export async function deleteUserHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });

  const actingUserId = req.appUser?.id;
  if (!actingUserId) return res.status(401).json({ error: "Không xác định được người dùng hiện tại" });

  const result = await deleteUser(id, actingUserId);
  if (result === false) return res.status(404).json({ error: "Không tìm thấy user" });
  if (typeof result === "object" && "error" in result) return res.status(400).json({ error: result.error });
  res.status(204).send();
}
