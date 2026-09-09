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
import {
  createHeThongHandler,
  deleteHeThongHandler,
  listHeThongHandler,
  updateHeThongHandler,
} from "../controllers/hethong.controller.js";
import {
  createMucTieuHandler,
  deleteMucTieuHandler,
  listMucTieuHandler,
  updateMucTieuHandler,
} from "../controllers/muctieu.controller.js";

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

router.get("/he-thong", listHeThongHandler);
router.post("/he-thong", createHeThongHandler);
router.put("/he-thong/:id", updateHeThongHandler);
router.delete("/he-thong/:id", deleteHeThongHandler);

router.get("/muc-tieu", listMucTieuHandler);
router.post("/muc-tieu", createMucTieuHandler);
router.put("/muc-tieu/:id", updateMucTieuHandler);
router.delete("/muc-tieu/:id", deleteMucTieuHandler);

export default router;
