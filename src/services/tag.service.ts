import { db } from "../db/database.js";
import type { CreateTagInput, TagOption, UpdateTagInput } from "../types/cskh.js";

export async function listTags(): Promise<TagOption[]> {
  const rows = await db("tags").orderBy("thu_tu", "asc").orderBy("id", "asc");
  return rows as TagOption[];
}

export async function getTag(id: number): Promise<TagOption | undefined> {
  const row = await db("tags").where({ id }).first();
  return row as TagOption | undefined;
}

export async function createTag(input: CreateTagInput): Promise<TagOption> {
  const maxRow = await db("tags").max({ max_thu_tu: "thu_tu" }).first();
  const maxThuTu = maxRow && (maxRow as any).max_thu_tu !== null && (maxRow as any).max_thu_tu !== undefined
    ? Number((maxRow as any).max_thu_tu)
    : -1;
  const [created] = await db("tags")
    .insert({
      ten_tag: input.ten_tag.trim(),
      thu_tu: maxThuTu + 1,
    })
    .returning("*");
  return created as TagOption;
}

export async function updateTag(id: number, input: UpdateTagInput): Promise<TagOption | undefined> {
  const existing = await getTag(id);
  if (!existing) return undefined;
  const tenTag = input.ten_tag?.trim() ?? existing.ten_tag;
  const thuTu = input.thu_tu !== undefined ? input.thu_tu : existing.thu_tu;
  const [updated] = await db("tags")
    .where({ id })
    .update({ ten_tag: tenTag, thu_tu: thuTu })
    .returning("*");
  return updated as TagOption;
}

export async function deleteTag(id: number): Promise<boolean> {
  const count = await db("tags").where({ id }).delete();
  return count > 0;
}
