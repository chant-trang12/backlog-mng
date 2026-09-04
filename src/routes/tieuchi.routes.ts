import { Router } from "express";
import {
  createTieuChiConfigHandler,
  deleteTieuChiConfigHandler,
  listTieuChiConfigsHandler,
  setTieuChiDiemChuanHandler,
  updateTieuChiConfigHandler,
} from "../controllers/tieuchi.controller.js";

const router = Router();

router.post("/tieu-chi", createTieuChiConfigHandler);
router.get("/tieu-chi", listTieuChiConfigsHandler);
router.put("/tieu-chi/:id", updateTieuChiConfigHandler);
router.delete("/tieu-chi/:id", deleteTieuChiConfigHandler);
router.put("/tieu-chi/:id/diem-chuan", setTieuChiDiemChuanHandler);

export default router;
