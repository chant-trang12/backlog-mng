import { Router } from "express";
import {
  cloneTieuChiConfigsHandler,
  createTieuChiConfigHandler,
  deleteTieuChiConfigHandler,
  listTieuChiConfigsHandler,
  setTieuChiDiemChuanHandler,
  updateTieuChiConfigHandler,
} from "../controllers/tieuchi.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Xem (GET) mở cho mọi role vì state.criteriaConfigs được nạp ở init() và
// dùng để tính điểm ở trang Home cho mọi người dùng. Chỉ thao tác quản lý
// (tạo/sửa/xoá tiêu chí — nghiệp vụ màn hình Cấu hình) mới giới hạn admin.
router.get("/tieu-chi", listTieuChiConfigsHandler);

// Đặt trước "/tieu-chi/:id" để tránh xung đột path.
router.post("/tieu-chi/clone", requireAdmin, cloneTieuChiConfigsHandler);

router.post("/tieu-chi", requireAdmin, createTieuChiConfigHandler);
router.put("/tieu-chi/:id", requireAdmin, updateTieuChiConfigHandler);
router.delete("/tieu-chi/:id", requireAdmin, deleteTieuChiConfigHandler);
router.put("/tieu-chi/:id/diem-chuan", requireAdmin, setTieuChiDiemChuanHandler);

export default router;
