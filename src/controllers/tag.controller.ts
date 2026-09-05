import type { Request, Response } from "express";
import { createTag, deleteTag, listTags, updateTag } from "../services/tag.service.js";

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function listTagsHandler(_req: Request, res: Response) {
  res.json(listTags());
}

export async function createTagHandler(req: Request, res: Response) {
  const { ten_tag } = req.body ?? {};
  if (!isNonEmptyText(ten_tag)) {
    return res.status(400).json({ error: "Trường 'ten_tag' là bắt buộc" });
  }
  const tag = createTag({ ten_tag });
  res.status(201).json(tag);
}

export async function updateTagHandler(req: Request, res: Response) {
  const { ten_tag, thu_tu } = req.body ?? {};
  const tag = updateTag(Number(req.params.id), {
    ten_tag,
    thu_tu: thu_tu !== undefined ? Number(thu_tu) : undefined,
  });
  if (!tag) return res.status(404).json({ error: "Không tìm thấy tag" });
  res.json(tag);
}

export async function deleteTagHandler(req: Request, res: Response) {
  const ok = deleteTag(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: "Không tìm thấy tag" });
  res.status(204).send();
}
