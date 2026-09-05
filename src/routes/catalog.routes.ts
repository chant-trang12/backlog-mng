import { Router } from "express";
import { createTagHandler, deleteTagHandler, listTagsHandler, updateTagHandler } from "../controllers/tag.controller.js";
import {
  createPhanLoaiHandler,
  deletePhanLoaiHandler,
  listPhanLoaiHandler,
  updatePhanLoaiHandler,
} from "../controllers/phanloai.controller.js";
import { createNhomHandler, deleteNhomHandler, listNhomHandler, updateNhomHandler } from "../controllers/nhom.controller.js";
import {
  createChucVuHandler,
  deleteChucVuHandler,
  listChucVuHandler,
  updateChucVuHandler,
} from "../controllers/chucvu.controller.js";

const router = Router();

router.get("/tags", listTagsHandler);
router.post("/tags", createTagHandler);
router.put("/tags/:id", updateTagHandler);
router.delete("/tags/:id", deleteTagHandler);

router.get("/phan-loai", listPhanLoaiHandler);
router.post("/phan-loai", createPhanLoaiHandler);
router.put("/phan-loai/:id", updatePhanLoaiHandler);
router.delete("/phan-loai/:id", deletePhanLoaiHandler);

router.get("/nhom", listNhomHandler);
router.post("/nhom", createNhomHandler);
router.put("/nhom/:id", updateNhomHandler);
router.delete("/nhom/:id", deleteNhomHandler);

router.get("/chuc-vu", listChucVuHandler);
router.post("/chuc-vu", createChucVuHandler);
router.put("/chuc-vu/:id", updateChucVuHandler);
router.delete("/chuc-vu/:id", deleteChucVuHandler);

export default router;
