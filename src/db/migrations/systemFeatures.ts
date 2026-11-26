import { db } from "../connection.js";
import { moveStored, saveNamedFile } from "../../utils/fileStorage.js";

// Tính năng quản lý theo Hệ thống (menu "Hệ thống & Tính năng"):
//  - system_features: mỗi tính năng thuộc 1 hệ thống (he_thong_options). system_id = NULL
//    nghĩa là "chưa phân loại" (VD yêu cầu import có tên hệ thống chưa quản lý) — chờ gán.
//    feature_request_id: tính năng được sinh tự động khi 1 Yêu cầu tính năng được DUYỆT.
//  - system_feature_docs: tài liệu đính kèm theo từng loại (doc_key khớp he_thong_options.tai_lieu_bat_buoc).
export async function migrateSystemFeatureTables(): Promise<void> {
  if (!(await db.schema.hasTable("system_features"))) {
    await db.schema.createTable("system_features", (t) => {
      t.increments("id").primary();
      t.integer("system_id").nullable();
      t.string("ma_tinh_nang", 50).notNullable();
      t.string("ten", 255).notNullable();
      t.text("mo_ta").nullable();
      t.string("muc_uu_tien", 20).notNullable().defaultTo("trung_binh");
      t.integer("don_vi_yeu_cau_id").nullable();
      t.string("nguoi_yeu_cau", 255).nullable();
      t.string("so_van_ban", 100).nullable();
      t.string("ngay_yeu_cau", 10).nullable();
      t.string("ngay_bat_dau", 10).nullable();
      t.string("han_hoan_thanh", 10).nullable();
      t.string("ngay_hoan_thanh_thuc_te", 10).nullable();
      t.integer("nguoi_phu_trach_id").nullable();
      t.string("nguoi_phu_trach_name", 255).nullable();
      t.string("trang_thai", 30).notNullable().defaultTo("chua_bat_dau");
      t.integer("feature_request_id").nullable();
      t.string("he_thong_goc", 255).nullable(); // tên hệ thống người dùng nhập ở yêu cầu (để gán lại khi chưa khớp)
      t.boolean("is_deleted").notNullable().defaultTo(false);
      t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      t.dateTime("updated_at").nullable();
    });
  }
  if (!(await db.schema.hasColumn("system_features", "fr_synced_at"))) {
    // Mốc updated_at của yêu cầu gốc ở lần đồng bộ gần nhất — chỉ khi yêu cầu đổi sau mốc này mới ghi đè các trường lấy từ yêu cầu.
    await db.schema.alterTable("system_features", (t) => t.string("fr_synced_at", 40).nullable());
  }
  if (!(await db.schema.hasTable("system_feature_docs"))) {
    await db.schema.createTable("system_feature_docs", (t) => {
      t.increments("id").primary();
      t.integer("feature_id").notNullable();
      t.string("doc_key", 60).notNullable();
      t.string("filename", 255).notNullable();
      t.string("mime", 150).notNullable();
      t.integer("size").notNullable();
      t.binary("data").notNullable();
      t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }
  // Chi tiết tính năng: tiến độ, phiên bản phát hành; tài liệu có phiên bản/ngày ban hành/ghi chú/người tải; lịch sử hoạt động.
  const addCol = async (table: string, col: string, add: (t: any) => void) => {
    if (!(await db.schema.hasColumn(table, col))) await db.schema.alterTable(table, (t) => add(t));
  };
  await addCol("system_features", "don_vi_thuc_hien_id", (t) => t.integer("don_vi_thuc_hien_id").nullable());
  await addCol("system_features", "tien_do", (t) => t.integer("tien_do").notNullable().defaultTo(0));
  await addCol("system_features", "phien_ban_phat_hanh", (t) => t.string("phien_ban_phat_hanh", 50).nullable());
  await addCol("system_feature_docs", "version", (t) => t.string("version", 30).nullable());
  await addCol("system_feature_docs", "release_date", (t) => t.string("release_date", 10).nullable());
  await addCol("system_feature_docs", "change_note", (t) => t.text("change_note").nullable());
  await addCol("system_feature_docs", "uploaded_by_name", (t) => t.string("uploaded_by_name", 255).nullable());
  if (!(await db.schema.hasTable("system_feature_events"))) {
    await db.schema.createTable("system_feature_events", (t) => {
      t.increments("id").primary();
      t.integer("feature_id").notNullable();
      t.string("kind", 20).notNullable(); // create | doc | progress | edit
      t.text("text").notNullable();
      t.string("actor", 255).nullable();
      t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }
  // Tệp tài liệu lưu trên ổ đĩa (UPLOAD_DIR), DB chỉ giữ mô tả + storage_path. Cột data giữ lại (rỗng) cho tương thích.
  await addCol("system_feature_docs", "storage_path", (t) => t.string("storage_path", 500).nullable());
  // Thư mục theo tên: <Tên hệ thống>/<Tên tính năng>.
  const folderOf = async (featureId: number): Promise<string[]> => {
    const f = await db("system_features as f").leftJoin("he_thong_options as h", "h.id", "f.system_id").where("f.id", featureId).first("f.ten", "h.ten_he_thong");
    return [f?.ten_he_thong ?? "Chưa phân loại", f?.ten ?? `Tính năng ${featureId}`];
  };
  // Chuyển một lần các tệp cũ đang nằm trong DB ra ổ đĩa (từng tệp một, không nạp tất cả vào bộ nhớ).
  const pending = (await db("system_feature_docs").whereNull("storage_path").select("id")) as { id: number }[];
  for (const { id } of pending) {
    const row = await db("system_feature_docs").where({ id }).first("id", "feature_id", "filename", "data");
    if (!row?.data || !(row.data as Buffer).length) continue;
    const rel = await saveNamedFile(["system-features", ...(await folderOf(row.feature_id))], row.filename, row.data as Buffer);
    await db("system_feature_docs").where({ id }).update({ storage_path: rel, data: Buffer.alloc(0) });
  }
  // Tệp đã lưu theo kiểu cũ (system-features/<id>/<uuid>.<đuôi>) -> chuyển sang thư mục theo tên, giữ đúng tên tệp gốc.
  const old = (await db("system_feature_docs").whereNotNull("storage_path").select("id", "feature_id", "filename", "storage_path")) as any[];
  for (const r of old) {
    if (!/^system-features\/\d+\/[0-9a-f-]{36}(\.[a-z0-9]+)?$/i.test(r.storage_path)) continue;
    try {
      const rel = await moveStored(r.storage_path, ["system-features", ...(await folderOf(r.feature_id))], r.filename);
      await db("system_feature_docs").where({ id: r.id }).update({ storage_path: rel });
    } catch (e) {
      console.error(`Không chuyển được tệp tài liệu #${r.id}:`, (e as Error).message);
    }
  }
}
