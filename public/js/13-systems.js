// Menu "Hệ thống & Tính năng": danh sách hệ thống + thêm/sửa. Dữ liệu là bảng he_thong_options — CHUNG với
// Cấu hình > Hệ thống (thêm/sửa/xoá ở bên nào cũng hiện ở bên kia). API: /api/systems.
const SYS_STATUS = {
  dang_phat_trien: { label: "Đang phát triển", cls: "status-dang-thuc-hien" },
  dang_van_hanh: { label: "Đang vận hành", cls: "status-hoan-thanh" },
  bao_tri: { label: "Bảo trì", cls: "status-default" },
  ngung_su_dung: { label: "Ngừng sử dụng", cls: "status-huy" },
};
const SYS_DEFAULT_DOCS = [
  { key: "dac_ta", label: "Đặc tả", sub: "Yêu cầu, use case", required: true },
  { key: "thiet_ke", label: "Thiết kế", sub: "Giao diện, CSDL, API", required: true },
  { key: "test_case", label: "Test case", sub: "Kịch bản kiểm thử", required: true },
  { key: "huong_dan", label: "Hướng dẫn sử dụng", sub: "Tài liệu cho người dùng", required: true },
  { key: "nghiem_thu", label: "Biên bản nghiệm thu", sub: "Xác nhận hoàn thành", required: false },
];
const sftPagination = createPagination("sft", () => renderFeatures(), "tính năng");
const sunPagination = createPagination("sun", () => sysRenderUnassigned(), "tính năng");
const sysState = { list: [], tab: "all", q: "", editingId: null, status: "dang_phat_trien", docs: [], users: [] };

