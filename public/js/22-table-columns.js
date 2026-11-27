// ---- Sắp xếp cột + chế độ hiển thị cột "Thao tác" ----
// 1. Một nút "Cột hiển thị" cho các bảng 1 tầng tiêu đề (ALLOWLIST): bật/tắt
//    cột + kéo thả (hoặc ↑/↓) đổi thứ tự, tuỳ chọn ghim cột Thao tác, khôi phục
//    mặc định. Lưu riêng từng bảng trong localStorage của trình duyệt. Bảng đã có
//    menu "Cột hiển thị" riêng (Nhiệm vụ, Yêu cầu tính năng, Sự cố — NATIVE):
//    nút cũ được ẩn, phần bật/tắt cột đi qua đúng menu cũ (giữ state + lưu cũ).
//    Mặc định cột Thao tác đứng ngay sau các cột khoá (ô chọn, STT).
// 2. Cột Thao tác (ô có .actions-cell, trừ bảng BC tuần và bảng trong popup):
//    - mặc định (đứng cuối): thu về 0px, rê chuột vào dòng thì thanh nút hiện
//      nổi ở mép phải phần đang nhìn thấy — kiểu Gmail (class tc-actions-hover);
//    - người dùng bật "Ghim": cột luôn hiện ở mép phải (tc-actions-pin);
//    - người dùng kéo cột lên vị trí khác: hiển thị như cột thường.
//    Màn cảm ứng / ≤720px: CSS luôn hiện như cột thường (theme-vidc.css).
// Thứ tự cột áp bằng cách DI CHUYỂN ô sau khi bảng vẽ xong (MutationObserver)
// — không sửa code dựng bảng; ô giữ nguyên listener, data-col, thuộc tính
// hidden của menu "Cột hiển thị". Cột đầu (checkbox, STT; bảng Nhân sự thêm
// Họ và Tên) bị khoá vì CSS/JS cũ đang dựa vào vị trí của chúng.
(function () {
  const ALLOWLIST = [
    "task-table",
    "fr-table",
    "member-table",
    "incident-table",
    "support-table",
    "training-table",
    "ticket-table",
    "compliance-table",
    "danhgia-table",
    "creation-rate-table",
    "roadmap-table",
  ];
  const EXTRA_LOCKED = { "member-table": 3 };
  const NATIVE = {
    "task-table": { wrap: "task-col-menu-wrap", list: "task-col-menu-list", render: "renderTaskColMenu", reset: "task-col-menu-reset" },
    "fr-table": { wrap: "fr-col-menu-wrap", list: "fr-col-menu-list", render: "renderFrColMenu", reset: "fr-col-menu-reset" },
    "incident-table": { wrap: "incident-col-menu-wrap", list: "incident-col-menu-list", render: "renderIncidentColMenu", reset: "incident-col-menu-reset" },
  };
  const LS_PREFIX = "tc-layout:";

  const headerRow = (table) => table.tHead?.rows[0] ?? null;
  const isSingleHeader = (table) => table.tHead?.rows.length === 1;
  const hasActions = (table) => !!table.querySelector(":scope > tbody > tr > td > .actions-cell");

  function loadPrefs(id) {
    try {
      const v = JSON.parse(localStorage.getItem(LS_PREFIX + id) || "null");
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  }
  function savePrefs(id, prefs) {
    try {
      localStorage.setItem(LS_PREFIX + id, JSON.stringify(prefs));
    } catch {
      // Không lưu được (chế độ ẩn danh...) — vẫn áp dụng cho phiên hiện tại.
    }
  }

  // ---- Khoá cột & danh sách cột (theo thứ tự GỐC của markup) ----
  function initHeader(table) {
    const row = headerRow(table);
    if (!row || row.dataset.tcInit) return !!row;
    const cells = [...row.cells];
    const actionsLast = hasActions(table) || /thao tác|^$/i.test(cells.at(-1)?.textContent.trim() ?? "x");
    cells.forEach((th, i) => {
      th.dataset.tcKey = i === cells.length - 1 && actionsLast ? "actions" : `c${i}`;
      if (th.dataset.tcKey === "actions" && !th.textContent.trim()) th.textContent = "Thao tác";
      th.dataset.tcLabel =
        th.textContent.replace(/\s+/g, " ").trim() ||
        (th.dataset.tcKey === "actions" ? "Thao tác" : th.querySelector('input[type="checkbox"]') ? "Ô chọn dòng" : `Cột ${i + 1}`);
    });
    let locked = 0;
    while (locked < cells.length && (cells[locked].querySelector('input[type="checkbox"]') || /^stt$/i.test(cells[locked].textContent.trim()))) locked++;
    locked = Math.max(locked, EXTRA_LOCKED[table.id] ?? 0);
    row.dataset.tcLocked = String(locked);
    const keys = cells.map((c) => c.dataset.tcKey);
    // Thứ tự trong markup (để gán key cho dòng mới vẽ) khác thứ tự MẶC ĐỊNH
    // hiển thị: Thao tác lên ngay sau các cột khoá.
    row.dataset.tcOriginal = keys.join(",");
    const rest = keys.filter((k) => k !== "actions");
    row.dataset.tcDefault = (keys.includes("actions") ? [...rest.slice(0, locked), "actions", ...rest.slice(locked)] : keys).join(",");
    row.dataset.tcInit = "1";
    return true;
  }

  const defaultOrder = (table) => headerRow(table).dataset.tcDefault.split(",");
  const originalOrder = (table) => headerRow(table).dataset.tcOriginal.split(",");
  const lockedCount = (table) => Number(headerRow(table).dataset.tcLocked || 0);

  function currentOrder(table) {
    const def = defaultOrder(table);
    const saved = loadPrefs(table.id).order;
    // Bảng đổi cấu trúc (thêm/bớt cột) sau lần lưu: bỏ thứ tự cũ.
    if (!Array.isArray(saved) || saved.length !== def.length || !def.every((k) => saved.includes(k))) return def;
    const locked = def.slice(0, lockedCount(table));
    return [...locked, ...saved.filter((k) => !locked.includes(k))];
  }

  // ---- Áp thứ tự cho tiêu đề + mọi dòng đủ số ô ----
  function permuteRow(tr, order, assignFrom) {
    const cells = [...tr.cells];
    if (cells.length !== order.length) return; // dòng "chưa có dữ liệu" (colspan)...
    if (!cells[0].dataset.tcKey) cells.forEach((c, i) => (c.dataset.tcKey = assignFrom[i]));
    if (cells.every((c, i) => c.dataset.tcKey === order[i])) return;
    const byKey = new Map(cells.map((c) => [c.dataset.tcKey, c]));
    order.forEach((k) => byKey.get(k) && tr.appendChild(byKey.get(k)));
  }

  function applyOrder(table) {
    if (!ALLOWLIST.includes(table.id) || !isSingleHeader(table) || !initHeader(table)) return;
    const orig = originalOrder(table);
    const order = currentOrder(table);
    permuteRow(headerRow(table), order, orig);
    table.tBodies[0] && [...table.tBodies[0].rows].forEach((tr) => permuteRow(tr, order, orig));
  }

  // ---- Ẩn cột (bảng KHÔNG có menu cũ) ----
  // Chỉ đụng ô do chính file này ẩn (data-tc-hidden) — không hiện lại cột mà
  // app tự ẩn (VD cột Team khi phòng tính KPI theo task).
  function applyHidden(table) {
    if (!ALLOWLIST.includes(table.id) || NATIVE[table.id] || !headerRow(table)?.dataset.tcInit) return;
    const hidden = new Set(loadPrefs(table.id).hidden ?? []);
    const rows = [headerRow(table), ...(table.tBodies[0]?.rows ?? [])];
    rows.forEach((tr) =>
      [...tr.cells].forEach((c) => {
        const k = c.dataset.tcKey;
        if (!k) return;
        if (hidden.has(k)) {
          if (!c.hidden) {
            c.hidden = true;
            c.dataset.tcHidden = "1";
          }
        } else if (c.dataset.tcHidden) {
          c.hidden = false;
          delete c.dataset.tcHidden;
        }
      }),
    );
  }

  // Trạng thái bật/tắt từng cột cho bảng điều khiển.
  function visibilityInfo(table) {
    const info = new Map();
    const native = NATIVE[table.id];
    let nativeBoxes = null;
    if (native && typeof window[native.render] === "function") {
      window[native.render]();
      nativeBoxes = document.getElementById(native.list);
    }
    const locked = new Set(defaultOrder(table).slice(0, lockedCount(table)));
    const myHidden = new Set(loadPrefs(table.id).hidden ?? []);
    [...headerRow(table).cells].forEach((th) => {
      const k = th.dataset.tcKey;
      let toggleable;
      if (k === "actions") toggleable = false;
      else if (native) toggleable = !!(th.dataset.col && nativeBoxes?.querySelector(`[data-col-key="${th.dataset.col}"]`));
      else toggleable = !locked.has(k) && (!th.hidden || myHidden.has(k));
      info.set(k, { toggleable, visible: !th.hidden, autoHidden: th.hidden && !toggleable });
    });
    return info;
  }

  function setVisible(table, key, visible) {
    const native = NATIVE[table.id];
    if (native) {
      const th = headerRow(table).querySelector(`[data-tc-key="${key}"]`);
      if (typeof window[native.render] === "function") window[native.render]();
      const box = document.getElementById(native.list)?.querySelector(`[data-col-key="${th?.dataset.col}"]`);
      if (box && box.checked !== visible) {
        box.checked = visible;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      }
    } else {
      const p = loadPrefs(table.id);
      const hidden = new Set(p.hidden ?? []);
      if (visible) hidden.delete(key);
      else hidden.add(key);
      p.hidden = [...hidden];
      savePrefs(table.id, p);
      applyHidden(table);
    }
  }

  // ---- Chế độ cột Thao tác ----
  function applyActionsMode(table) {
    if (!hasActions(table) || table.classList.contains("wk-table") || table.closest("dialog")) return;
    const row = headerRow(table);
    const lastIsActions = ALLOWLIST.includes(table.id) && row?.dataset.tcInit
      ? row.lastElementChild?.dataset.tcKey === "actions"
      : true;
    const pin = ALLOWLIST.includes(table.id) && !!loadPrefs(table.id).pin;
    table.classList.toggle("tc-actions-pin", lastIsActions && pin);
    table.classList.toggle("tc-actions-hover", lastIsActions && !pin);
  }

  function processTable(table) {
    if (table.closest("dialog, .floating-table-header")) return;
    applyOrder(table);
    applyHidden(table);
    applyActionsMode(table);
    if (ALLOWLIST.includes(table.id) && isSingleHeader(table)) ensureButton(table);
  }

  // ---- Nút "Cột hiển thị" + bảng điều khiển ----
  function ensureButton(table) {
    const wrap = table.closest(".table-wrap");
    if (!wrap || wrap.dataset.tcBtn) return;
    wrap.dataset.tcBtn = "1";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<svg class="icon" aria-hidden="true"><use href="icons.svg#i-sliders"/></svg>Cột hiển thị`;
    // Không chặn nổi bọt: để các menu khác (⋯ của dòng...) tự đóng.
    btn.addEventListener("click", () => togglePanel(table, btn));
    const nativeWrap = NATIVE[table.id] && document.getElementById(NATIVE[table.id].wrap);
    if (nativeWrap) {
      // Thay nút "Cột hiển thị" cũ trên thanh công cụ bằng nút gộp, cùng vị trí.
      btn.className = "btn-col-menu tc-btn tc-btn-toolbar";
      nativeWrap.hidden = true;
      nativeWrap.style.display = "none";
      nativeWrap.before(btn);
      return;
    }
    btn.className = "tc-btn";
    const bar = document.createElement("div");
    bar.className = "tc-bar";
    bar.appendChild(btn);
    const anchor = wrap.previousElementSibling?.classList.contains("table-scroll-top") ? wrap.previousElementSibling : wrap;
    anchor.before(bar);
  }

  let panel = null;
  let panelTable = null;
  let panelBtn = null;

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panelBtn?.setAttribute("aria-expanded", "false");
    panel = panelTable = panelBtn = null;
  }

  function togglePanel(table, btn) {
    if (panel && panelTable === table) return closePanel();
    closePanel();
    panelTable = table;
    panelBtn = btn;
    panel = document.createElement("div");
    panel.className = "tc-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Cột hiển thị");
    panel.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(panel);
    renderPanel();
    btn.setAttribute("aria-expanded", "true");
    const r = btn.getBoundingClientRect();
    const pw = panel.offsetWidth;
    panel.style.left = `${Math.max(8, Math.min(r.right - pw, window.innerWidth - pw - 8))}px`;
    // Đủ chỗ thì mở xuống dưới nút, không thì mở lên trên, cùng lắm sát mép trên.
    const ph = panel.offsetHeight;
    const below = r.bottom + 6;
    const above = r.top - ph - 6;
    panel.style.top = `${below + ph <= window.innerHeight - 8 ? below : above >= 8 ? above : 8}px`;
  }

  function setOrder(table, order) {
    const prefs = loadPrefs(table.id);
    prefs.order = order;
    savePrefs(table.id, prefs);
    processTable(table);
    renderPanel();
  }

  function renderPanel() {
    if (!panel || !panelTable) return;
    const table = panelTable;
    const order = currentOrder(table);
    const locked = lockedCount(table);
    const labelOf = (k) => headerRow(table).querySelector(`[data-tc-key="${k}"]`)?.dataset.tcLabel ?? k;
    const vis = visibilityInfo(table);
    const prefs = loadPrefs(table.id);
    const actionsLast = order.at(-1) === "actions";
    const hasAct = order.includes("actions");

    panel.innerHTML = `
      <div class="tc-head">
        <strong>Cột hiển thị</strong>
        <span class="muted">Tích để hiện/ẩn, kéo thả hoặc ↑ ↓ để đổi thứ tự</span>
      </div>
      <ol class="tc-list">${order
        .map((k, i) => {
          const isLocked = i < locked;
          return `<li class="tc-item${isLocked ? " is-locked" : ""}${k === "actions" ? " is-actions" : ""}" data-key="${k}" ${isLocked ? "" : "data-draggable"}>
            <span class="tc-grip" aria-hidden="true">${isLocked ? "🔒" : "⋮⋮"}</span>
            <input type="checkbox" class="tc-vis" aria-label="Hiện cột ${escapeHtmlText(labelOf(k))}" ${vis.get(k)?.visible ? "checked" : ""} ${vis.get(k)?.toggleable ? "" : "disabled"} />
            <span class="tc-label">${escapeHtmlText(labelOf(k))}${vis.get(k)?.autoHidden ? ' <em class="muted">(ẩn tự động)</em>' : ""}</span>
            ${isLocked ? "" : `<button type="button" class="tc-move" data-dir="-1" title="Lên" ${i <= locked ? "disabled" : ""}>↑</button>
            <button type="button" class="tc-move" data-dir="1" title="Xuống" ${i === order.length - 1 ? "disabled" : ""}>↓</button>`}
          </li>`;
        })
        .join("")}</ol>
      ${hasAct ? `<label class="tc-pin${actionsLast ? "" : " is-disabled"}">
        <input type="checkbox" class="tc-pin-input" ${prefs.pin ? "checked" : ""} ${actionsLast ? "" : "disabled"} />
        Ghim cột Thao tác bên phải
        <span class="muted">${actionsLast ? "Tắt: nút thao tác hiện khi rê chuột vào dòng" : "Chỉ áp dụng khi Thao tác là cột cuối"}</span>
      </label>` : ""}
      <div class="tc-foot">
        <button type="button" class="tc-reset">Khôi phục mặc định</button>
        <button type="button" class="tc-close primary">Xong</button>
      </div>`;

    panel.querySelectorAll(".tc-move").forEach((b) =>
      b.addEventListener("click", () => {
        const key = b.closest(".tc-item").dataset.key;
        const next = currentOrder(table);
        const i = next.indexOf(key);
        const j = i + Number(b.dataset.dir);
        if (j < locked || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        setOrder(table, next);
        panel.querySelector(`.tc-item[data-key="${key}"] .tc-move[data-dir="${b.dataset.dir}"]`)?.focus();
      }),
    );
    panel.querySelectorAll(".tc-vis").forEach((box) =>
      box.addEventListener("change", () => {
        setVisible(table, box.closest(".tc-item").dataset.key, box.checked);
        renderPanel();
      }),
    );
    panel.querySelector(".tc-pin-input")?.addEventListener("change", (e) => {
      const p = loadPrefs(table.id);
      p.pin = e.target.checked;
      savePrefs(table.id, p);
      applyActionsMode(table);
    });
    panel.querySelector(".tc-reset").addEventListener("click", () => {
      try {
        localStorage.removeItem(LS_PREFIX + table.id);
      } catch {}
      // Bảng có menu cũ: "Hiện tất cả" của menu đó (state + lưu riêng của nó).
      // Không nổi bọt: tránh listener "bấm ra ngoài thì đóng" đóng luôn bảng này.
      if (NATIVE[table.id]) document.getElementById(NATIVE[table.id].reset)?.dispatchEvent(new MouseEvent("click", { bubbles: false }));
      processTable(table);
      renderPanel();
    });
    panel.querySelector(".tc-close").addEventListener("click", closePanel);

    // Kéo thả
    // Kéo thả bằng pointer events (chuột + cảm ứng), không dùng HTML5 drag & drop.
    const list = panel.querySelector(".tc-list");
    const clearMarks = () => list.querySelectorAll(".drop-before, .drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after"));
    list.addEventListener("pointerdown", (e) => {
      const li = e.target.closest(".tc-item[data-draggable]");
      if (!li || e.button !== 0 || e.target.closest("button, input")) return;
      e.preventDefault();
      const dragKey = li.dataset.key;
      let moved = false;
      const onMove = (ev) => {
        moved = true;
        li.classList.add("is-dragging");
        clearMarks();
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".tc-item");
        if (!over || !list.contains(over) || over === li) return;
        const r = over.getBoundingClientRect();
        const after = ev.clientY > r.top + r.height / 2;
        // Không thả vào giữa / trước các cột bị khoá.
        if (over.classList.contains("is-locked") && !(after && !over.nextElementSibling?.classList.contains("is-locked"))) return;
        over.classList.add(after ? "drop-after" : "drop-before");
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        li.classList.remove("is-dragging");
        const over = list.querySelector(".drop-before, .drop-after");
        clearMarks();
        if (!moved || !over) return;
        const next = currentOrder(table).filter((k) => k !== dragKey);
        let at = next.indexOf(over.dataset.key) + (over.classList.contains("drop-after") ? 1 : 0);
        at = Math.max(at, locked);
        next.splice(at, 0, dragKey);
        setOrder(table, next);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  function escapeHtmlText(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  document.addEventListener("click", (e) => {
    if (panel && !e.target.closest(".tc-btn")) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel) {
      const b = panelBtn;
      closePanel();
      b?.focus();
    }
  });
  window.addEventListener("resize", closePanel);

  // ---- Theo dõi bảng vẽ lại ----
  let scheduled = false;
  function scanAll() {
    scheduled = false;
    document.querySelectorAll("table").forEach((t) => {
      if (ALLOWLIST.includes(t.id) || t.querySelector(":scope > tbody > tr > td > .actions-cell")) processTable(t);
    });
  }
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(scanAll);
  }).observe(document.body, { childList: true, subtree: true });
  scanAll();
})();
