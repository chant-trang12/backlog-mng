import { Router } from "express";
import { listPermissionsHandler, updatePermissionHandler } from "../controllers/permission.controller.js";

const router = Router();

// Chỉ Admin vào được — requireAdmin áp theo tiền tố "/api/role-permissions"
// ở app.ts (cùng pattern /api/users, /api/action-logs), không cần lặp lại
// ở đây. GET cũng admin-only (không phải dữ liệu nghiệp vụ, không có lý do
// role khác cần đọc nguyên ma trận cấu hình quyền của hệ thống).
router.get("/role-permissions", listPermissionsHandler);
router.put("/role-permissions", updatePermissionHandler);

export default router;