function sysEsc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
const sysEl = (id) => document.getElementById(id);
const SYS_VIEWS = { list: "sys-list-view", form: "sys-form-view", detail: "sys-detail-view", ftform: "sys-ft-form-view", ftdetail: "sys-ftdetail-view", unassigned: "sys-unassigned-view" };
function sysShow(view) {
  for (const [k, id] of Object.entries(SYS_VIEWS)) sysEl(id).hidden = k !== view;
}
function sysFmtDate(v) {
  if (!v) return "";
  const d = new Date(String(v).replace(" ", "T"));
  if (isNaN(d)) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function loadSystems() {
  sysShow("list");
  sysState.list = await api(`/api/systems${deptParam("?")}`);
  sysState.unassigned = await api(`/api/system-features/unassigned${deptParam("?")}`).catch(() => []);
  renderSystems();
}

function sysStatCards(items) {
  return items
    .map(([label, value, sub, hl]) => `<div class="fr-stat-card${hl ? " fr-stat-highlight" : ""}"><div class="fr-stat-label">${label}</div><div class="fr-stat-value">${value}</div>${sub ? `<div class="fr-stat-sub">${sysEsc(sub)}</div>` : ""}</div>`)
    .join("");
}

function renderSystems() {
  const all = sysState.list;
  const un = sysState.unassigned || [];
  const banner = sysEl("sys-banner");
  banner.hidden = un.length === 0;
  banner.innerHTML = un.length ? `<span>Có <b>${un.length}</b> tính năng chưa gán hệ thống (tên hệ thống ở yêu cầu chưa có trong danh mục).</span> <button type="button" class="sys-view-btn" id="sys-banner-btn">Xử lý ngay →</button>` : "";
  const sum = (k) => all.reduce((a, s) => a + (s[k] || 0), 0);
  // Thẻ thống kê cùng kiểu màn Yêu cầu tính năng (fr-stat-card): thẻ đầu nổi bật, số đỏ, dòng phụ diễn giải.
  const total = sum("so_tinh_nang");
  const pct = (n) => (total ? `${Math.round((n / total) * 100)}% tổng số` : "");
  const running = all.filter((s) => s.trang_thai === "dang_van_hanh").length;
  const withFt = all.filter((s) => s.so_tinh_nang > 0).length;
  sysEl("sys-stats").innerHTML = sysStatCards([
    ["Hệ thống", all.length, `${running} đang vận hành`, true],
    ["Tổng tính năng", total, `Thuộc ${withFt} hệ thống`],
    ["Đang thực hiện", sum("dang_lam"), pct(sum("dang_lam"))],
    ["Tài liệu đã lưu", sum("so_tai_lieu"), total ? `TB ${(sum("so_tai_lieu") / total).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tài liệu/tính năng` : ""],
  ]);

  const cnt = (st) => all.filter((s) => s.trang_thai === st).length;
  const order = ["dang_van_hanh", "dang_phat_trien", "bao_tri", "ngung_su_dung"];
  const tabs = [["all", "Tất cả", all.length], ...order.map((k) => [k, SYS_STATUS[k].label, cnt(k)])];
  sysEl("sys-tabs").innerHTML = tabs
    .map(([k, l, n]) => `<button type="button" class="sys-seg-btn${sysState.tab === k ? " active" : ""}" data-tab="${k}">${l} <span class="sys-tab-n">${n}</span></button>`)
    .join("");

  const q = sysState.q.trim().toLowerCase();
  const unCard = un.length && sysState.tab === "all" && !q
    ? `<article class="sys-card sys-card-un"><div class="sys-card-top"><span class="sys-code">—</span><span class="status-badge status-default">Cần xử lý</span></div>
        <h3 class="sys-card-name">Chưa phân loại</h3>
        <p class="sys-card-desc">Yêu cầu có tên hệ thống chưa nằm trong danh mục — gán vào hệ thống có sẵn hoặc tạo hệ thống mới.</p>
        <div class="sys-metrics"><div><span>Tính năng</span><b>${un.length}</b></div></div>
        <div class="sys-card-foot"><span class="muted">Chưa gán hệ thống</span><button type="button" class="sys-view-btn" id="sys-card-un-btn">Xem tính năng →</button></div></article>`
    : "";
  const rows = all.filter((s) => (sysState.tab === "all" || s.trang_thai === sysState.tab) && (!q || `${s.ten_he_thong} ${s.ma_he_thong}`.toLowerCase().includes(q)));
  sysEl("sys-empty").hidden = rows.length > 0;
  sysEl("sys-grid").innerHTML = unCard + rows
    .map((s) => {
      const st = SYS_STATUS[s.trang_thai] || SYS_STATUS.dang_phat_trien;
      const pct = s.so_tinh_nang ? Math.round((s.hoan_thanh / s.so_tinh_nang) * 100) : 0;
      const foot = [s.don_vi_quan_ly_name, s.updated_at ? `Cập nhật ${sysFmtDate(s.updated_at)}` : ""].filter(Boolean).join(" · ");
      return `<article class="sys-card">
        <div class="sys-card-top"><span class="sys-code">${sysEsc(s.ma_he_thong)}</span>
          <span><span class="status-badge ${st.cls}">${st.label}</span>
          <button type="button" class="sys-edit" data-edit="${s.id}" title="Sửa hệ thống" aria-label="Sửa hệ thống"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-pen"/></svg></button></span></div>
        <h3 class="sys-card-name">${sysEsc(s.ten_he_thong)}</h3>
        <p class="sys-card-desc">${sysEsc(s.mo_ta) || '<span class="muted">Chưa có mô tả</span>'}</p>
        <div class="sys-metrics">
          <div><span>Tính năng</span><b>${s.so_tinh_nang}</b></div>
          <div><span>Đang làm</span><b>${s.dang_lam}</b></div>
          <div><span>Tài liệu</span><b>${s.so_tai_lieu}</b></div>
        </div>
        <div class="sys-prog"><div class="sys-prog-l"><span>Tính năng hoàn thành</span><b>${s.hoan_thanh}/${s.so_tinh_nang}</b></div>
          <div class="sys-bar"><i style="width:${pct}%"></i></div></div>
        <div class="sys-card-foot"><span class="muted">${sysEsc(foot)}</span>
          <button type="button" class="sys-view-btn" data-view="${s.id}">Xem tính năng →</button></div>
      </article>`;
    })
    .join("");
}

function sysRenderStatusPick() {
  const sel = sysEl("sys-status");
  sel.innerHTML = Object.entries(SYS_STATUS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("");
  sel.value = sysState.status;
}
function sysRenderDocs() {
  const on = sysState.docs.filter((d) => d.required).length;
  sysEl("sys-doc-count").textContent = `Đã chọn ${on}/${sysState.docs.length}`;
  sysEl("sys-docs").innerHTML = sysState.docs
    .map(
      (d, i) => `<label class="sys-doc${d.required ? " on" : ""}"><input type="checkbox" data-doc="${i}"${d.required ? " checked" : ""}>
        <span><b>${sysEsc(d.label)}</b><small>${sysEsc(d.sub || "")}</small></span></label>`,
    )
    .join("");
}

async function sysFillSelects(sys) {
  if (!state.departments?.length) await loadDepartments().catch(() => {});
  const dept = sysEl("sys-donvi");
  dept.innerHTML = `<option value="">Chọn đơn vị</option>` + (state.departments || []).map((d) => `<option value="${d.id}">${sysEsc(d.name)}</option>`).join("");
  dept.value = sys?.don_vi_quan_ly_id ? String(sys.don_vi_quan_ly_id) : "";
  try {
    sysState.users = await api("/api/report-share-users?q=");
  } catch {
    sysState.users = [];
  }
  const sel = sysEl("sys-daumoi");
  const users = [...sysState.users];
  if (sys?.dau_moi_ky_thuat_id && !users.some((u) => u.id === sys.dau_moi_ky_thuat_id)) users.unshift({ id: sys.dau_moi_ky_thuat_id, name: sys.dau_moi_ky_thuat_name });
  sel.innerHTML = `<option value="">Chọn người</option>` + users.map((u) => `<option value="${u.id}">${sysEsc(u.name || u.username)}</option>`).join("");
  sel.value = sys?.dau_moi_ky_thuat_id ? String(sys.dau_moi_ky_thuat_id) : "";
}

async function sysOpenForm(id, opts = {}) {
  sysState.fromDetail = !!opts.fromDetail;
  sysState.pendingAssign = null;
  const sys = id ? sysState.list.find((s) => s.id === id) : null;
  sysState.editingId = sys ? sys.id : null;
  sysState.status = sys?.trang_thai || "dang_phat_trien";
  sysState.docs = (sys?.tai_lieu_bat_buoc || SYS_DEFAULT_DOCS).map((d) => ({ ...d }));
  const title = sys ? "Sửa hệ thống" : "Thêm hệ thống";
  sysEl("sys-form-title").textContent = title;
  sysEl("sys-crumb-cur").textContent = title;
  sysEl("sys-save-btn").textContent = sys ? "Lưu thay đổi" : "Tạo hệ thống";
  sysEl("sys-save-add-btn").hidden = !!sys;
  sysEl("sys-ma").value = sys?.ma_he_thong || "";
  sysEl("sys-ten").value = sys?.ten_he_thong || "";
  sysEl("sys-mota").value = sys?.mo_ta || "";
  sysEl("sys-dvpt").value = sys?.don_vi_phat_trien || "";
  sysEl("sys-url").value = sys?.dia_chi_truy_cap || "";
  sysEl("sys-ver").value = sys?.phien_ban || "";
  sysEl("sys-ngay").value = sys?.ngay_van_hanh || "";
  sysEl("sys-doc-add").hidden = true;
  sysEl("sys-doc-add-btn").hidden = false;
  sysRenderStatusPick();
  sysRenderDocs();
  sysShow("form");
  if (!sys) {
    // Gợi ý mã tiếp theo: HT-nn lớn nhất + 1.
    const max = sysState.list.reduce((m, s) => Math.max(m, Number(/^HT-(\d+)$/i.exec(s.ma_he_thong || "")?.[1] || 0)), 0);
    sysEl("sys-ma").value = `HT-${String(max + 1).padStart(2, "0")}`;
  }
  await sysFillSelects(sys);
}

function sysPayload() {
  return {
    ma_he_thong: sysEl("sys-ma").value.trim(),
    ten_he_thong: sysEl("sys-ten").value.trim(),
    mo_ta: sysEl("sys-mota").value.trim(),
    trang_thai: sysState.status,
    don_vi_quan_ly_id: sysEl("sys-donvi").value || null,
    dau_moi_ky_thuat_id: sysEl("sys-daumoi").value || null,
    don_vi_phat_trien: sysEl("sys-dvpt").value.trim(),
    dia_chi_truy_cap: sysEl("sys-url").value.trim(),
    phien_ban: sysEl("sys-ver").value.trim(),
    ngay_van_hanh: sysEl("sys-ngay").value,
    tai_lieu_bat_buoc: sysState.docs,
  };
}

async function sysSave(thenFeatures) {
  const body = sysPayload();
  if (!body.ma_he_thong) return showToast("Mã hệ thống là bắt buộc.");
  if (!body.ten_he_thong) return showToast("Tên hệ thống là bắt buộc.");
  if (!body.don_vi_quan_ly_id) return showToast("Đơn vị quản lý là bắt buộc.");
  try {
    const id = sysState.editingId;
    const saved = await api(id ? `/api/systems/${id}` : "/api/systems", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
    showToast(id ? "Đã lưu hệ thống." : "Đã tạo hệ thống.", "success");
    await loadSystems();
    // Đồng bộ danh mục dùng chung (Cấu hình > Hệ thống, Roadmap, Yêu cầu tính năng).
    if (typeof loadSystem === "function") await loadSystem().catch(() => {});
    if (sysState.pendingAssign?.length && !id) {
      for (const fid of sysState.pendingAssign) await api(`/api/system-features/${fid}/assign`, { method: "POST", body: JSON.stringify({ system_id: saved.id }) }).catch(() => {});
      sysState.pendingAssign = null;
      await loadSystems();
      return sysOpenUnassigned();
    }
    if (id && sysState.fromDetail) return sysOpenDetail(id);
    if (thenFeatures) {
      await sysOpenDetail(saved.id);
      return sysOpenFtForm(null);
    }
  } catch (e) {
    showToast(e.message);
  }
}

(function sysInit() {
  const back = (e) => {
    e?.preventDefault();
    sysShow("list");
  };
  sysEl("sys-add-btn").addEventListener("click", () => sysOpenForm(null));
  sysEl("sys-crumb-back").addEventListener("click", back);
  const formBack = (e) => {
    e?.preventDefault();
    if (sysState.fromDetail && sysState.editingId) sysOpenDetail(sysState.editingId);
    else sysShow("list");
  };
  sysEl("sys-cancel-btn").addEventListener("click", formBack);
  sysEl("sys-search").addEventListener("input", (e) => {
    sysState.q = e.target.value;
    renderSystems();
  });
  sysEl("sys-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    sysState.tab = b.dataset.tab;
    renderSystems();
  });
  sysEl("sys-grid").addEventListener("click", (e) => {
    if (e.target.closest("#sys-card-un-btn")) return sysOpenUnassigned();
    const ed = e.target.closest("[data-edit]");
    if (ed) return sysOpenForm(Number(ed.dataset.edit));
    const v = e.target.closest("[data-view]");
    if (v) sysOpenDetail(Number(v.dataset.view));
  });
  sysEl("sys-status").addEventListener("change", (e) => {
    sysState.status = e.target.value;
  });
  sysEl("sys-docs").addEventListener("change", (e) => {
    const i = e.target.dataset?.doc;
    if (i == null) return;
    sysState.docs[Number(i)].required = e.target.checked;
    sysRenderDocs();
  });
  sysEl("sys-doc-add-btn").addEventListener("click", () => {
    sysEl("sys-doc-add").hidden = false;
    sysEl("sys-doc-add-btn").hidden = true;
    sysEl("sys-doc-new").focus();
  });
  sysEl("sys-doc-new-cancel").addEventListener("click", () => {
    sysEl("sys-doc-add").hidden = true;
    sysEl("sys-doc-add-btn").hidden = false;
    sysEl("sys-doc-new").value = "";
  });
  const addDoc = () => {
    const label = sysEl("sys-doc-new").value.trim();
    if (!label) return;
    if (sysState.docs.some((d) => d.label.toLowerCase() === label.toLowerCase())) return showToast("Loại tài liệu này đã có.");
    sysState.docs.push({ key: `custom_${Date.now()}`, label, sub: "", required: true });
    sysEl("sys-doc-new").value = "";
    sysRenderDocs();
  };
  sysEl("sys-doc-new-ok").addEventListener("click", addDoc);
  sysEl("sys-doc-new").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDoc();
    }
  });
  sysEl("sys-form-view").addEventListener("submit", (e) => {
    e.preventDefault();
    sysSave(false);
  });
  sysEl("sys-save-add-btn").addEventListener("click", () => sysSave(true));
})();

