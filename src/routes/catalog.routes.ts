import express, { Router } from "express";
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
  assignFeatureHandler,
  createFeatureHandler,
  deleteDocHandler,
  deleteFeatureHandler,
  downloadDocHandler,
  eventsHandler,
  progressHandler,
  getFeatureHandler,
  listSystemFeaturesHandler,
  listUnassignedHandler,
  updateFeatureHandler,
  uploadDocHandler,
} from "../controllers/systemFeature.controller.js";
import { createSystemHandler, getSystemHandler, listSystemsHandler, updateSystemHandler } from "../controllers/system.controller.js";
import {
  createMucTieuHandler,
  deleteMucTieuHandler,
  listMucTieuHandler,
  updateMucTieuHandler,
} from "../controllers/muctieu.controller.js";
import {
  createPhanLoaiNhanSuHandler,
  deletePhanLoaiNhanSuHandler,
  listPhanLoaiNhanSuHandler,
  updatePhanLoaiNhanSuHandler,
} from "../controllers/phanloainhansu.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Xem (GET) mở cho mọi role — các danh mục này được nạp ở init() và dùng
// làm dropdown/nhãn hiển thị ở Backlog, Team, Home cho mọi người dùng. Chỉ
// thao tác quản lý (tạo/sửa/xoá danh mục — nghiệp vụ màn hình Cấu hình) mới
// giới hạn admin.
router.get("/tags", listTagsHandler);
router.post("/tags", requireAdmin, createTagHandler);
router.put("/tags/:id", requireAdmin, updateTagHandler);
router.delete("/tags/:id", requireAdmin, deleteTagHandler);

router.get("/phan-loai", listPhanLoaiHandler);
router.post("/phan-loai", requireAdmin, createPhanLoaiHandler);
router.put("/phan-loai/:id", requireAdmin, updatePhanLoaiHandler);
router.delete("/phan-loai/:id", requireAdmin, deletePhanLoaiHandler);

router.get("/nhom", listNhomHandler);
router.post("/nhom", requireAdmin, createNhomHandler);
router.put("/nhom/:id", requireAdmin, updateNhomHandler);
router.delete("/nhom/:id", requireAdmin, deleteNhomHandler);

router.get("/chuc-vu", listChucVuHandler);
router.post("/chuc-vu", requireAdmin, createChucVuHandler);
router.put("/chuc-vu/:id", requireAdmin, updateChucVuHandler);
router.delete("/chuc-vu/:id", requireAdmin, deleteChucVuHandler);

router.get("/he-thong", listHeThongHandler);
router.post("/he-thong", requireAdmin, createHeThongHandler);
router.put("/he-thong/:id", requireAdmin, updateHeThongHandler);
router.delete("/he-thong/:id", requireAdmin, deleteHeThongHandler);
// Hồ sơ hệ thống (menu "Hệ thống & Tính năng") — cùng bảng he_thong_options với Cấu hình > Hệ thống;
// quyền ghi theo chức năng "Quản lý tính năng số hoá" (requireWrite).
router.get("/systems", listSystemsHandler);
router.get("/systems/:id", getSystemHandler);
router.post("/systems", createSystemHandler);
router.put("/systems/:id", updateSystemHandler);
// Tính năng theo hệ thống (sinh từ Yêu cầu tính năng đã duyệt hoặc nhập tay). Xoá mềm: chỉ admin (Quy tắc 9.1).
router.get("/systems/:id/features", listSystemFeaturesHandler);
router.get("/system-features/unassigned", listUnassignedHandler);
router.get("/system-features/docs/:docId", downloadDocHandler);
router.delete("/system-features/docs/:docId", requireAdmin, deleteDocHandler);
router.get("/system-features/:id", getFeatureHandler);
router.post("/system-features", createFeatureHandler);
router.put("/system-features/:id", updateFeatureHandler);
router.post("/system-features/:id/assign", assignFeatureHandler);
router.get("/system-features/:id/events", eventsHandler);
router.post("/system-features/:id/progress", progressHandler);
router.delete("/system-features/:id", requireAdmin, deleteFeatureHandler);
router.post("/system-features/:id/docs/:key", express.raw({ type: () => true, limit: "50mb" }), uploadDocHandler);

router.get("/muc-tieu", listMucTieuHandler);
router.post("/muc-tieu", requireAdmin, createMucTieuHandler);
router.put("/muc-tieu/:id", requireAdmin, updateMucTieuHandler);
router.delete("/muc-tieu/:id", requireAdmin, deleteMucTieuHandler);

router.get("/phan-loai-nhan-su", listPhanLoaiNhanSuHandler);
router.post("/phan-loai-nhan-su", requireAdmin, createPhanLoaiNhanSuHandler);
router.put("/phan-loai-nhan-su/:id", requireAdmin, updatePhanLoaiNhanSuHandler);
router.delete("/phan-loai-nhan-su/:id", requireAdmin, deletePhanLoaiNhanSuHandler);

export default router;
