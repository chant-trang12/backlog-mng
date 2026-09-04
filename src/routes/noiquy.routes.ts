import { Router } from "express";
import {
  deleteNoiQuyOverridesHandler,
  listNoiQuyOverridesHandler,
  setNoiQuyOverridesHandler,
} from "../controllers/noiquy.controller.js";

const router = Router();

router.get("/noiquy-overrides", listNoiQuyOverridesHandler);
router.post("/noiquy-overrides", setNoiQuyOverridesHandler);
router.delete("/noiquy-overrides", deleteNoiQuyOverridesHandler);

export default router;