// ======================= Chi tiết hệ thống + tính năng =======================
const FT_STATUS = {
  cho_duyet: { label: "Chờ duyệt", cls: "status-ft-wait" },
  tu_choi: { label: "Từ chối", cls: "status-huy" },
  chua_bat_dau: { label: "Chưa bắt đầu", cls: "status-default" },
  dang_thuc_hien: { label: "Đang thực hiện", cls: "status-dang-thuc-hien" },
  cho_nghiem_thu: { label: "Chờ nghiệm thu", cls: "status-tru-diem" },
  qua_han: { label: "Quá hạn", cls: "status-huy" },
  hoan_thanh: { label: "Hoàn thành", cls: "status-hoan-thanh" },
};
const FT_PRIORITY = { thap: "Thấp", trung_binh: "Trung bình", cao: "Cao" };
const ftState = { system: null, list: [], tab: "all", q: "", editing: null, pending: {}, users: [] };
const isAdminUser = () => !document.body.dataset.role || document.body.dataset.role === "admin";
const ftDate = (v) => (v ? v.split("-").reverse().join("/") : "—");
const ftBadge = (f) => {
  const k = f.trang_thai_hien_thi;
  const st = FT_STATUS[k] || FT_STATUS.chua_bat_dau;
  return `<span class="status-badge ${st.cls}">${st.label}${k === "qua_han" ? ` ${f.qua_han_ngay} ngày` : ""}</span>`;
};

// Đơn vị thực hiện xác nhận hạn khác mong muốn của bên đề xuất -> ghi chú nhỏ dưới hạn hoàn thành.
function ftWantedNote(f) {
  if (!f.han_mong_muon || !f.han_du_kien || f.han_mong_muon === f.han_du_kien) return "";
  const days = Math.round((Date.parse(f.han_du_kien) - Date.parse(f.han_mong_muon)) / 86400000);
  const abs = Math.abs(days);
  const span = abs >= 45 ? `~${Math.round(abs / 30.44)} tháng` : `${abs} ngày`;
  const tip = f.ly_do_dieu_chinh ? ` title="${sysEsc(f.ly_do_dieu_chinh)}"` : "";
  return `<div class="sys-ft-want${days > 0 ? " late" : ""}"${tip}>Mong muốn ${ftDate(f.han_mong_muon)} · ${days > 0 ? "chậm" : "sớm hơn"} ${span}</div>`;
}

async function sysOpenDetail(id) {
  const [sys, list] = await Promise.all([api(`/api/systems/${id}${deptParam("?")}`), api(`/api/systems/${id}/features${deptParam("?")}`)]);
  ftState.system = sys;
  ftState.list = list;
  ftState.tab = "all";
  ftState.q = "";
  sftPagination.reset();
  sysEl("sys-ft-search").value = "";
  const st = SYS_STATUS[sys.trang_thai] || SYS_STATUS.dang_phat_trien;
  sysEl("sys-detail-crumb").textContent = sys.ten_he_thong;
  sysEl("sys-d-code").textContent = sys.ma_he_thong;
  const b = sysEl("sys-d-status");
  b.className = `status-badge ${st.cls}`;
  b.textContent = st.label;
  sysEl("sys-d-name").textContent = sys.ten_he_thong;
  sysEl("sys-d-desc").textContent = sys.mo_ta || "";
  const info = [
    ["Đơn vị quản lý", sys.don_vi_quan_ly_name],
    ["Đầu mối kỹ thuật", sys.dau_moi_ky_thuat_name],
    ["Phiên bản hiện tại", sys.phien_ban],
    ["Ngày đưa vào vận hành", sys.ngay_van_hanh ? ftDate(sys.ngay_van_hanh) : ""],
  ];
  sysEl("sys-d-info").innerHTML = info.map(([l, v]) => `<div><span>${l}</span><b>${sysEsc(v) || "—"}</b></div>`).join("");
  sysEl("sys-ft-legend").innerHTML =
    `<span class="muted">Tài liệu:</span> ` +
    sys.tai_lieu_bat_buoc.filter((d) => d.required).map((d) => `<span><b>${sysEsc(sysAbbr(d.label))}</b> ${sysEsc(d.label)}</span>`).join("") +
    `<span class="muted">Khung nét đứt = chưa có</span>`;
  sysShow("detail");
  renderFeatures();
}
function sysAbbr(label) {
  const w = label.trim().split(/\s+/).filter(Boolean);
  return (w.length >= 2 ? w[0][0] + w[1][0] : label.trim().slice(0, 2)).toUpperCase();
}

function renderFeatures() {
  const all = ftState.list;
  const cnt = (k) => all.filter((f) => f.trang_thai_hien_thi === k).length;
  const n = all.length;
  const pct = (k) => (n ? `${Math.round((k / n) * 100)}% tổng số` : "");
  const done = cnt("hoan_thanh"), doing = all.filter((f) => f.trang_thai === "dang_thuc_hien").length, late = cnt("qua_han"), miss = all.filter((f) => f.thieu_tai_lieu).length;
  sysEl("sys-d-stats").innerHTML = sysStatCards([
    ["Tổng tính năng", n, `${cnt("cho_duyet")} chờ duyệt`, true],
    ["Hoàn thành", done, pct(done)],
    ["Đang thực hiện", doing, pct(doing)],
    ["Quá hạn", late, pct(late)],
    ["Thiếu tài liệu", miss, pct(miss)],
  ]);
  const tabs = [["all", "Tất cả", all.length], ...["cho_duyet", "chua_bat_dau", "dang_thuc_hien", "cho_nghiem_thu", "qua_han", "hoan_thanh", "tu_choi"].map((k) => [k, FT_STATUS[k].label, cnt(k)])];
  sysEl("sys-ft-tabs").innerHTML = tabs.map(([k, l, n]) => `<button type="button" class="sys-seg-btn${ftState.tab === k ? " active" : ""}" data-ftab="${k}">${l} <span class="sys-tab-n">${n}</span></button>`).join("");
  const q = ftState.q.trim().toLowerCase();
  const rows = all.filter((f) => (ftState.tab === "all" || f.trang_thai_hien_thi === ftState.tab) && (!q || `${f.ten} ${f.ma_tinh_nang} ${f.don_vi_yeu_cau_name || ""} ${f.nguoi_phu_trach_name}`.toLowerCase().includes(q)));
  sysEl("sys-ft-count").textContent = `Đang hiển thị ${rows.length} / ${all.length} tính năng`;
  sysEl("sys-ft-empty").hidden = rows.length > 0;
  sysEl("sys-ft-tbody").innerHTML = sftPagination.slice(rows)
    .map(
      (f) => `<tr>
      <td class="muted">${sysEsc(f.ma_tinh_nang)}</td>
      <td><a href="#" class="sys-ft-name" data-ftedit="${f.id}">${sysEsc(f.ten)}</a>${f.nguoi_phu_trach_name ? `<div class="muted sys-ft-sub">Phụ trách: ${sysEsc(f.nguoi_phu_trach_name)}</div>` : ""}</td>
      <td>${sysEsc(f.don_vi_yeu_cau_name) || "—"}</td>
      <td>${ftDate(f.ngay_bat_dau)}</td>
      <td>${ftDate(f.han_hoan_thanh)}${ftWantedNote(f)}</td>
      <td>${ftDate(f.ngay_hoan_thanh_thuc_te)}${f.tre_ngay ? `<div class="sys-ft-late">Trễ ${f.tre_ngay} ngày</div>` : ""}</td>
      <td>${ftBadge(f)}</td>
      <td><div class="sys-docchips">${f.required_docs.map((d) => `<span class="sys-docchip${d.has ? " has" : ""}" title="${sysEsc(d.label)}">${d.has ? "✓ " : ""}${sysEsc(d.abbr)}</span>`).join("")}</div></td>
    </tr>`,
    )
    .join("");
}

