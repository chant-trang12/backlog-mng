import { db } from "../db/database.js";
import type { NoiQuyOverride } from "../types/cskh.js";

export function listNoiQuyOverrides(periodId: number): NoiQuyOverride[] {
  return db
    .prepare(`SELECT * FROM noiquy_overrides WHERE period_id = ? ORDER BY member_name ASC`)
    .all(periodId) as NoiQuyOverride[];
}

// "Không tính đi muộn" ở tab Nội quy — ép Lượt đi muộn/Total của các nhân
// sự này về 0 trong tháng theo dõi, không phân biệt dữ liệu Chấm công gốc.
export function setNoiQuyOverrides(periodId: number, memberNames: string[]): void {
  const insert = db.prepare(
    `INSERT INTO noiquy_overrides (period_id, member_name) VALUES (?, ?) ON CONFLICT(period_id, member_name) DO NOTHING`,
  );
  const tx = db.transaction((names: string[]) => {
    names.forEach((name) => insert.run(periodId, name));
  });
  tx(memberNames);
}

// Bỏ đánh dấu "Không tính đi muộn" — Lượt đi muộn/Total tính lại như bình
// thường theo dữ liệu Chấm công.
export function removeNoiQuyOverrides(periodId: number, memberNames: string[]): void {
  const del = db.prepare(`DELETE FROM noiquy_overrides WHERE period_id = ? AND member_name = ?`);
  const tx = db.transaction((names: string[]) => {
    names.forEach((name) => del.run(periodId, name));
  });
  tx(memberNames);
}
