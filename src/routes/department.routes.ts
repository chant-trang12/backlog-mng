import { Router } from "express";
import {
  createDepartmentHandler,
  deleteDepartmentHandler,
  listDepartmentsHandler,
  updateDepartmentHandler,
} from "../controllers/department.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Xem (GET) mở cho mọi role — dùng để dựng bộ chọn phòng ban (switcher) ở
// mọi trang, kể cả cho viewer/editor bị giới hạn phạm vi (Quy tắc 9.2). Chỉ
// thao tác quản lý (tạo/sửa/xoá phòng ban — nghiệp vụ màn hình Cấu hình) mới
// giới hạn admin.
router.get("/departments", listDepartmentsHandler);
router.post("/departments", requireAdmin, createDepartmentHandler);
router.put("/departments/:id", requireAdmin, updateDepartmentHandler);
router.delete("/departments/:id", requireAdmin, deleteDepartmentHandler);

export default router;
