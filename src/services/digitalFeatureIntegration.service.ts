import { db } from "../db/database.js";
import type {
  CreateDigitalFeatureIntegrationInput,
  DigitalFeatureIntegration,
  UpdateDigitalFeatureIntegrationInput,
} from "../types/digitalFeature.js";

// Các cột text của bảng digital_feature_integrations — dùng chung cho
// insert/update (service) và whitelist controller.
export const DIGITAL_FEATURE_INT_FIELDS = [
  "huong",
  "module_he_thong",
  "du_lieu_trao_doi",
  "co_che_tan_suat",
] as const;

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

async function featureExists(digitalFeatureId: number): Promise<boolean> {
  const row = await db("digital_features").where({ id: digitalFeatureId, is_deleted: false }).first();
  return !!row;
}

export async function getDigitalFeatureIntegration(
  id: number,
): Promise<DigitalFeatureIntegration | undefined> {
  const row = await db("digital_feature_integrations").where({ id, is_deleted: false }).first();
  return (row as DigitalFeatureIntegration) ?? undefined;
}

export async function listDigitalFeatureIntegrations(
  digitalFeatureId: number,
): Promise<DigitalFeatureIntegration[]> {
  const rows = await db("digital_feature_integrations")
    .where({ digital_feature_id: digitalFeatureId, is_deleted: false })
    .select("*")
    .orderBy("id", "asc");
  return rows as DigitalFeatureIntegration[];
}

export async function createDigitalFeatureIntegration(
  input: CreateDigitalFeatureIntegrationInput,
): Promise<DigitalFeatureIntegration> {
  if (!(await featureExists(input.digital_feature_id))) {
    throw new Error("Không tìm thấy tính năng số hoá");
  }
  const huong = input.huong.trim();
  if (!huong) {
    throw new Error("Trường 'huong' là bắt buộc");
  }
  const values: Record<string, unknown> = {
    digital_feature_id: input.digital_feature_id,
    huong,
    module_he_thong: cleanText(input.module_he_thong),
    du_lieu_trao_doi: cleanText(input.du_lieu_trao_doi),
    co_che_tan_suat: cleanText(input.co_che_tan_suat),
    updated_at: db.fn.now(),
  };
  const [created] = await db("digital_feature_integrations").insert(values).returning("*");
  return created as DigitalFeatureIntegration;
}

export async function updateDigitalFeatureIntegration(
  id: number,
  input: UpdateDigitalFeatureIntegrationInput,
): Promise<DigitalFeatureIntegration | undefined> {
  const existing = await getDigitalFeatureIntegration(id);
  if (!existing) return undefined;
  const update: Record<string, unknown> = { updated_at: db.fn.now() };
  for (const field of DIGITAL_FEATURE_INT_FIELDS) {
    if (input[field] !== undefined) update[field] = input[field];
  }
  const huong = (update.huong as string | undefined)?.trim();
  if (huong != null) {
    if (!huong) delete update.huong; // gửi rỗng = giữ giá trị cũ
    else update.huong = huong;
  }
  const affected = await db("digital_feature_integrations").where({ id }).update(update);
  if (!affected) return undefined;
  return getDigitalFeatureIntegration(id);
}

export async function deleteDigitalFeatureIntegration(id: number): Promise<boolean> {
  const affected = await db("digital_feature_integrations")
    .where({ id, is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return affected > 0;
}

// Xóa nhiều luồng tích hợp đã chọn (checkbox bảng — chỉ admin, chặn ở app.ts).
export async function deleteDigitalFeatureIntegrationList(ids: number[]): Promise<number> {
  const validIds = ids.filter((id) => Number.isInteger(id) && id > 0);
  if (validIds.length === 0) return 0;
  const count = await db("digital_feature_integrations")
    .whereIn("id", validIds)
    .where({ is_deleted: false })
    .update({ is_deleted: true, deleted_at: db.fn.now() });
  return Number(count);
}
