import type { Request, Response } from "express";
import {
  getPermissionMatrix,
  updateRolePermission,
  InvalidPermissionTargetError,
  PERMISSION_FUNCTIONS,
  PERMISSION_ROLES,
} from "../services/permission.service.js";

export async function listPermissionsHandler(_req: Request, res: Response) {
  const rows = await getPermissionMatrix();
  res.json({ functions: PERMISSION_FUNCTIONS, roles: PERMISSION_ROLES, rows });
}

export async function updatePermissionHandler(req: Request, res: Response) {
  const { function_key, role, can_read, can_add, can_edit } = req.body ?? {};
  if (typeof function_key !== "string" || typeof role !== "string") {
    return res.status(400).json({ error: "Thiếu function_key/role." });
  }
  try {
    const row = await updateRolePermission(function_key, role, {
      can_read: typeof can_read === "boolean" ? can_read : undefined,
      can_add: typeof can_add === "boolean" ? can_add : undefined,
      can_edit: typeof can_edit === "boolean" ? can_edit : undefined,
    });
    res.json(row);
  } catch (err) {
    if (err instanceof InvalidPermissionTargetError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
}
