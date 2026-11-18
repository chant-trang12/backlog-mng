// ---- Bộ lọc chọn NHIỀU giá trị (dùng chung) ----
//
// Biến 1 <select> bộ lọc thành ô chọn nhiều giá trị: giữ nguyên <select> làm khung hiển thị (cùng giao diện các ô lọc khác), chỉ
// chặn dropdown 1-lựa-chọn của 12-select.js và mở popup riêng có tick từng dòng (cùng style .dd-popup của hệ thống). Không chọn gì =
// "Tất cả" (không lọc). Dùng:
//   const mf = setupMultiFilter("fr-filter-he-thong", () => render());
//   mf.setOptions([{ value: "a", label: "A" }, ...]);   // nạp lại danh sách, giữ các lựa chọn còn hợp lệ
//   mf.selected   // Set các value đang chọn (rỗng = Tất cả)
const MULTI_FILTERS = {};

function setupMultiFilter(selectId, onChange) {
  const select = document.getElementById(selectId);
  if (!select) return { selected: new Set(), setOptions() {} };
  if (MULTI_FILTERS[selectId]) return MULTI_FILTERS[selectId];
  select.dataset.multiFilter = "1"; // 12-select.js bỏ qua select này
  const mf = { select, options: [], selected: new Set(), onChange };
  MULTI_FILTERS[selectId] = mf;

  const summary = () => {
    const picked = mf.options.filter((o) => mf.selected.has(o.value));
    let text = "Tất cả";
    if (picked.length === 1) text = picked[0].label;
    else if (picked.length === 2) text = `${picked[0].label}, ${picked[1].label}`;
    else if (picked.length > 2) text = `${picked.length} đã chọn`;
    select.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = text;
    opt.title = picked.map((o) => o.label).join(", ");
    select.appendChild(opt);
    select.title = opt.title;
    select.classList.toggle("mf-active", picked.length > 0);
  };
  mf.setOptions = (options) => {
    mf.options = options;
    const valid = new Set(options.map((o) => o.value));
    mf.selected = new Set([...mf.selected].filter((v) => valid.has(v)));
    summary();
  };
  mf.change = () => {
    summary();
    mf.onChange?.();
  };
  summary();

  // ---- popup ----
  let popup = null;
  function close() {
    if (!popup) return;
    if (typeof popup.hidePopover === "function" && popup.matches(":popover-open")) popup.hidePopover();
    popup.remove();
    popup = null;
    select.classList.remove("dd-open");
  }
  function position() {
    const r = select.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 240), vw - 16);
    popup.style.minWidth = `${width}px`;
    popup.style.maxWidth = `${Math.max(width, Math.min(420, vw - 16))}px`;
    const pw = popup.offsetWidth;
    popup.style.left = `${Math.min(Math.max(8, r.left), vw - pw - 8)}px`;
    const spaceBelow = vh - r.bottom - 8;
    const openUp = spaceBelow < 240 && r.top - 8 > spaceBelow;
    popup.style.maxHeight = `${Math.max(160, Math.min(380, (openUp ? r.top - 8 : spaceBelow) - 6))}px`;
    if (openUp) {
      popup.style.top = "";
      popup.style.bottom = `${vh - r.top + 4}px`;
    } else {
      popup.style.bottom = "";
      popup.style.top = `${r.bottom + 4}px`;
    }
  }
  // Nút "Chọn tất cả" sáng màu khi mọi dòng đang hiện đã được tick (và có ít nhất 1 dòng).
  function syncAllBtn() {
    const btn = popup?.querySelector('[data-act="all"]');
    if (!btn) return;
    const term = (popup.querySelector(".dd-search")?.value ?? "").trim().toLowerCase();
    const visible = mf.options.filter((o) => !term || o.label.toLowerCase().includes(term));
    const on = visible.length > 0 && visible.every((o) => mf.selected.has(o.value));
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
  }
  function renderList(list, term) {
    list.textContent = "";
    const t = term.trim().toLowerCase();
    const rows = mf.options.filter((o) => !t || o.label.toLowerCase().includes(t));
    for (const o of rows) {
      const row = document.createElement("div");
      row.className = "dd-option mf-option" + (mf.selected.has(o.value) ? " is-selected" : "");
      row.setAttribute("role", "option");
      row.title = o.label;
      row.innerHTML = `<span class="mf-box" aria-hidden="true"><svg class="dd-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg></span><span class="dd-option-text"></span>`;
      row.querySelector(".dd-option-text").textContent = o.label;
      row.addEventListener("click", () => {
        if (mf.selected.has(o.value)) mf.selected.delete(o.value);
        else mf.selected.add(o.value);
        row.classList.toggle("is-selected", mf.selected.has(o.value));
        syncAllBtn();
        mf.change();
      });
      list.appendChild(row);
    }
    if (!rows.length) list.insertAdjacentHTML("beforeend", '<div class="dd-empty">Không có lựa chọn phù hợp</div>');
    syncAllBtn();
  }
  function open() {
    if (popup) return close();
    popup = document.createElement("div");
    popup.className = "dd-popup mf-popup";
    popup.setAttribute("role", "listbox");
    popup.setAttribute("aria-multiselectable", "true");
    const bar = document.createElement("div");
    bar.className = "mf-actions";
    bar.innerHTML = '<button type="button" class="small" data-act="all">Chọn tất cả</button><button type="button" class="small" data-act="none">Bỏ chọn</button>';
    popup.appendChild(bar);
    let search = null;
    if (mf.options.length >= 8) {
      search = document.createElement("input");
      search.type = "search";
      search.className = "dd-search";
      search.placeholder = "Tìm nhanh…";
      popup.appendChild(search);
    }
    const list = document.createElement("div");
    list.className = "dd-list";
    popup.appendChild(list);
    bar.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      const term = (search?.value ?? "").trim().toLowerCase();
      const visible = mf.options.filter((o) => !term || o.label.toLowerCase().includes(term));
      if (act === "all") visible.forEach((o) => mf.selected.add(o.value));
      else if (term) visible.forEach((o) => mf.selected.delete(o.value));
      else mf.selected.clear();
      renderList(list, search?.value ?? "");
      mf.change();
    });
    if (search) search.addEventListener("input", () => { renderList(list, search.value); position(); });
    (select.closest("dialog") ?? document.body).appendChild(popup);
    if (typeof popup.showPopover === "function") {
      popup.setAttribute("popover", "manual");
      popup.showPopover();
    }
    select.classList.add("dd-open");
    renderList(list, "");
    position();
    search?.focus({ preventScroll: true });
  }

  select.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    select.focus({ preventScroll: true });
    open();
  });
  select.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      if (!popup) open();
    } else if (e.key === "Escape" || e.key === "Tab") close();
  });
  document.addEventListener(
    "mousedown",
    (e) => {
      if (popup && !popup.contains(e.target) && e.target !== select) close();
    },
    true,
  );
  document.addEventListener("keydown", (e) => {
    if (popup && e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }, true);
  window.addEventListener("resize", close);
  return mf;
}
