// Loại kỳ báo cáo + phép tính kỳ cha/con (dùng chung cho mẫu & báo cáo PowerPoint).
export type PeriodType = "month" | "quarter" | "half" | "year";
export const PERIOD_TYPES: PeriodType[] = ["month", "quarter", "half", "year"];
export const PERIOD_TYPE_LABEL: Record<PeriodType, string> = { month: "Báo cáo tháng", quarter: "Báo cáo quý", half: "Báo cáo 6 tháng", year: "Báo cáo năm" };
const MAX_IDX: Record<PeriodType, number> = { month: 12, quarter: 4, half: 2, year: 1 };

export function isPeriodType(v: unknown): v is PeriodType {
  return typeof v === "string" && (PERIOD_TYPES as string[]).includes(v);
}
export function validIdx(type: PeriodType, idx: number): boolean {
  return Number.isInteger(idx) && idx >= 1 && idx <= MAX_IDX[type];
}

const ROMAN = ["", "I", "II", "III", "IV"];
export function periodLabel(type: PeriodType, year: number, idx: number): string {
  if (type === "month") return `Tháng ${idx}/${year}`;
  if (type === "quarter") return `Quý ${ROMAN[idx]}/${year}`;
  if (type === "half") return idx === 1 ? `6 tháng đầu năm ${year}` : `6 tháng cuối năm ${year}`;
  return `Năm ${year}`;
}
export function periodShort(type: PeriodType, idx: number): string {
  return type === "month" ? `T${idx}` : type === "quarter" ? `Q${idx}` : type === "half" ? `6T${idx}` : "Năm";
}
export function exportFileName(type: PeriodType, year: number, idx: number): string {
  const part = type === "month" ? `T${idx}` : type === "quarter" ? `Q${idx}` : type === "half" ? `6T${idx}` : "N";
  return `BaoCao_${part}_${year}.pptx`;
}

// Kỳ con dùng để tổng hợp: quý <- 3 tháng; 6 tháng <- 2 quý; năm <- 4 quý.
export function childPeriods(type: PeriodType, year: number, idx: number): { type: PeriodType; year: number; idx: number }[] {
  if (type === "quarter") return [0, 1, 2].map((k) => ({ type: "month", year, idx: (idx - 1) * 3 + 1 + k }));
  if (type === "half") return [0, 1].map((k) => ({ type: "quarter", year, idx: (idx - 1) * 2 + 1 + k }));
  if (type === "year") return [1, 2, 3, 4].map((q) => ({ type: "quarter", year, idx: q }));
  return [];
}
// Kỳ liền trước cùng loại (tháng 1 -> tháng 12 năm trước).
export function previousPeriod(type: PeriodType, year: number, idx: number): { year: number; idx: number } | null {
  if (type === "year") return { year: year - 1, idx: 1 };
  return idx > 1 ? { year, idx: idx - 1 } : { year: year - 1, idx: MAX_IDX[type] };
}
