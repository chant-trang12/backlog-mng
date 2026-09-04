import type { Request, Response } from "express";
import { listNoiQuyOverrides, removeNoiQuyOverrides, setNoiQuyOverrides } from "../services/noiquy.service.js";
import { getPeriod } from "../services/period.service.js";

// GET /api/noiquy-overrides?period_id=X
export async function listNoiQuyOverridesHandler(req: Request, res: Response) {
  const periodId = Number(req.query.period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Query 'period_id' không hợp lệ" });
  }
  res.json(listNoiQuyOverrides(periodId));
}

// POST /api/noiquy-overrides { period_id, names: string[] } — "Không tính
// đi muộn" ép Lượt đi muộn/Total của các nhân sự này về 0 trong tháng theo dõi.
export async function setNoiQuyOverridesHandler(req: Request, res: Response) {
  const { period_id, names } = req.body ?? {};
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "Trường 'names' phải là mảng không rỗng" });
  }
  setNoiQuyOverrides(
    periodId,
    names.map((n: unknown) => String(n)),
  );
  res.json(listNoiQuyOverrides(periodId));
}

// DELETE /api/noiquy-overrides { period_id, names: string[] } — bỏ đánh dấu
// "Không tính đi muộn", tính lại Lượt đi muộn/Total như bình thường.
export async function deleteNoiQuyOverridesHandler(req: Request, res: Response) {
  const { period_id, names } = req.body ?? {};
  const periodId = Number(period_id);
  if (!getPeriod(periodId)) {
    return res.status(400).json({ error: "Trường 'period_id' không hợp lệ" });
  }
  if (!Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: "Trường 'names' phải là mảng không rỗng" });
  }
  removeNoiQuyOverrides(
    periodId,
    names.map((n: unknown) => String(n)),
  );
  res.json(listNoiQuyOverrides(periodId));
}