// ---------- Form tính năng ----------
async function ftLoadUsers() {
  if (!ftState.users.length) ftState.users = await api("/api/report-share-users?q=").catch(() => []);
  return ftState.users;
}
const ftEl = (id) => document.getElementById(id);
const ftToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function sysOpenFtForm(id) {
  const f = id ? ftState.list.find((x) => x.id === id) || (ftState.current?.id === id ? ftState.current : null) : null;
  ftState.editing = f || null;
  ftState.pending = {};
  const sys = ftState.system;
  ftEl("sys-ft-crumb-detail").textContent = sys.ten_he_thong;
  ftEl("sys-ft-crumb-cur").textContent = f ? "Sửa tính năng" : "Thêm tính năng";
  ftEl("sys-ft-title").textContent = f ? "Sửa tính năng" : "Thêm tính năng";
  ftEl("sft-save").textContent = f ? "Lưu thay đổi" : "Tạo tính năng";
  ftEl("sft-draft").hidden = !!f;
  if (!state.departments?.length) await loadDepartments().catch(() => {});
  const systems = await api("/api/systems");
  ftEl("sft-system").innerHTML = systems.map((s) => `<option value="${s.id}">${sysEsc(s.ma_he_thong)} · ${sysEsc(s.ten_he_thong)}</option>`).join("");
  ftEl("sft-system").value = String(f?.system_id ?? sys.id);
  const next = ftNextCode(Number(ftEl("sft-system").value));
  ftEl("sft-ma").value = f?.ma_tinh_nang || next;
  ftEl("sft-ten").value = f?.ten || "";
  ftEl("sft-mota").value = f?.mo_ta || "";
  ftEl("sft-uutien").innerHTML = Object.entries(FT_PRIORITY).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  ftEl("sft-uutien").value = f?.muc_uu_tien || "trung_binh";
  ftEl("sft-donvi").innerHTML = `<option value="">Chọn đơn vị</option>` + (state.departments || []).map((d) => `<option value="${d.id}">${sysEsc(d.name)}</option>`).join("");
  ftEl("sft-donvi").value = f?.don_vi_yeu_cau_id ? String(f.don_vi_yeu_cau_id) : "";
  ftEl("sft-nguoi").value = f?.nguoi_yeu_cau || "";
  ftEl("sft-vb").value = f?.so_van_ban || "";
  ftEl("sft-ngayyc").value = f ? f.ngay_yeu_cau : ftToday();
  ftEl("sft-bd").value = f?.ngay_bat_dau || "";
  ftEl("sft-han").value = f?.han_hoan_thanh || "";
  ftEl("sft-tt").value = f?.ngay_hoan_thanh_thuc_te || "";
  ftEl("sft-trangthai").innerHTML = ["chua_bat_dau", "dang_thuc_hien", "cho_nghiem_thu", "hoan_thanh"].map((k) => `<option value="${k}">${FT_STATUS[k].label}</option>`).join("");
  ftEl("sft-trangthai").value = f?.trang_thai || "chua_bat_dau";
  // Chờ duyệt / Từ chối do yêu cầu gốc (menu Yêu cầu tính năng) quyết định — không đổi ở đây.
  const owned = ["cho_duyet", "tu_choi"].includes(f?.trang_thai);
  if (owned) ftEl("sft-trangthai").innerHTML = `<option value="${f.trang_thai}">${FT_STATUS[f.trang_thai].label}</option>`;
  ftEl("sft-trangthai").disabled = owned;
  const users = [...(await ftLoadUsers())];
  if (f?.nguoi_phu_trach_id && !users.some((u) => u.id === f.nguoi_phu_trach_id)) users.unshift({ id: f.nguoi_phu_trach_id, name: f.nguoi_phu_trach_name });
  ftEl("sft-pt").innerHTML = `<option value="">Chọn người phụ trách</option>` + users.map((u) => `<option value="${u.id}">${sysEsc(u.name || u.username)}</option>`).join("");
  ftEl("sft-pt").value = f?.nguoi_phu_trach_id ? String(f.nguoi_phu_trach_id) : "";
  ftSyncActual();
  ftSyncDuration();
  ftRenderDrops();
  sysShow("ftform");
}
function ftNextCode(systemId) {
  const same = systemId === ftState.system.id ? ftState.list : [];
  const max = same.reduce((m, f) => Math.max(m, Number(/^TN-(\d+)$/i.exec(f.ma_tinh_nang || "")?.[1] || 0)), 0);
  return `TN-${String(max + 1).padStart(2, "0")}`;
}
function ftSyncActual() {
  const on = ["cho_nghiem_thu", "hoan_thanh"].includes(ftEl("sft-trangthai").value) || !!ftEl("sft-tt").value;
  ftEl("sft-tt").disabled = !on;
}
function ftSyncDuration() {
  const b = ftEl("sft-bd").value, h = ftEl("sft-han").value;
  const el = ftEl("sft-duration");
  if (b && h && h >= b) {
    el.hidden = false;
    el.textContent = `Thời gian thực hiện: ${Math.round((Date.parse(h) - Date.parse(b)) / 86400000) + 1} ngày`;
  } else el.hidden = true;
}
function ftCurrentDocTypes() {
  const sys = ftState.system;
  return sys.tai_lieu_bat_buoc.filter((d) => d.required);
}
function ftRenderDrops() {
  const existing = ftState.editing?.docs || [];
  ftEl("sft-drops").innerHTML = ftCurrentDocTypes()
    .map((d) => {
      const have = existing.filter((x) => x.doc_key === d.key);
      const pend = ftState.pending[d.key] || [];
      const files = [
        ...have.map((x) => `<li><a href="/api/system-features/docs/${x.id}" download>${sysEsc(x.filename)}</a>${isAdminUser() ? `<button type="button" class="sys-x" data-delexist="${x.id}" title="Xoá tài liệu">×</button>` : ""}</li>`),
        ...pend.map((x, i) => `<li class="pending">${sysEsc(x.name)} <span class="muted">(chờ tải lên)</span><button type="button" class="sys-x" data-delpend="${d.key}:${i}" title="Bỏ">×</button></li>`),
      ].join("");
      return `<div class="sys-drop" data-key="${sysEsc(d.key)}"><div class="sys-drop-zone" tabindex="0" role="button">
        <svg class="icon" aria-hidden="true"><use href="icons.svg#i-upload"/></svg><b>${sysEsc(d.label)}</b><small>${sysEsc(d.sub || "")}</small></div>
        ${files ? `<ul class="sys-drop-files">${files}</ul>` : ""}
        <input type="file" multiple hidden></div>`;
    })
    .join("");
}
function ftAddFiles(key, fileList) {
  const MAX = 50 * 1024 * 1024;
  for (const f of fileList) {
    if (f.size > MAX) {
      showToast(`"${f.name}" vượt quá 50 MB.`);
      continue;
    }
    (ftState.pending[key] ||= []).push(f);
  }
  ftRenderDrops();
}

