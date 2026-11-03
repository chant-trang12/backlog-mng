import { Router } from "express";
import {
  addGnvItemsFromTasksHandler,
  copyGnvHandler,
  createGnvGroupHandler,
  createGnvItemHandler,
  deleteGnvGroupHandler,
  deleteGnvItemHandler,
  exportGnvHandler,
  listGnvHandler,
  updateGnvGroupHandler,
  updateGnvItemHandler,
} from "../controllers/gnv.controller.js";

const router = Router();

router.get("/gnv", listGnvHandler);
router.get("/gnv/export", exportGnvHandler);
router.post("/gnv/copy", copyGnvHandler);
router.post("/gnv/groups", createGnvGroupHandler);
router.put("/gnv/groups/:id", updateGnvGroupHandler);
router.delete("/gnv/groups/:id", deleteGnvGroupHandler);
router.post("/gnv/items", createGnvItemHandler);
router.post("/gnv/items/from-tasks", addGnvItemsFromTasksHandler);
router.put("/gnv/items/:id", updateGnvItemHandler);
router.delete("/gnv/items/:id", deleteGnvItemHandler);

export default router;
