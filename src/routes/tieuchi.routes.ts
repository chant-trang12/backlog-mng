import { Router } from "express";
import {
  cloneTieuChiConfigsHandler,
  createTieuChiConfigHandler,
  deleteTieuChiConfigHandler,
  listTieuChiConfigsHandler,
  setTieuChiDiemChuanHandler,
  updateTieuChiConfigHandler,
} from "../controllers/tieuchi.controller.js";

const router = Router();

// Đặt trước "/tieu-chi/:id" để tránh xung đột path.
router.post("/tieu-chi/clone", cloneTieuChiConfigsHandler);

router.post("/tieu-chi", createTieuChiConfigHandler);
router.get("/tieu-chi", listTieuChiConfigsHandler);
router.put("/tieu-chi/:id", updateTieuChiConfigHandler);
router.delete("/tieu-chi/:id", deleteTieuChiConfigHandler);
router.put("/tieu-chi/:id/diem-chuan", setTieuChiDiemChuanHandler);

export default router;