async function ftSave(draft) {
  const body = {
    system_id: ftEl("sft-system").value,
    ma_tinh_nang: ftEl("sft-ma").value.trim(),
    ten: ftEl("sft-ten").value.trim(),
    mo_ta: ftEl("sft-mota").value.trim(),
    muc_uu_tien: ftEl("sft-uutien").value,
    don_vi_yeu_cau_id: ftEl("sft-donvi").value || null,
    nguoi_yeu_cau: ftEl("sft-nguoi").value.trim(),
    so_van_ban: ftEl("sft-vb").value.trim(),
    ngay_yeu_cau: ftEl("sft-ngayyc").value,
    ngay_bat_dau: ftEl("sft-bd").value,
    han_hoan_thanh: ftEl("sft-han").value,
    ngay_hoan_thanh_thuc_te: ftEl("sft-tt").disabled ? "" : ftEl("sft-tt").value,
    nguoi_phu_trach_id: ftEl("sft-pt").value || null,
    nguoi_phu_trach_name: ftState.editing && !ftEl("sft-pt").value ? ftState.editing.nguoi_phu_trach_name : "",
    trang_thai: ftEl("sft-trangthai").value,
    nhap: draft,
  };
  if (!body.ten) return showToast("Tên tính năng là bắt buộc.");
  if (!draft) {
    if (!body.don_vi_yeu_cau_id) return showToast("Đơn vị yêu cầu là bắt buộc.");
    if (!body.ngay_bat_dau) return showToast("Ngày bắt đầu là bắt buộc.");
    if (!body.han_hoan_thanh) return showToast("Hạn hoàn thành là bắt buộc.");
  }
  try {
    const id = ftState.editing?.id;
    const saved = await api(id ? `/api/system-features/${id}` : "/api/system-features", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
    let failed = 0;
    for (const [key, files] of Object.entries(ftState.pending)) {
      for (const f of files) {
        try {
          const r = await fetch(`/api/system-features/${saved.id}/docs/${encodeURIComponent(key)}?filename=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: f });
          if (!r.ok) {
            failed++;
            showToast(`${f.name}: ${(await r.json().catch(() => ({}))).error || "tải lên thất bại"}`);
          }
        } catch {
          failed++;
        }
      }
    }
    showToast(id ? "Đã lưu tính năng." : "Đã tạo tính năng.", failed ? "error" : "success");
    await loadSystems();
    await sysOpenDetail(Number(body.system_id));
    if (id) await sysOpenFtDetail(saved.id);
  } catch (e) {
    showToast(e.message);
  }
}

// ---------- Chưa phân loại ----------
async function sysOpenUnassigned() {
  const [list, systems] = await Promise.all([api(`/api/system-features/unassigned${deptParam("?")}`), api(`/api/systems${deptParam("?")}`)]);
  sysState.unassigned = list;
  sysState.allSystems = systems;
  sysRenderUnassigned();
  sysShow("unassigned");
}
function sysRenderUnassigned() {
  const list = sysState.unassigned || [];
  const systems = sysState.allSystems || [];
  sysEl("sys-un-empty").hidden = list.length > 0;
  sysEl("sys-un-tbody").innerHTML = sunPagination
    .slice(list)
    .map(
      (f) => `<tr>
      <td class="muted">${sysEsc(f.ma_tinh_nang)}</td>
      <td><b>${sysEsc(f.ten)}</b></td>
      <td>${sysEsc(f.he_thong_goc) || "—"}</td>
      <td>${ftBadge(f)}</td>
      <td><select data-unsel="${f.id}"><option value="">Chọn hệ thống</option>${systems.map((s) => `<option value="${s.id}">${sysEsc(s.ma_he_thong)} · ${sysEsc(s.ten_he_thong)}</option>`).join("")}</select></td>
      <td style="white-space:nowrap"><button type="button" class="primary" data-unassign="${f.id}">Gán</button>
        ${f.he_thong_goc ? `<button type="button" class="sys-view-btn" data-uncreate="${f.id}">Tạo hệ thống "${sysEsc(f.he_thong_goc)}"</button>` : ""}</td>
    </tr>`,
    )
    .join("");
}

(function ftInit() {
  sysEl("sys-detail-back").addEventListener("click", (e) => (e.preventDefault(), loadSystems()));
  sysEl("sys-un-back").addEventListener("click", (e) => (e.preventDefault(), loadSystems()));
  sysEl("sys-ft-crumb-sys").addEventListener("click", (e) => (e.preventDefault(), loadSystems()));
  sysEl("sys-ft-crumb-detail").addEventListener("click", (e) => (e.preventDefault(), sysOpenDetail(ftState.system.id)));
  sysEl("sft-cancel").addEventListener("click", () => (ftState.editing ? sysOpenFtDetail(ftState.editing.id) : sysOpenDetail(ftState.system.id)));
  sysEl("sys-d-edit").addEventListener("click", () => sysOpenForm(ftState.system.id, { fromDetail: true }));
  sysEl("sys-d-add").addEventListener("click", () => sysOpenFtForm(null));
  sysEl("sys-banner").addEventListener("click", (e) => e.target.closest("#sys-banner-btn") && sysOpenUnassigned());
  sysEl("sys-ft-search").addEventListener("input", (e) => {
    ftState.q = e.target.value;
    sftPagination.reset();
    renderFeatures();
  });
  sysEl("sys-ft-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ftab]");
    if (!b) return;
    ftState.tab = b.dataset.ftab;
    sftPagination.reset();
    renderFeatures();
  });
  sysEl("sys-ft-tbody").addEventListener("click", (e) => {
    const a = e.target.closest("[data-ftedit]");
    if (!a) return;
    e.preventDefault();
    const fid = Number(a.dataset.ftedit);
    // Làm mới danh sách trước khi quyết định: yêu cầu có thể vừa được duyệt ở nơi khác trong lúc bảng này đang mở.
    api(`/api/systems/${ftState.system.id}/features${deptParam("?")}`)
      .then((fresh) => {
        ftState.list = fresh;
        renderFeatures();
        const f = fresh.find((x) => x.id === fid);
        if (f && f.trang_thai === "cho_duyet") return sysGoApprove(f);
        return sysOpenFtDetail(fid);
      })
      .catch((err) => showToast(err.message));
  });
  for (const id of ["sft-bd", "sft-han"]) sysEl(id).addEventListener("input", ftSyncDuration);
  sysEl("sft-tt").addEventListener("input", () => {
    if (sysEl("sft-tt").value) sysEl("sft-trangthai").value = "hoan_thanh";
  });
  sysEl("sft-trangthai").addEventListener("change", ftSyncActual);
  sysEl("sft-system").addEventListener("change", async (e) => {
    // Đổi hệ thống: tải lại loại tài liệu bắt buộc của hệ thống đó + gợi ý mã.
    const sid = Number(e.target.value);
    if (sid === ftState.system.id) return;
    const [sys, list] = await Promise.all([api(`/api/systems/${sid}${deptParam("?")}`), api(`/api/systems/${sid}/features${deptParam("?")}`)]);
    ftState.system = sys;
    ftState.list = list;
    if (!ftState.editing) sysEl("sft-ma").value = ftNextCode(sid);
    ftRenderDrops();
  });
  sysEl("sys-ft-form-view").addEventListener("submit", (e) => (e.preventDefault(), ftSave(false)));
  sysEl("sft-draft").addEventListener("click", () => ftSave(true));
  const drops = sysEl("sft-drops");
  drops.addEventListener("click", async (e) => {
    const dp = e.target.closest("[data-delpend]");
    if (dp) {
      const [k, i] = dp.dataset.delpend.split(":");
      ftState.pending[k].splice(Number(i), 1);
      return ftRenderDrops();
    }
    const de = e.target.closest("[data-delexist]");
    if (de) {
      if (!(await confirmDialog("Xoá tài liệu này?"))) return;
      try {
        ftState.editing = await api(`/api/system-features/docs/${de.dataset.delexist}`, { method: "DELETE" });
        ftRenderDrops();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    const zone = e.target.closest(".sys-drop-zone");
    if (zone) zone.closest(".sys-drop").querySelector("input[type=file]").click();
  });
  drops.addEventListener("change", (e) => {
    if (e.target.type !== "file") return;
    ftAddFiles(e.target.closest(".sys-drop").dataset.key, e.target.files);
  });
  drops.addEventListener("dragover", (e) => {
    const z = e.target.closest(".sys-drop-zone");
    if (!z) return;
    e.preventDefault();
    z.classList.add("over");
  });
  drops.addEventListener("dragleave", (e) => e.target.closest?.(".sys-drop-zone")?.classList.remove("over"));
  drops.addEventListener("drop", (e) => {
    const z = e.target.closest(".sys-drop-zone");
    if (!z) return;
    e.preventDefault();
    z.classList.remove("over");
    ftAddFiles(z.closest(".sys-drop").dataset.key, e.dataTransfer.files);
  });
  sysEl("sys-un-tbody").addEventListener("click", async (e) => {
    const g = e.target.closest("[data-unassign]");
    if (g) {
      const sel = sysEl("sys-un-tbody").querySelector(`[data-unsel="${g.dataset.unassign}"]`);
      if (!sel.value) return showToast("Hãy chọn hệ thống để gán.");
      try {
        await api(`/api/system-features/${g.dataset.unassign}/assign`, { method: "POST", body: JSON.stringify({ system_id: Number(sel.value) }) });
        showToast("Đã gán tính năng vào hệ thống.", "success");
        await loadSystems();
        await sysOpenUnassigned();
      } catch (err) {
        showToast(err.message);
      }
      return;
    }
    const c = e.target.closest("[data-uncreate]");
    if (c) {
      const f = (sysState.unassigned || []).find((x) => x.id === Number(c.dataset.uncreate));
      // Gán luôn mọi tính năng cùng tên hệ thống gốc vào hệ thống mới sau khi tạo.
      await sysOpenForm(null);
      sysState.pendingAssign = (sysState.unassigned || []).filter((x) => x.he_thong_goc === f.he_thong_goc).map((x) => x.id);
      sysEl("sys-ten").value = f.he_thong_goc;
    }
  });
})();

// ======================= Màn hình chi tiết tính năng =======================
const ftdState = { f: null, tab: "all", events: [] };
const ftdEl = (id) => document.getElementById(id);
const ftdSize = (n) => (n >= 1048576 ? `${(n / 1048576).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024)).toLocaleString("vi-VN")} KB`);
const ftdExt = (name) => (String(name).split(".").pop() || "").toUpperCase().slice(0, 4);
const ftdExtCls = (ext) => ({ DOCX: "doc", DOC: "doc", PDF: "pdf", XLSX: "xls", XLS: "xls", CSV: "xls", PPTX: "ppt", PPT: "ppt" })[ext] || "img";
const ftdDocTypes = () => {
  const own = (ftState.system?.tai_lieu_bat_buoc || []).map((d) => ({ key: d.key, label: d.label, required: d.required }));
  return [...own, { key: "khac", label: "Khác", required: false }];
};

// Tính năng đang "Chờ duyệt" chưa có màn chi tiết: cảnh báo và đưa người dùng tới Yêu cầu tính năng để duyệt trước.
async function sysGoApprove(f) {
  // Chỉ ĐƠN VỊ THỰC HIỆN mới duyệt được; đơn vị yêu cầu chỉ theo dõi — nói rõ đang chờ ai duyệt.
  const isTarget = f.don_vi_thuc_hien_id != null && f.don_vi_thuc_hien_id === state.currentDepartmentId;
  const who = f.don_vi_thuc_hien_name || "đơn vị thực hiện";
  const go = await confirmDialog(
    isTarget
      ? `Tính năng "${f.ten}" chưa được duyệt. Cần duyệt yêu cầu này ở menu Yêu cầu tính năng trước khi xem chi tiết và quản lý tài liệu, tiến độ.`
      : `Tính năng "${f.ten}" đang chờ ${who} duyệt. Sau khi được duyệt bạn mới xem chi tiết và theo dõi tài liệu, tiến độ được.`,
    { title: "Tính năng chưa được duyệt", okText: isTarget ? "Đi tới duyệt" : "Xem yêu cầu", cancelText: isTarget ? "Để sau" : "Đóng" },
  );
  if (!go) return;
  document.querySelector('.nav-item[data-page="feature-requests"]')?.click();
  try {
    await loadFeatureRequests();
    const fr = state.featureRequests.find((r) => r.id === f.feature_request_id);
    if (fr) openFrDetailDialog(fr);
    else showToast("Không thấy yêu cầu trong phòng ban đang chọn — hãy chuyển sang phòng ban liên quan để xem.");
  } catch (err) {
    showToast(err.message);
  }
}

async function sysOpenFtDetail(id) {
  const [f, events] = await Promise.all([api(`/api/system-features/${id}`), api(`/api/system-features/${id}/events`)]);
  if (!ftState.system || ftState.system.id !== f.system_id) {
    if (f.system_id) ftState.system = await api(`/api/systems/${f.system_id}`);
  }
  ftState.current = f;
  ftdState.f = f;
  ftdState.events = events;
  ftdState.tab = "all";
  renderFtDetail();
  sysShow("ftdetail");
}

function renderFtDetail() {
  const f = ftdState.f;
  const sys = ftState.system;
  ftdEl("ftd-crumb-detail").textContent = sys?.ten_he_thong || "";
  ftdEl("ftd-crumb-cur").textContent = f.ten;
  ftdEl("ftd-code").textContent = f.ma_tinh_nang;
  const st = FT_STATUS[f.trang_thai_hien_thi] || FT_STATUS.chua_bat_dau;
  const sb = ftdEl("ftd-status");
  sb.className = `status-badge ${st.cls}`;
  sb.textContent = st.label + (f.trang_thai_hien_thi === "qua_han" ? ` ${f.qua_han_ngay} ngày` : "");
  const db = ftdEl("ftd-days");
  if (f.con_ngay != null && f.trang_thai_hien_thi !== "qua_han" && !["cho_duyet", "tu_choi"].includes(f.trang_thai)) {
    db.hidden = false;
    db.className = "status-badge status-default";
    db.textContent = f.con_ngay === 0 ? "Hạn hôm nay" : `Còn ${f.con_ngay} ngày`;
  } else db.hidden = true;
  ftdEl("ftd-title").textContent = f.ten;
  ftdEl("ftd-desc").textContent = f.mo_ta || "Chưa có mô tả.";
  // Mỗi nhãn một màu: Ưu tiên theo mức (Cao đỏ / Trung bình cam / Thấp xanh nhạt), Văn bản yêu cầu xanh dương, nguồn yêu cầu xanh ngọc.
  const chips = [[`Ưu tiên: ${FT_PRIORITY[f.muc_uu_tien] || ""}`, `p-${f.muc_uu_tien}`]];
  if (f.so_van_ban) chips.push([`Văn bản yêu cầu: ${f.so_van_ban}`, "doc"]);
  if (f.he_thong_goc && f.feature_request_id) chips.push([`Từ yêu cầu tính năng`, "src"]);
  ftdEl("ftd-chips").innerHTML = chips.map(([c, k]) => `<span class="ftd-chip ${k}">${sysEsc(c)}</span>`).join("");
  ftdEl("ftd-sched").innerHTML = f.han_mong_muon && f.han_du_kien && f.han_mong_muon !== f.han_du_kien ? `<div class="sys-ft-want${f.han_du_kien > f.han_mong_muon ? " late" : ""}" style="margin-top:8px">${ftWantedNote(f).replace(/^<div[^>]*>|<\/div>$/g, "")}${f.ly_do_dieu_chinh ? ` — ${sysEsc(f.ly_do_dieu_chinh)}` : ""}</div>` : "";

  // Thông tin thực hiện
  ftdEl("ftd-pct").textContent = `${f.tien_do}%`;
  ftdEl("ftd-bar").style.width = `${f.tien_do}%`;
  const rows = [
    ["Đơn vị yêu cầu", f.don_vi_yeu_cau_name],
    ["Người yêu cầu", f.nguoi_yeu_cau],
    ["Ngày yêu cầu", f.ngay_yeu_cau ? ftDate(f.ngay_yeu_cau) : ""],
    ["Ngày bắt đầu", f.ngay_bat_dau ? ftDate(f.ngay_bat_dau) : ""],
    ["Hạn hoàn thành", f.han_hoan_thanh ? ftDate(f.han_hoan_thanh) : ""],
    ["Hoàn thành thực tế", f.ngay_hoan_thanh_thuc_te ? ftDate(f.ngay_hoan_thanh_thuc_te) : "Chưa hoàn thành"],
    ["Người phụ trách", f.nguoi_phu_trach_name],
    ["Phiên bản phát hành", f.phien_ban_phat_hanh],
  ];
  ftdEl("ftd-info").innerHTML = rows.map(([l, v]) => `<div><dt>${l}</dt><dd>${sysEsc(v) || "—"}</dd></div>`).join("");

  // Bộ tài liệu bắt buộc
  const req = f.required_docs;
  const got = req.filter((d) => d.has).length;
  ftdEl("ftd-req-count").textContent = `${got}/${req.length}`;
  ftdEl("ftd-req").innerHTML = req
    .map((d) => {
      const n = f.docs.filter((x) => x.doc_key === d.key).length;
      return `<li><i class="ftd-tick${d.has ? " on" : ""}">${d.has ? "✓" : ""}</i><span>${sysEsc(d.label)}</span><em>${n ? `${n} tệp` : "Chưa có"}</em></li>`;
    })
    .join("");

  // Lịch sử
  ftdEl("ftd-events").innerHTML = ftdState.events.length
    ? ftdState.events
        .map((e) => `<li class="k-${sysEsc(e.kind)}"><div>${sysEsc(e.text)}</div><small class="muted">${[e.actor, ftDate(String(e.created_at).slice(0, 10))].filter(Boolean).map(sysEsc).join(" · ")}</small></li>`)
        .join("")
    : `<li class="muted">Chưa có hoạt động.</li>`;
  renderFtDocs();
}

function renderFtDocs() {
  const f = ftdState.f;
  const types = ftdDocTypes();
  const count = (k) => f.docs.filter((d) => d.doc_key === k).length;
  const last = f.docs.reduce((m, d) => (String(d.created_at) > m ? String(d.created_at) : m), "");
  ftdEl("ftd-docs-sub").textContent = `${f.docs.length} tài liệu${last ? ` · cập nhật gần nhất ${ftDate(last.slice(0, 10))}` : ""}`;
  const tabs = [["all", "Tất cả", f.docs.length], ...types.filter((t) => t.required || count(t.key) || t.key === "khac").map((t) => [t.key, t.label, count(t.key)])];
  ftdEl("ftd-doc-tabs").innerHTML = tabs.map(([k, l, n]) => `<button type="button" class="sys-seg-btn${ftdState.tab === k ? " active" : ""}" data-dtab="${sysEsc(k)}">${sysEsc(l)} <span class="sys-tab-n">${n}</span></button>`).join("");
  const label = (k) => types.find((t) => t.key === k)?.label || "Khác";
  // Mỗi loại tài liệu một màu riêng (theo thứ tự loại trong hệ thống), "Khác" luôn xám xanh.
  const typeCls = (k) => {
    const i = types.findIndex((t) => t.key === k);
    return k === "khac" || i < 0 ? "dt-x" : `dt-${i % 7}`;
  };
  const docs = f.docs.filter((d) => ftdState.tab === "all" || d.doc_key === ftdState.tab).slice().reverse();
  ftdEl("ftd-doc-list").innerHTML = docs.length
    ? docs
        .map((d) => {
          const ext = ftdExt(d.filename);
          return `<div class="ftd-doc">
            <span class="ftd-ext ${ftdExtCls(ext)}">${sysEsc(ext)}</span>
            <div class="ftd-doc-main"><b>${sysEsc(d.filename)}</b><small class="muted">${[d.uploaded_by_name, ftDate(String(d.created_at).slice(0, 10)), ftdSize(d.size)].filter(Boolean).map(sysEsc).join(" · ")}</small>${d.change_note ? `<small class="ftd-note">${sysEsc(d.change_note)}</small>` : ""}</div>
            <span class="ftd-doc-type ${typeCls(d.doc_key)}">${sysEsc(label(d.doc_key))}</span>
            <span class="muted ftd-ver">${d.version ? "v" + sysEsc(d.version) : ""}</span>
            <button type="button" class="ftd-ico view" data-docview="${d.id}" title="Xem" aria-label="Xem"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-eye"/></svg></button>
            <a class="ftd-ico dl" href="/api/system-features/docs/${d.id}" download title="Tải xuống" aria-label="Tải xuống"><svg class="icon" aria-hidden="true"><use href="icons.svg#i-download"/></svg></a>
            ${isAdminUser() ? `<span class="ftd-more"><button type="button" class="ftd-dots" data-docmore="${d.id}" title="Thêm" aria-label="Thêm">⋯</button><div class="ftd-more-menu" hidden><button type="button" data-docdel="${d.id}">Xoá tài liệu</button></div></span>` : '<span class="ftd-more"></span>'}
          </div>`;
        })
        .join("")
    : `<p class="muted" style="padding:16px;text-align:center">Chưa có tài liệu nào.</p>`;
}

// ---------- Tải tài liệu lên ----------
const upState = { files: [], type: "dac_ta", busy: false };
function upSuggestVersion(type) {
  const same = ftdState.f.docs.filter((d) => d.doc_key === type);
  if (!same.length) return { ver: "1.0", hint: "Tính năng chưa có tài liệu loại này. Tệp tải lên sẽ là phiên bản 1.0." };
  let best = [1, 0];
  for (const d of same) {
    const m = /(\d+)\.(\d+)/.exec(d.version || "");
    if (m && (Number(m[1]) > best[0] || (Number(m[1]) === best[0] && Number(m[2]) > best[1]))) best = [Number(m[1]), Number(m[2])];
  }
  return { ver: `${best[0]}.${best[1] + 1}`, hint: `Đã có ${same.length} tài liệu loại này (mới nhất v${best[0]}.${best[1]}). Tệp tải lên gợi ý là phiên bản ${best[0]}.${best[1] + 1}.` };
}
function upRenderTypes() {
  sysEl("sys-up-types").innerHTML = ftdDocTypes().map((t) => `<button type="button" class="sys-seg-btn${upState.type === t.key ? " active" : ""}" data-uptype="${sysEsc(t.key)}">${sysEsc(t.label)}</button>`).join("");
  const s = upSuggestVersion(upState.type);
  sysEl("sys-up-hint").textContent = s.hint;
  sysEl("sys-up-ver").value = s.ver;
}
function upRenderFiles() {
  sysEl("sys-up-files").innerHTML = upState.files
    .map(
      (f, i) => `<div class="sys-up-file"><span class="ftd-ext ${ftdExtCls(ftdExt(f.file.name))}">${sysEsc(ftdExt(f.file.name))}</span>
      <div class="sys-up-file-main"><div class="sys-up-file-top"><b>${sysEsc(f.file.name)}</b><span class="${f.err ? "err" : f.pct === 100 ? "ok" : "muted"}">${f.err ? sysEsc(f.err) : f.pct === 100 ? "Xong" : f.pct > 0 ? f.pct + "%" : ""} · ${ftdSize(f.file.size)}</span></div>
      <div class="sys-bar"><i style="width:${f.pct}%"></i></div></div>
      <button type="button" class="sys-x" data-upx="${i}" ${upState.busy ? "disabled" : ""} title="Bỏ">×</button></div>`,
    )
    .join("");
  sysEl("sys-up-submit").textContent = upState.files.length ? `Lưu ${upState.files.length} tài liệu` : "Lưu tài liệu";
}
function upAddFiles(list) {
  for (const file of list) {
    if (file.size > 50 * 1024 * 1024) {
      showToast(`"${file.name}" vượt quá 50 MB.`);
      continue;
    }
    upState.files.push({ file, pct: 0, err: "" });
  }
  upRenderFiles();
}
function upSend(f, key, meta) {
  return new Promise((resolve) => {
    const q = new URLSearchParams({ filename: f.file.name, version: meta.version, release_date: meta.date, note: meta.note });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/system-features/${ftdState.f.id}/docs/${encodeURIComponent(key)}?${q}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        f.pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
        upRenderFiles();
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) f.pct = 100;
      else {
        try {
          f.err = JSON.parse(xhr.responseText).error || "Tải lên thất bại";
        } catch {
          f.err = "Tải lên thất bại";
        }
      }
      upRenderFiles();
      resolve(!f.err);
    };
    xhr.onerror = () => {
      f.err = "Lỗi mạng";
      upRenderFiles();
      resolve(false);
    };
    xhr.send(f.file);
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".ftd-more")) document.querySelectorAll(".ftd-more-menu").forEach((m) => (m.hidden = true));
});
(function ftdInit() {
  const back = (id) => (e) => (e.preventDefault(), id());
  sysEl("ftd-crumb-sys").addEventListener("click", back(loadSystems));
  sysEl("ftd-crumb-detail").addEventListener("click", back(() => sysOpenDetail(ftState.system.id)));
  sysEl("ftd-edit").addEventListener("click", () => sysOpenFtForm(ftdState.f.id));
  sysEl("ftd-doc-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dtab]");
    if (!b) return;
    ftdState.tab = b.dataset.dtab;
    renderFtDocs();
  });
  sysEl("ftd-doc-list").addEventListener("click", async (e) => {
    const v = e.target.closest("[data-docview]");
    if (v) return window.open(`/api/system-features/docs/${v.dataset.docview}?inline=1`, "_blank", "noopener");
    const more = e.target.closest("[data-docmore]");
    if (more) {
      const menu = more.parentElement.querySelector(".ftd-more-menu");
      const open = menu.hidden;
      document.querySelectorAll(".ftd-more-menu").forEach((m) => (m.hidden = true));
      menu.hidden = !open;
      return;
    }
    const d = e.target.closest("[data-docdel]");
    if (d && (await confirmDialog("Xoá tài liệu này?"))) {
      try {
        await api(`/api/system-features/docs/${d.dataset.docdel}`, { method: "DELETE" });
        await sysOpenFtDetail(ftdState.f.id);
        showToast("Đã xoá tài liệu.", "success");
      } catch (err) {
        showToast(err.message);
      }
    }
  });

  // Upload dialog
  const dlg = sysEl("sys-up-dialog");
  sysEl("ftd-upload").addEventListener("click", () => {
    upState.files = [];
    upState.busy = false;
    upState.type = ftdDocTypes().find((t) => t.required && !ftdState.f.docs.some((d) => d.doc_key === t.key))?.key || ftdDocTypes()[0].key;
    sysEl("sys-up-sub").textContent = `${ftdState.f.ma_tinh_nang} · ${ftdState.f.ten}`;
    sysEl("sys-up-date").value = ftToday();
    sysEl("sys-up-note").value = "";
    upRenderTypes();
    upRenderFiles();
    dlg.showModal();
  });
  sysEl("sys-up-cancel").addEventListener("click", () => dlg.close());
  const drop = sysEl("sys-up-drop");
  drop.addEventListener("click", () => sysEl("sys-up-input").click());
  sysEl("sys-up-input").addEventListener("change", (e) => (upAddFiles(e.target.files), (e.target.value = "")));
  drop.addEventListener("dragover", (e) => (e.preventDefault(), drop.classList.add("over")));
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => (e.preventDefault(), drop.classList.remove("over"), upAddFiles(e.dataTransfer.files)));
  sysEl("sys-up-types").addEventListener("click", (e) => {
    const b = e.target.closest("[data-uptype]");
    if (!b) return;
    upState.type = b.dataset.uptype;
    upRenderTypes();
  });
  sysEl("sys-up-files").addEventListener("click", (e) => {
    const x = e.target.closest("[data-upx]");
    if (!x || upState.busy) return;
    upState.files.splice(Number(x.dataset.upx), 1);
    upRenderFiles();
  });
  sysEl("sys-up-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const todo = upState.files.filter((f) => f.pct < 100);
    if (!todo.length) return showToast("Hãy chọn tệp cần tải lên.");
    upState.busy = true;
    const meta = { version: sysEl("sys-up-ver").value.trim(), date: sysEl("sys-up-date").value, note: sysEl("sys-up-note").value.trim() };
    let ok = 0;
    for (const f of todo) {
      f.err = "";
      if (await upSend(f, upState.type, meta)) ok++;
    }
    upState.busy = false;
    upRenderFiles();
    if (ok) await sysOpenFtDetail(ftdState.f.id).catch(() => {});
    if (ok === todo.length) {
      dlg.close();
      showToast(`Đã tải lên ${ok} tài liệu.`, "success");
    } else showToast("Một số tệp tải lên chưa thành công.");
  });

  // Cập nhật tiến độ
  const pd = sysEl("sys-prog-dialog");
  sysEl("ftd-progress").addEventListener("click", () => {
    const f = ftdState.f;
    sysEl("sys-prog-sub").textContent = `${f.ma_tinh_nang} · ${f.ten}`;
    const owned = ["cho_duyet", "tu_choi"].includes(f.trang_thai);
    sysEl("sys-prog-status").innerHTML = owned
      ? `<option value="${f.trang_thai}">${FT_STATUS[f.trang_thai].label}</option>`
      : ["chua_bat_dau", "dang_thuc_hien", "cho_nghiem_thu", "hoan_thanh"].map((k) => `<option value="${k}">${FT_STATUS[k].label}</option>`).join("");
    sysEl("sys-prog-status").value = f.trang_thai;
    sysEl("sys-prog-status").disabled = owned;
    sysEl("sys-prog-range").value = f.tien_do;
    sysEl("sys-prog-pct").textContent = `${f.tien_do}%`;
    sysEl("sys-prog-ver").value = f.phien_ban_phat_hanh || "";
    sysEl("sys-prog-note").value = "";
    pd.showModal();
  });
  sysEl("sys-prog-range").addEventListener("input", (e) => {
    sysEl("sys-prog-pct").textContent = `${e.target.value}%`;
    const st = sysEl("sys-prog-status");
    if (st.disabled) return;
    const v = Number(e.target.value);
    if (v === 100) st.value = "hoan_thanh";
    else if (v > 0 && st.value === "chua_bat_dau") st.value = "dang_thuc_hien";
    else if (v < 100 && st.value === "hoan_thanh") st.value = "dang_thuc_hien";
  });
  sysEl("sys-prog-cancel").addEventListener("click", () => pd.close());
  sysEl("sys-prog-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api(`/api/system-features/${ftdState.f.id}/progress`, {
        method: "POST",
        body: JSON.stringify({ tien_do: Number(sysEl("sys-prog-range").value), trang_thai: sysEl("sys-prog-status").value, phien_ban_phat_hanh: sysEl("sys-prog-ver").value.trim(), ghi_chu: sysEl("sys-prog-note").value.trim() }),
      });
      pd.close();
      await sysOpenFtDetail(ftdState.f.id);
      showToast("Đã cập nhật tiến độ.", "success");
    } catch (err) {
      showToast(err.message);
    }
  });
})();
