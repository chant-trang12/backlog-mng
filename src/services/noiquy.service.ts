import { db } from "../db/database.js";
import type { NoiQuyOverride } from "../types/cskh.js";

export async function listNoiQuyOverrides(periodId: number): Promise<NoiQuyOverride[]> {
  const rows = await db("noiquy_overrides")
    .where({ period_id: periodId })
    .orderBy("member_name", "asc");
  return rows as NoiQuyOverride[];
}

// "Không tính đi muộn" ở tab Nội quy — ép Lượt đi muộn/Total của các nhân
// sự này về 0 trong tháng theo dõi, không phân biệt dữ liệu Chấm công gốc.
export async function setNoiQuyOverrides(periodId: number, memberNames: string[]): Promise<void> {
  await db.transaction(async (trx) => {
    for (const name of memberNames) {
      const existing = await trx("noiquy_overrides")
        .where({ period_id: periodId, member_name: name })
        .first();
      if (!existing) {
        await trx("noiquy_overrides").insert({ period_id: periodId, member_name: name });
      }
    }
  });
}

// Bỏ đánh dấu "Không tính đi muộn" — Lượt đi muộn/Total tính lại như bình
// thường theo dữ liệu Chấm công.
export async function removeNoiQuyOverrides(periodId: number, memberNames: string[]): Promise<void> {
  if (memberNames.length === 0) return;
  await db("noiquy_overrides")
    .where({ period_id: periodId })
    .whereIn("member_name", memberNames)
    .delete();
}
