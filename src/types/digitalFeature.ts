export interface DigitalFeature {
  id: number;
  ma: string | null;
  module: string;
  don_vi_chu_tri: string | null;
  don_vi_phoi_hop: string | null;
  giai_doan: string | null;
  tn_mh: string | null;
  muc_tieu_nghiep_vu: string | null;
  vai_tro_pbdkd: string | null;
  nhan_dau_vao_tu: string | null;
  chuyen_dau_ra_toi: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CreateDigitalFeatureInput = Partial<Omit<DigitalFeature, "id" | "created_at" | "updated_at">> & {
  module: string;
};

export type UpdateDigitalFeatureInput = Partial<Omit<DigitalFeature, "id" | "created_at" | "updated_at">>;

/** Bộ lọc danh sách (dùng cho cả API list lẫn xuất Excel). */
export interface DigitalFeatureFilters {
  search?: string;
  module?: string;
  giai_doan?: string;
  tn_mh?: string;
  don_vi_chu_tri?: string;
}
