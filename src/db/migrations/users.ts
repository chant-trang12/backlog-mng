import { db } from "../connection.js";

// Quản lý User + Phân quyền — user cục bộ được tạo tự động khi đăng nhập
// SSO lần đầu (upsertUserFromSso), KHÔNG tạo tay ở đây. sso_sub là
// "sub" claim từ IdP (định danh không đổi), unique để upsert theo đúng
// 1 người dù username/email đổi sau này.
export async function migrateUsersTable(): Promise<void> {
  const hasUsers = await db.schema.hasTable("users");
  if (!hasUsers) {
    await db.schema.createTable("users", (table) => {
      table.increments("id").primary();
      table.string("sso_sub", 255).notNullable().unique();
      table.string("username", 255).notNullable();
      table.string("name", 255).notNullable();
      table.string("email", 255);
      // "admin" | "editor" | "viewer" — xem src/types/user.ts. Người đầu
      // tiên đăng nhập thành công tự thành admin (bootstrap), những người
      // sau mặc định "viewer" (quyền thấp nhất) — admin vào Quản lý User
      // để nâng quyền.
      table.string("role", 20).notNullable().defaultTo("viewer");
      table.boolean("active").notNullable().defaultTo(true);
      table.dateTime("last_login_at");
      table.dateTime("created_at").notNullable().defaultTo(db.fn.now());
      table.dateTime("updated_at").notNullable().defaultTo(db.fn.now());
    });
  }
}

// users.department_id — Phòng ban chủ quản của tài khoản (Quy tắc 9.2, trục
// phân quyền ngang). NULL = chưa gán -> editor/viewer không thấy dữ liệu
// nghiệp vụ nào (xử lý ở tầng tính phạm vi khi lọc được triển khai, chưa
// làm ở bước này). Gán tay bởi Admin ở màn hình Quản lý User, không suy ra
// từ claim SSO. Xóa phòng ban không được làm mất tài khoản -> chỉ gỡ liên
// kết (ON DELETE SET NULL), Admin gán lại sau.
// PHẢI chạy sau migrateDepartments() (cần bảng departments tồn tại sẵn).
export async function migrateUsersDepartment(): Promise<void> {
  if (!(await db.schema.hasColumn("users", "department_id"))) {
    await db.schema.alterTable("users", (table) => {
      table.integer("department_id").references("id").inTable("departments").onDelete("SET NULL");
    });
  }
}

// members.ha_ki — nút "Hạ KI" ở tab Nhân sự, hạ KI của nhân sự đó xuống 1
// bậc khi hiển thị ở Home > Ranking > "Ranking thành viên team" (thang
// A+ > A > B > C > D > E, xem homeLowerKiOneLevel ở app.js). Mặc định
// false — hành vi cũ không đổi.
export async function migrateMembersHaKi(): Promise<void> {
  if (!(await db.schema.hasColumn("members", "ha_ki"))) {
    await db.schema.alterTable("members", (table) => {
      table.boolean("ha_ki").notNullable().defaultTo(false);
    });
  }
}

// members.ghi_chu — cột "Ghi chú" tự do (textarea) ở tab Nhân sự, nhập/sửa
// trong dialog Thêm/Sửa nhân sự cùng Chức vụ/Team. Không có ý nghĩa tính
// toán gì (không dùng ở bất kỳ công thức KPI/Nội quy nào) — chỉ để lưu ghi
// chú tự do cho từng nhân sự trong tháng đang xem.
export async function migrateMembersGhiChu(): Promise<void> {
  if (!(await db.schema.hasColumn("members", "ghi_chu"))) {
    await db.schema.alterTable("members", (table) => {
      table.text("ghi_chu");
    });
  }
}
