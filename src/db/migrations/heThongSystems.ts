import { db } from "../connection.js";

// Mở rộng he_thong_options (danh mục "Cấu hình > Hệ thống") thành hồ sơ hệ thống
// của menu "Hệ thống & Tính năng" — CÙNG MỘT bảng nên thêm/sửa/xoá ở bên nào
// cũng hiện ở bên kia. Chỉ thêm cột (có giá trị mặc định), không đổi dữ liệu cũ.
export async function migrateHeThongSystemColumns(): Promise<void> {
  const cols: Array<[string, (t: any) => void]> = [
    ["ma_he_thong", (t) => t.string("ma_he_thong", 50).nullable()],
    ["mo_ta", (t) => t.text("mo_ta").nullable()],
    ["trang_thai", (t) => t.string("trang_thai", 30).notNullable().defaultTo("dang_phat_trien")],
    ["don_vi_quan_ly_id", (t) => t.integer("don_vi_quan_ly_id").nullable()],
    ["dau_moi_ky_thuat_id", (t) => t.integer("dau_moi_ky_thuat_id").nullable()],
    ["don_vi_phat_trien", (t) => t.string("don_vi_phat_trien", 255).nullable()],
    ["dia_chi_truy_cap", (t) => t.string("dia_chi_truy_cap", 500).nullable()],
    ["phien_ban", (t) => t.string("phien_ban", 50).nullable()],
    ["ngay_van_hanh", (t) => t.string("ngay_van_hanh", 10).nullable()],
    // JSON: [{ key, label, sub, required }] — loại tài liệu bắt buộc cho mỗi tính năng.
    ["tai_lieu_bat_buoc", (t) => t.text("tai_lieu_bat_buoc").nullable()],
    ["updated_at", (t) => t.dateTime("updated_at").nullable()],
  ];
  for (const [name, add] of cols) {
    if (!(await db.schema.hasColumn("he_thong_options", name))) {
      await db.schema.alterTable("he_thong_options", (t) => add(t));
    }
  }
  // Điền mã HT-01… cho hệ thống chưa có mã (theo thứ tự id).
  const rows = (await db("he_thong_options").whereNull("ma_he_thong").orderBy("id", "asc").select("id")) as any[];
  if (rows.length) {
    const used = new Set(((await db("he_thong_options").whereNotNull("ma_he_thong").select("ma_he_thong")) as any[]).map((r) => r.ma_he_thong));
    let n = 1;
    for (const r of rows) {
      let code = "";
      do code = `HT-${String(n++).padStart(2, "0")}`;
      while (used.has(code));
      used.add(code);
      await db("he_thong_options").where({ id: r.id }).update({ ma_he_thong: code });
    }
  }
}
