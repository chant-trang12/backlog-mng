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

const router = Router();

router.get("/ranking-config", getRankingConfigHandler);
router.post("/ranking-config/rows", addRankingRowHandler);
router.delete("/ranking-config/rows/:viTri", deleteRankingRowHandler);
router.post("/ranking-config/columns", addRankingColumnHandler);
router.put("/ranking-config/columns/:id", renameRankingColumnHandler);
router.delete("/ranking-config/columns/:id", deleteRankingColumnHandler);
router.put("/ranking-config/cells", setRankingCellHandler);

export default router;
