import { db } from "../connection.js";

// [DEMO 3002] "Yêu cầu tính năng" — hộp thư yêu cầu DÙNG CHUNG cho mọi
// phòng ban: bất kỳ phòng nào cũng đề xuất được tính năng thêm mới/nâng
// cấp cho BẤT KỲ hệ thống nào (không nhất thiết hệ thống của chính phòng
// mình) — khác bản chất với Roadmap năm (roadmap_items) vốn là kế hoạch
// riêng của phòng sở hữu, chỉ phòng đó thấy/sửa theo Quy tắc 9.2.
// department_id ở đây CHỈ để gắn nhãn "ai đề xuất", KHÔNG dùng để giới hạn
// xem — mọi phòng ban đều thấy toàn bộ danh sách (giống 1 inbox chung).
export async function migrateFeatureRequestTables(): Promise<void> {
  // Loại yêu cầu — danh mục riêng (không dùng chung muc_tieu_options của
  // Roadmap để tránh 2 tính năng khác mục đích vô tình lẫn danh mục).
  if (!(await db.schema.hasTable("loai_yeu_cau_options"))) {
    await db.schema.createTable("loai_yeu_cau_options", (table) => {
      table.increments("id").primary();
      table.string("ten_loai", 255).notNullable().unique();
      table.integer("thu_tu").notNullable().defaultTo(0);
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
    });
  }
  const loaiCountRes = await db("loai_yeu_cau_options").count({ c: "*" }).first();
  if (Number((loaiCountRes as any)?.c ?? 0) === 0) {
    const seed = ["Thêm tính năng mới", "Nâng cấp tính năng", "Sửa lỗi", "Khác"];
    for (let i = 0; i < seed.length; i++) {
      await db("loai_yeu_cau_options").insert({ ten_loai: seed[i], thu_tu: i });
    }
  }

  if (!(await db.schema.hasTable("feature_requests"))) {
    await db.schema.createTable("feature_requests", (table) => {
      table.increments("id").primary();
      // Hệ thống đích của yêu cầu — tái dùng danh mục he_thong_options đã
      // có sẵn ở Roadmap năm (Website/Nội bộ/App Mobile...), lưu dạng text
      // tự do giống cách roadmap_items.he_thong đang lưu (không ràng buộc
      // FK — cho phép gõ hệ thống mới ngoài danh mục nếu cần).
      table.string("he_thong", 255).notNullable();
      table.string("loai_yeu_cau", 255);
      table.string("tieu_de", 500).notNullable();
      table.text("mo_ta");
      // Kết quả mong muốn — mô tả "làm xong thì trông như thế nào", khác
      // Mô tả chi tiết (mô tả VẤN ĐỀ/nhu cầu) — tách riêng để bên xử lý dễ
      // đánh giá phạm vi cần làm.
      table.text("ket_qua_mong_muon");
      // Thời gian mong muốn thực hiện — ngày bên đề xuất MUỐN có kết quả,
      // chỉ mang tính tham khảo/ưu tiên cho bên đích, KHÔNG phải deadline
      // cam kết (deadline thật nằm ở Task khi "Đưa vào Backlog").
      table.string("thoi_gian_mong_muon", 50);
      // Phòng ban đề xuất (nguồn) — CHỈ để gắn nhãn "ai gửi", không dùng
      // lọc quyền xem.
      table.integer("department_id").references("id").inTable("departments").onDelete("SET NULL");
      // Phòng ban đích — phòng cần TIẾP NHẬN/xử lý yêu cầu này (thường là
      // phòng sở hữu "Hệ thống" ở trên). Bắt buộc chọn khi tạo (validate ở
      // controller) — khác department_id ở trên (đề xuất), field này mới là
      // "gửi đến ai" mà người dùng vừa yêu cầu bổ sung.
      table
        .integer("target_department_id")
        .references("id")
        .inTable("departments")
        .onDelete("SET NULL");
      table.string("nguoi_de_xuat", 255);
      table.string("do_uu_tien", 50).notNullable().defaultTo("Trung bình");
      // "Chờ duyệt" | "Đã duyệt" | "Từ chối" — 1 giá trị DUY NHẤT dùng
      // chung cho cả 2 phía, nhãn hiển thị khác nhau theo phòng đang xem
      // (xem FR_STATUS_LABEL_BY_SIDE ở 10-feature-requests.js): bên đề
      // xuất thấy "Đã gửi yêu cầu"/"Đã tiếp nhận yêu cầu", bên đích thấy
      // "Chờ duyệt"/"Đã duyệt" — riêng "Từ chối" thì cả 2 bên thấy giống
      // nhau ("Từ chối yêu cầu").
      table.string("trang_thai", 100).notNullable().defaultTo("Chờ duyệt");
      table.text("ghi_chu_xu_ly");
      // Đưa vào Backlog/Roadmap năm — chỉ phòng đích làm, chỉ khi đã Duyệt,
      // và chỉ 1 lần (giữ đúng pattern synced_task_id đã có ở
      // roadmap_items — xem roadmap.service.ts#syncRoadmapItemToBacklog).
      table.integer("linked_task_id").references("id").inTable("tasks").onDelete("SET NULL");
      table.integer("linked_roadmap_item_id").references("id").inTable("roadmap_items").onDelete("SET NULL");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }

  // Bảng đã tạo từ trước lúc chưa có các cột dưới đây (demo đã chạy qua
  // nhiều lần) — thêm cột bù cho các lần khởi động sau, idempotent như mọi
  // migration khác trong hệ thống.
  if (!(await db.schema.hasColumn("feature_requests", "target_department_id"))) {
    await db.schema.alterTable("feature_requests", (table) => {
      table
        .integer("target_department_id")
        .references("id")
        .inTable("departments")
        .onDelete("SET NULL");
    });
  }
  if (!(await db.schema.hasColumn("feature_requests", "linked_task_id"))) {
    await db.schema.alterTable("feature_requests", (table) => {
      table.integer("linked_task_id").references("id").inTable("tasks").onDelete("SET NULL");
      table.integer("linked_roadmap_item_id").references("id").inTable("roadmap_items").onDelete("SET NULL");
    });
  }
  if (!(await db.schema.hasColumn("feature_requests", "ket_qua_mong_muon"))) {
    await db.schema.alterTable("feature_requests", (table) => {
      table.text("ket_qua_mong_muon");
      table.string("thoi_gian_mong_muon", 50);
    });
  }
  // Dữ liệu demo cũ có thể còn trang_thai theo bộ giá trị trước đó (Mới/
  // Đang xem xét/Đã duyệt/Từ chối/Đang triển khai/Hoàn thành) — quy về 3
  // giá trị mới cho khớp luồng Duyệt/Từ chối vừa chốt, tránh badge hiện
  // trạng thái lạ không map được màu/nhãn.
  await db("feature_requests")
    .whereIn("trang_thai", ["Mới", "Đang xem xét"])
    .update({ trang_thai: "Chờ duyệt" });
  await db("feature_requests")
    .whereIn("trang_thai", ["Đang triển khai", "Hoàn thành"])
    .update({ trang_thai: "Đã duyệt" });
}
