import "dotenv/config";
import { db } from "../src/db/connection.js";

// Sửa một lần (one-off) mô tả tiếng Việt cho các log CŨ của Tính năng số
// hoá + 4 đối tượng con — tạo trước khi actionLog.middleware.ts được nâng
// cấp (commit db0c287). Đối chiếu qua cột `path` đã lưu trong action_logs:
// - Route phẳng /digital-feature-<sub>/:id (Xóa/Sửa 1 dòng): có id bản ghi
//   trên URL -> tra được cả tên bản ghi (bản ghi chỉ xóa mềm) lẫn tên tính
//   năng cha qua digital_feature_id.
// - Route lồng /digital-features/:id/<sub>[/import]: tên cha lấy từ id trên
//   URL; riêng Tạo mới không có id bản ghi trên URL nên không suy ra tên
//   dòng được -> chỉ ghép entity + tên cha.
// Chạy: npx tsx scripts/fix-action-log-descriptions.ts
// Idempotent — chỉ UPDATE khi mô tả mới khác mô tả hiện tại.

const SUB_LABELS: Record<string, { entity: string; table: string; nameColumn: string }> = {
  screens: { entity: "Màn hình, Tính năng & Phân quyền", table: "digital_feature_screens", nameColumn: "ma_mh" },
  "master-data": { entity: "Danh mục của Module", table: "digital_feature_master_data", nameColumn: "ten_danh_muc" },
  "data-objects": { entity: "Đối tượng dữ liệu & Vòng đời trạng thái", table: "digital_feature_data_objects", nameColumn: "ten_doi_tuong" },
  integrations: { entity: "Tích hợp & Sự kiện", table: "digital_feature_integrations", nameColumn: "huong" },
};

const FLAT_ROOTS: Record<string, { sub: string; verb: Record<string, string> }> = {
  "digital-feature-screens": { sub: "screens", verb: { DELETE: "Xóa", PUT: "Cập nhật", PATCH: "Cập nhật" } },
  "digital-feature-master-data": { sub: "master-data", verb: { DELETE: "Xóa", PUT: "Cập nhật", PATCH: "Cập nhật" } },
  "digital-feature-data-objects": { sub: "data-objects", verb: { DELETE: "Xóa", PUT: "Cập nhật", PATCH: "Cập nhật" } },
  "digital-feature-integrations": { sub: "integrations", verb: { DELETE: "Xóa", PUT: "Cập nhật", PATCH: "Cập nhật" } },
};

function truncate(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

async function parentName(featureId: number): Promise<string> {
  const row = await db("digital_features").where({ id: featureId }).first("module");
  const mod = row?.module;
  return typeof mod === "string" && mod.trim() ? truncate(mod) : "";
}

async function rowName(table: string, nameColumn: string, rowId: number): Promise<string> {
  const row = await db(table).where({ id: rowId }).first(nameColumn);
  const val = row?.[nameColumn];
  return typeof val === "string" && val.trim() ? truncate(val) : "";
}

async function main(): Promise<void> {
  const logs = await db("action_logs")
    .where("path", "like", "%digital-feature%")
    .select("id", "method", "path", "description");
  let updated = 0;

  for (const log of logs) {
    const segments = log.path.split("/").filter(Boolean);
    let description = "";

    if (FLAT_ROOTS[segments[0]]) {
      // /digital-feature-<sub>/:id — sửa/xóa 1 dòng
      const { sub, verb } = FLAT_ROOTS[segments[0]];
      const meta = SUB_LABELS[sub];
      const rowId = Number(segments[1]);
      if (!verb[log.method] || !Number.isFinite(rowId)) continue;
      const [name, parent] = await Promise.all([
        rowName(meta.table, meta.nameColumn, rowId),
        (async () => {
          const row = await db(meta.table).where({ id: rowId }).first("digital_feature_id");
          return row?.digital_feature_id != null ? parentName(Number(row.digital_feature_id)) : "";
        })(),
      ]);
      description = `${verb[log.method]} ${meta.entity}${name ? ` "${name}"` : ""}${
        parent ? ` — Tính năng số hoá "${parent}"` : ""
      }`;
    } else if (segments[0] === "digital-features" && segments.length >= 3 && SUB_LABELS[segments[2]]) {
      // /digital-features/:id/<sub>[/import] — tạo mới / nhập Excel / xóa hàng loạt
      const meta = SUB_LABELS[segments[2]];
      const parent = await parentName(Number(segments[1]));
      const parentSuffix = parent ? ` — Tính năng số hoá "${parent}"` : "";
      if (segments[3] === "import") {
        description = `Nhập Excel ${meta.entity}${parentSuffix}`;
      } else if (segments[3] === "delete-selected") {
        // Số lượng mục không lưu trong log cũ -> không phục hồi được, giữ
        // phần " (N mục)" chỉ khi mô tả hiện có đã mang nó.
        const count = /\((\d+) mục\)/.exec(log.description)?.[1];
        description = `Xóa hàng loạt ${meta.entity}${count ? ` (${count} mục)` : ""}${parentSuffix}`;
      } else if (log.method === "POST") {
        description = `Tạo mới ${meta.entity}${parentSuffix}`;
      }
    }

    if (description && description !== log.description) {
      await db("action_logs").where({ id: log.id }).update({ description });
      console.log(`#${log.id}: "${log.description}" -> "${description}"`);
      updated++;
    }
  }
  console.log(`\nĐã cập nhật ${updated} log.`);
  await db.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
