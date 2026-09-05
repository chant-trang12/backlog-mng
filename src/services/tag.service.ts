import { db } from "../db/database.js";
import type { CreateTagInput, TagOption, UpdateTagInput } from "../types/cskh.js";

export function listTags(): TagOption[] {
  return db.prepare(`SELECT * FROM tags ORDER BY thu_tu ASC, id ASC`).all() as TagOption[];
}

export function getTag(id: number): TagOption | undefined {
  return db.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as TagOption | undefined;
}

export function createTag(input: CreateTagInput): TagOption {
  const maxRow = db.prepare(`SELECT COALESCE(MAX(thu_tu), -1) AS max_thu_tu FROM tags`).get() as {
    max_thu_tu: number;
  };
  return db
    .prepare(`INSERT INTO tags (ten_tag, thu_tu) VALUES (?, ?) RETURNING *`)
    .get(input.ten_tag.trim(), maxRow.max_thu_tu + 1) as TagOption;
}

export function updateTag(id: number, input: UpdateTagInput): TagOption | undefined {
  const existing = getTag(id);
  if (!existing) return undefined;
  const tenTag = input.ten_tag?.trim() ?? existing.ten_tag;
  const thuTu = input.thu_tu ?? existing.thu_tu;
  return db
    .prepare(`UPDATE tags SET ten_tag = ?, thu_tu = ? WHERE id = ? RETURNING *`)
    .get(tenTag, thuTu, id) as TagOption;
}

export function deleteTag(id: number): boolean {
  return db.prepare(`DELETE FROM tags WHERE id = ?`).run(id).changes > 0;
}
