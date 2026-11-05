import { db } from "../connection.js";

// Báo cáo PowerPoint (tab "Báo cáo PowerPoint" ở Kế hoạch tổng hợp):
// - report_templates: file mẫu .pptx theo (phòng ban, loại kỳ). Lưu nguyên file trong DB (binary).
// - report_template_fields: mỗi mã {{ma}} đọc được từ file mẫu = 1 đầu mục nhập liệu.
// - reports: 1 báo cáo / (phòng ban, loại kỳ, năm, idx). Trạng thái Nháp -> Đã xuất.
// - report_sections: nội dung từng đầu mục (JSON theo kiểu nội dung).
// - report_versions: mỗi lần xuất tạo 1 phiên bản (giữ file đã xuất).
export async function migrateReportPptxTables(): Promise<void> {
  if (!(await db.schema.hasTable("report_templates"))) {
    await db.schema.createTable("report_templates", (t) => {
      t.increments("id").primary();
      t.integer("department_id").notNullable().references("id").inTable("departments").onDelete("NO ACTION");
      t.string("period_type", 20).notNullable();
      t.string("file_name", 255).notNullable();
      t.integer("slide_count").notNullable().defaultTo(0);
      t.integer("size_bytes").notNullable().defaultTo(0);
      t.integer("version").notNullable().defaultTo(1);
      t.binary("file_data").notNullable();
      t.string("uploaded_by", 255);
      t.dateTime("uploaded_at").notNullable().defaultTo(db.fn.now());
      t.unique(["department_id", "period_type"]);
    });
  }
  if (!(await db.schema.hasTable("report_template_fields"))) {
    await db.schema.createTable("report_template_fields", (t) => {
      t.increments("id").primary();
      t.integer("template_id").notNullable().references("id").inTable("report_templates").onDelete("CASCADE");
      t.string("code", 100).notNullable();
      t.string("label", 255).notNullable();
      t.integer("slide_no");
      t.string("kind", 20).notNullable().defaultTo("list");
      t.boolean("required").notNullable().defaultTo(true);
      t.string("source", 30).notNullable().defaultTo("manual");
      t.boolean("carry_over").notNullable().defaultTo(false);
      t.integer("thu_tu").notNullable().defaultTo(0);
      t.boolean("is_hidden").notNullable().defaultTo(false);
      t.unique(["template_id", "code"]);
    });
  }
  if (!(await db.schema.hasTable("reports"))) {
    await db.schema.createTable("reports", (t) => {
      t.increments("id").primary();
      t.integer("department_id").notNullable().references("id").inTable("departments").onDelete("NO ACTION");
      t.string("period_type", 20).notNullable();
      t.integer("year").notNullable();
      t.integer("idx").notNullable();
      t.string("status", 20).notNullable().defaultTo("draft");
      t.integer("template_id");
      t.text("snapshot_json");
      t.dateTime("last_exported_at");
      t.string("created_by", 255);
      t.boolean("is_deleted").notNullable().defaultTo(false);
      t.dateTime("deleted_at");
      t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      t.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      t.index(["department_id", "period_type", "year"]);
    });
  }
  // reports.rev: số lần sửa nội dung (tăng mỗi lần lưu) — dùng phát hiện "kỳ con đã thay đổi" chắc hơn so với updated_at (độ phân giải giây).
  if (!(await db.schema.hasColumn("reports", "rev"))) {
    await db.schema.alterTable("reports", (t) => {
      t.integer("rev").notNullable().defaultTo(0);
    });
  }
  if (!(await db.schema.hasTable("report_sections"))) {
    await db.schema.createTable("report_sections", (t) => {
      t.increments("id").primary();
      t.integer("report_id").notNullable().references("id").inTable("reports").onDelete("CASCADE");
      t.string("code", 100).notNullable();
      t.text("content_json");
      t.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      t.unique(["report_id", "code"]);
    });
  }
  // Góp ý của sếp/đồng nghiệp theo từng đầu mục của báo cáo: chỉ có 2 trạng thái Mới(open) / Đã xử lý(resolved).
  if (!(await db.schema.hasTable("report_comments"))) {
    await db.schema.createTable("report_comments", (t) => {
      t.increments("id").primary();
      t.integer("report_id").notNullable().references("id").inTable("reports").onDelete("CASCADE");
      t.string("field_code", 100).notNullable();
      t.integer("slide_no");
      t.text("content").notNullable();
      t.string("status", 20).notNullable().defaultTo("open");
      t.integer("author_id");
      t.string("author_name", 255);
      t.string("resolved_by", 255);
      t.dateTime("resolved_at");
      t.boolean("is_deleted").notNullable().defaultTo(false);
      t.dateTime("deleted_at");
      t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      t.index(["report_id"]);
    });
  }
  // Ảnh của đầu mục kiểu "Hình ảnh": 1 ảnh / đầu mục / báo cáo (PNG hoặc JPEG, tối đa 5 MB) + chú thích 1 dòng.
  if (!(await db.schema.hasTable("report_images"))) {
    await db.schema.createTable("report_images", (t) => {
      t.increments("id").primary();
      t.integer("report_id").notNullable().references("id").inTable("reports").onDelete("CASCADE");
      t.string("field_code", 100).notNullable();
      t.string("file_name", 255);
      t.string("mime", 50).notNullable();
      t.integer("size_bytes").notNullable();
      t.binary("data").notNullable();
      t.string("caption", 300);
      t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      t.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
      t.unique(["report_id", "field_code"]);
    });
  }
  if (!(await db.schema.hasTable("report_versions"))) {
    await db.schema.createTable("report_versions", (t) => {
      t.increments("id").primary();
      t.integer("report_id").notNullable().references("id").inTable("reports").onDelete("CASCADE");
      t.integer("version_no").notNullable();
      t.string("file_name", 255).notNullable();
      t.binary("file_data").notNullable();
      t.string("created_by", 255);
      t.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      t.index(["report_id"]);
    });
  }
}
