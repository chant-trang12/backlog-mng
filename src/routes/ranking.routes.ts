import { Router } from "express";
import {
  addRankingColumnHandler,
  addRankingRowHandler,
  deleteRankingColumnHandler,
  deleteRankingRowHandler,
  getRankingConfigHandler,
  renameRankingColumnHandler,
  setRankingCellHandler,
} from "../controllers/ranking.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Xem (GET) mở cho mọi role vì state.rankingConfig được nạp ở init() và
// dùng để hiển thị bảng xếp hạng ở trang Home cho mọi người dùng. Chỉ thao
// tác quản lý (thêm/sửa/xoá hàng-cột-ô — nghiệp vụ màn hình Cấu hình) mới
// giới hạn admin.
router.get("/ranking-config", getRankingConfigHandler);
router.post("/ranking-config/rows", requireAdmin, addRankingRowHandler);
router.delete("/ranking-config/rows/:viTri", requireAdmin, deleteRankingRowHandler);
router.post("/ranking-config/columns", requireAdmin, addRankingColumnHandler);
router.put("/ranking-config/columns/:id", requireAdmin, renameRankingColumnHandler);
router.delete("/ranking-config/columns/:id", requireAdmin, deleteRankingColumnHandler);
router.put("/ranking-config/cells", requireAdmin, setRankingCellHandler);

export default router;
