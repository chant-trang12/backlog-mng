import type { Request, Response } from "express";
import { createSystem, getSystem, listSystems, SystemError, updateSystem } from "../services/system.service.js";
import { syncFeatureRequests } from "../services/systemFeature.service.js";
import { viewDepartmentId } from "./systemFeature.controller.js";
import { parsePositiveInt } from "../utils/validate.js";

const fail = (res: Response, e: unknown) => {
  if (e instanceof SystemError) return res.status(400).json({ error: e.message });
  throw e;
};

export async function listSystemsHandler(req: Request, res: Response) {
  await syncFeatureRequests();
  res.json(await listSystems(viewDepartmentId(req)));
}

export async function getSystemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const row = await getSystem(id, viewDepartmentId(req));
  if (!row) return res.status(404).json({ error: "Không tìm thấy hệ thống" });
  res.json(row);
}

export async function createSystemHandler(req: Request, res: Response) {
  try {
    res.status(201).json(await createSystem(req.body ?? {}));
  } catch (e) {
    fail(res, e);
  }
}

export async function updateSystemHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  try {
    const row = await updateSystem(id, req.body ?? {});
    if (!row) return res.status(404).json({ error: "Không tìm thấy hệ thống" });
    res.json(row);
  } catch (e) {
    fail(res, e);
  }
}
