import type { Request, Response } from "express";
import { createTag, deleteTag, listTags, updateTag } from "../services/tag.service.js";
import { isNonEmptyText, parsePositiveInt } from "../utils/validate.js";

export async function listTagsHandler(_req: Request, res: Response) {
  res.json(await listTags());
}

export async function createTagHandler(req: Request, res: Response) {
  const { ten_tag } = req.body ?? {};
  if (!isNonEmptyText(ten_tag)) {
    return res.status(400).json({ error: "Trường 'ten_tag' là bắt buộc" });
  }
  const tag = await createTag({ ten_tag });
  res.status(201).json(tag);
}

export async function updateTagHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const { ten_tag, thu_tu } = req.body ?? {};
  const tag = await updateTag(id, {
    ten_tag,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!tag) return res.status(404).json({ error: "Không tìm thấy tag" });
  res.json(tag);
}

export async function deleteTagHandler(req: Request, res: Response) {
  const id = parsePositiveInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id không hợp lệ" });
  const ok = await deleteTag(id);
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tag" });
  res.status(204).send();
}
