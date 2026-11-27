// Xem trước báo cáo PowerPoint dạng slide (popup 3/4 màn hình): vẽ từng slide từ mô hình do server dựng (mẫu .pptx + dữ liệu hiện tại),
// cho người dùng xem, GÓP Ý và SỬA TRỰC TIẾP lên slide (đoạn văn, danh sách, ô bảng) trước khi xuất. Tự lưu qua đúng API của màn hình báo cáo.
const pv = { model: null, no: 1, code: null, k: 1, editing: null /* { code, kind, row?, sub? } */, ro: false, busy: false };
const pvQ = (id) => document.getElementById(id);
const PT = 12700; // EMU / pt — 1pt hiển thị = 1px ở kích thước gốc, sau đó thu phóng cả slide

function pvSlide() {
  return pv.model?.slides.find((s) => s.no === pv.no);
}
const pvFieldsOf = (no) => (pptx.report?.fields ?? []).filter((f) => (f.slide_no ?? 0) === no);
const pvCommentsOf = (code) => (pptx.report?.comments ?? []).filter((c) => c.field_code === code);

async function openPptxPreview(startNo) {
  const rep = pptx.report;
  if (!rep) return;
  // lưu nốt các thay đổi đang chờ để xem đúng dữ liệu mới nhất
  await Promise.all([...pptx.dirty].map((c) => { clearTimeout(pptx.saveTimers[c]); return flushPptxSave(c); }));
  try {
    pv.ro = rep.access === "shared";
    pv.model = await api(`/api/reports/${rep.id}/preview`);
  } catch (e) {
    return showToast(e.message);
  }
  pv.editing = null;
  const act = rep.fields.find((f) => f.code === pptx.activeCode);
  pv.no = startNo ?? (act?.slide_no && pv.model.slides.some((s) => s.no === act.slide_no) ? act.slide_no : 1);
  pv.code = null;
  pvQ("pv-title").textContent = `Xem trước — ${pxTitle(rep)}`;
  pvQ("pptx-preview-dialog").showModal();
  pvRenderAll();
}

function pvRenderAll() {
  pvRenderThumbs();
  pvRenderSlide();
  pvRenderSide();
}

// ---- Danh sách slide (cột trái) ----
function pvCaption(slide) {
  let best = "";
  let bestSz = 0;
  for (const sh of slide.shapes) {
    if (sh.t !== "text" || sh.deco) continue;
    for (const p of sh.paras ?? []) {
      const t = p.runs.map((r) => r.t).join("").trim();
      const sz = p.runs[0]?.sz ?? 0;
      if (t && sz > bestSz) {
        best = t;
        bestSz = sz;
      }
    }
  }
  return best.slice(0, 60);
}
function pvRenderThumbs() {
  const el = pvQ("pv-thumbs");
  el.innerHTML = pv.model.slides
    .map((s) => {
      const fs = pvFieldsOf(s.no);
      const open = fs.reduce((n, f) => n + pxOpenOf(pvCommentsOf(f.code)), 0);
      const total = fs.reduce((n, f) => n + pvCommentsOf(f.code).length, 0);
      const done = fs.length > 0 && fs.every((f) => f.kind === "auto" || f.filled);
      return `<button type="button" class="pv-thumb${s.no === pv.no ? " is-active" : ""}${done ? " is-done" : ""}" data-no="${s.no}">
        <b>${s.no}</b><span class="pv-thumb-cap">${pxEsc(pvCaption(s) || "(không có tiêu đề)")}</span>
        ${fs.length ? `<i>${fs.length} mục</i>` : ""}${total ? `<em class="${open ? "has-open" : ""}" title="Góp ý">${svgIcon("i-message")}${open || total}</em>` : ""}</button>`;
    })
    .join("");
}
pvQ("pv-thumbs")?.addEventListener("click", (e) => {
  const b = e.target.closest(".pv-thumb");
  if (!b || pv.editing) return;
  pv.no = Number(b.dataset.no);
  pv.code = null;
  pvRenderAll();
});

// ---- Vẽ slide ----
const px2 = (emu) => `${(emu / PT).toFixed(2)}px`;
function pvFont(sz, k = 1) {
  return `calc(${sz ?? 18}px * var(--k, ${k}))`;
}
function pvRunHtml(r, base) {
  if (r.t === "\n") return "<br/>";
  const st = [`font-size:${pvFont(r.sz ?? base)}`];
  if (r.b) st.push("font-weight:700");
  if (r.i) st.push("font-style:italic");
  if (r.u) st.push("text-decoration:underline");
  if (r.spc) st.push(`letter-spacing:${pvFont(r.spc)}`);
  st.push(`color:${r.color ?? "#1c1917"}`);
  return `<span style="${st.join(";")}">${pxEsc(r.t)}</span>`;
}
function pvParaHtml(p, code) {
  const base = p.runs.find((r) => r.t.trim())?.sz ?? p.runs[0]?.sz ?? 18;
  const marL = (p.marL ?? 0) / PT;
  const ind = (p.indent ?? 0) / PT;
  const st = [`text-align:${p.align === "ctr" ? "center" : p.align === "r" ? "right" : p.align === "just" ? "justify" : "left"}`];
  if (p.bullet) st.push(`padding-left:${Math.max(marL, -ind || 0, 14)}px;text-indent:${-Math.max(-ind, 14)}px`);
  else if (marL) st.push(`padding-left:${marL}px`);
  if (p.line) st.push(`line-height:${(p.line * 1.2).toFixed(2)}`);
  const bullet = p.bullet ? `<span class="pv-bu" style="font-size:${pvFont(base)};color:${p.runs[0]?.color ?? "#1c1917"}">${p.bullet === "#" ? "•" : pxEsc(p.bullet)}&nbsp;</span>` : "";
  return `<div class="pv-p${p.code ? " pv-hit" : ""}" ${p.code ? `data-code="${pxEsc(p.code)}"` : ""} style="${st.join(";")}">${bullet}${p.runs.map((r) => pvRunHtml(r, base)).join("") || "&nbsp;"}</div>`;
}
const pvAnchor = (a) => (a === "ctr" ? "center" : a === "b" ? "flex-end" : "flex-start");
function pvBox(sh) {
  const st = [`left:${px2(sh.x)}`, `top:${px2(sh.y)}`, `width:${px2(sh.w)}`, `height:${px2(sh.h)}`];
  if (sh.rot) st.push(`transform:rotate(${sh.rot}deg)`);
  if (sh.fill) st.push(`background:${sh.fill}`);
  if (sh.line) st.push(`border:${Math.max(1, (sh.lineW ?? 12700) / PT)}px solid ${sh.line}`);
  if (sh.geom === "ellipse") st.push("border-radius:50%");
  else if (sh.geom === "roundRect") st.push("border-radius:14px");
  return st.join(";");
}
function pvCommentBadge(codes) {
  const list = (codes ?? []).flatMap((c) => pvCommentsOf(c));
  if (!list.length) return "";
  const open = pxOpenOf(list);
  return `<span class="pv-cm-badge${open ? " has-open" : ""}" title="${list.length} góp ý">${svgIcon("i-message")}${open || list.length}</span>`;
}
function pvShapeHtml(sh) {
  const media = (key) => pv.model.media[key] ?? "";
  if (sh.t === "image") {
    // Ảnh cắt xén (a:srcRect): phóng ảnh to hơn khung rồi dịch để chỉ lộ phần được giữ lại.
    const c = sh.crop;
    const img = c
      ? `<img src="${media(sh.src)}" alt="" draggable="false" style="position:absolute;width:${(100 / (1 - c[0] - c[2])).toFixed(3)}%;height:${(100 / (1 - c[1] - c[3])).toFixed(3)}%;left:${((-c[0] / (1 - c[0] - c[2])) * 100).toFixed(3)}%;top:${((-c[1] / (1 - c[1] - c[3])) * 100).toFixed(3)}%;max-width:none"/>`
      : `<img src="${media(sh.src)}" alt="" draggable="false"/>`;
    return `<div class="pv-shape" style="${pvBox(sh)}${c ? ";overflow:hidden" : ""}">${img}</div>`;
  }
  if (sh.t === "line") {
    const lw = Math.max(1, (sh.lineW ?? 12700) / PT);
    const y1 = sh.flipV ? "100%" : "0", y2 = sh.flipV ? "0" : "100%";
    return `<div class="pv-shape" style="left:${px2(sh.x)};top:${px2(sh.y)};width:${px2(sh.w)};height:${px2(sh.h)};${sh.rot ? `transform:rotate(${sh.rot}deg)` : ""}"><svg width="100%" height="100%" style="overflow:visible;display:block"><line x1="0" y1="${y1}" x2="100%" y2="${y2}" stroke="${sh.line}" stroke-width="${lw}"/></svg></div>`;
  }
  if (sh.t === "imagebox") {
    const inner = sh.has_image
      ? `<img src="${sh.url}" alt="" draggable="false"/>${sh.caption ? `<div class="pv-img-cap">${pxEsc(sh.caption)}</div>` : ""}`
      : '<div class="pv-img-empty">Chưa có ảnh<br/><small>(tải ảnh ở mục Hình ảnh của báo cáo)</small></div>';
    return `<div class="pv-shape pv-hit pv-imagebox" data-code="${pxEsc(sh.code)}" style="${pvBox(sh)}">${inner}${pvCommentBadge([sh.code])}</div>`;
  }
  if (sh.t === "table") {
    const total = sh.cols.reduce((a, b) => a + b, 0) || 1;
    const rowsHtml = sh.rows
      .map((r, ri) => {
        const cells = r.cells
          .map((c) => {
            if (c.vmerge) return "";
            const edit = c.edit && c.row;
            const st = [`vertical-align:${c.anchor === "ctr" ? "middle" : c.anchor === "b" ? "bottom" : "top"}`];
            if (c.fill) st.push(`background:${c.fill}`);
            const head = sh.headerRow && ri === 0;
            if (head && !c.fill) st.push("background:#e7e5e4;font-weight:700");
            return `<td${c.span ? ` colspan="${c.span}"` : ""} class="${c.code ? "pv-hit pv-cell" : ""}" ${c.code ? `data-code="${pxEsc(c.code)}"` : ""} ${edit ? `data-row="${pxEsc(c.row)}" data-sub="${pxEsc(c.sub)}"` : ""} style="${st.join(";")}">${c.paras.map((p) => pvParaHtml(p, null)).join("")}</td>`;
          })
          .join("");
        return `<tr style="height:${px2(r.h)}">${cells}</tr>`;
      })
      .join("");
    return `<div class="pv-shape pv-table-wrap" style="left:${px2(sh.x)};top:${px2(sh.y)};width:${px2(sh.w)}"><table class="pv-table" style="width:100%"><colgroup>${sh.cols.map((w) => `<col style="width:${((w / total) * 100).toFixed(2)}%"/>`).join("")}</colgroup><tbody>${rowsHtml}</tbody></table>${pvCommentBadge(sh.codes)}</div>`;
  }
  // text
  const hasText = (sh.paras ?? []).some((p) => p.runs.some((r) => r.t.trim()));
  const [l, t, r, b] = (sh.insets ?? [91440, 45720, 91440, 45720]).map((v) => v / PT);
  const k = sh.scale ?? 1;
  const editable = (sh.codes ?? []).some((c) => ["paragraph", "list"].includes(pxField(c)?.kind));
  const cls = ["pv-shape", "pv-text-shape"];
  if (sh.codes?.length) cls.push("pv-hit");
  if (sh.codes?.length && !hasText && editable) cls.push("pv-empty");
  const inner = (sh.paras ?? []).map((p) => pvParaHtml(p, null)).join("");
  return `<div class="${cls.join(" ")}" ${sh.codes?.length ? `data-code="${pxEsc(sh.codes[0])}"` : ""} style="${pvBox(sh)}"><div class="pv-text" style="--k:${k};padding:${t}px ${r}px ${b}px ${l}px;justify-content:${pvAnchor(sh.anchor)}">${inner}</div>${pvCommentBadge(sh.codes)}</div>`;
}
function pvRenderSlide() {
  const slide = pvSlide();
  const el = pvQ("pv-slide");
  if (!slide) return (el.innerHTML = "");
  const W = pv.model.slide_w / PT;
  const H = pv.model.slide_h / PT;
  el.style.width = `${W}px`;
  el.style.height = `${H}px`;
  const bg = slide.bg;
  el.style.background = bg?.color ?? "#fff";
  el.style.backgroundImage = bg?.image ? `url("${pv.model.media[bg.image]}")` : bg?.css ?? "none";
  el.style.backgroundSize = "100% 100%";
  el.innerHTML = slide.shapes.map(pvShapeHtml).join("");
  pvRenderNotes(slide);
  pvQ("pv-pos").textContent = `Slide ${pv.no} / ${pv.model.slides.length}`;
  pvQ("pv-prev").disabled = pv.no <= 1;
  pvQ("pv-next").disabled = pv.no >= pv.model.slides.length;
  pvFit();
  pvMarkActive();
  // Cỡ chữ giữ đúng như file mẫu (cỡ gốc × fontScale của normAutofit nếu có) — KHÔNG tự co thêm: chữ dài hơn khung thì tràn ra như khi mở file xuất bằng PowerPoint.
}
// Ghi chú thuyết trình (khung Notes dưới slide): hiện ngay dưới slide, bấm vào để sửa / góp ý như các đầu mục khác.
function pvRenderNotes(slide) {
  const box = pvQ("pv-notes");
  const notes = slide.notes;
  if (!notes?.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  const codes = [...new Set(notes.map((p) => p.code).filter(Boolean))];
  const hasText = notes.some((p) => p.runs.some((r) => r.t.trim()));
  const editable = codes.some((c) => ["paragraph", "list"].includes(pxField(c)?.kind));
  box.innerHTML = `<div class="pv-notes-head">${svgIcon("i-file-text")}Ghi chú${pvCommentBadge(codes).replace("pv-cm-badge", "pv-cm-badge pv-cm-inline")}</div>
    <div class="pv-notes-body${codes.length ? " pv-hit" : ""}${!hasText && editable ? " pv-empty" : ""}" ${codes.length ? `data-code="${pxEsc(codes[0])}"` : ""}>${notes
      .map((p) => `<div class="pv-note-p${p.code ? " pv-hit" : ""}" ${p.code ? `data-code="${pxEsc(p.code)}"` : ""}>${p.bullet ? "• " : ""}${p.runs.map((r) => (r.t === "\n" ? "<br/>" : `<span${r.b ? ' style="font-weight:700"' : ""}>${pxEsc(r.t)}</span>`)).join("") || "&nbsp;"}</div>`)
      .join("")}</div>`;
}
pvQ("pv-notes")?.addEventListener("click", (e) => {
  if (pv.editing) return;
  const hit = e.target.closest("[data-code]");
  if (!hit) return;
  const code = hit.dataset.code;
  pv.code = code;
  pvMarkActive();
  pvRenderSide();
  const f = pxField(code);
  if (!f || pv.ro || !["paragraph", "list"].includes(f.kind)) return;
  pvStartNotesEdit(f);
});
function pvStartNotesEdit(f) {
  const body = pvQ("pv-notes").querySelector(".pv-notes-body");
  const items = f.kind === "list" ? (f.content.items ?? []).filter((i) => i.selected !== false) : [];
  const ta = document.createElement("textarea");
  ta.className = "pv-edit pv-edit-notes";
  ta.value = f.kind === "list" ? items.map((i) => i.text).join("\n") : f.content.text ?? "";
  ta.placeholder = f.kind === "list" ? "Mỗi dòng một ý…" : "Nhập ghi chú…";
  pvQ("pv-notes").appendChild(ta);
  pv.editing = { code: f.code, kind: f.kind };
  const save = () => pvSaveText(f, ta.value);
  pvEditBar(`${f.label} (ghi chú)`, save);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      pvCancelEdit();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  });
  body.scrollIntoView({ block: "nearest" });
  ta.focus();
}

function pvFit() {
  const stage = pvQ("pv-stage");
  const W = pv.model.slide_w / PT;
  const H = pv.model.slide_h / PT;
  const k = Math.min((stage.clientWidth - 24) / W, (stage.clientHeight - 24) / H);
  pv.k = k > 0 ? k : 1;
  const wrap = pvQ("pv-slide-wrap");
  wrap.style.width = `${W * pv.k}px`;
  wrap.style.height = `${H * pv.k}px`;
  pvQ("pv-slide").style.transform = `scale(${pv.k})`;
}
window.addEventListener("resize", () => {
  if (pvQ("pptx-preview-dialog")?.open && pv.model) pvFit();
});
function pvMarkActive() {
  pvQ("pptx-preview-dialog").querySelectorAll(".pv-hit").forEach((n) => n.classList.toggle("is-active", !!pv.code && n.dataset.code === pv.code));
}

// ---- Bấm vào slide: chọn đầu mục + sửa trực tiếp ----
pvQ("pv-slide")?.addEventListener("click", (e) => {
  if (pv.editing) return;
  const hit = e.target.closest("[data-code]") ?? e.target.closest(".pv-hit");
  if (!hit) {
    pv.code = null;
    pvMarkActive();
    pvRenderSide();
    return;
  }
  const code = hit.dataset.code;
  pv.code = code;
  pvMarkActive();
  pvRenderSide();
  const f = pxField(code);
  if (!f || pv.ro || !["paragraph", "list", "table"].includes(f.kind)) return;
  if (f.kind === "table") {
    const cell = e.target.closest("td[data-row]");
    if (cell) pvStartCellEdit(cell, f);
    else showToast("Bấm vào một ô của bảng để sửa số liệu / tên chỉ tiêu.");
    return;
  }
  pvStartTextEdit(hit.closest(".pv-shape"), f);
});

function pvEditBar(label, onSave) {
  const bar = pvQ("pv-editbar");
  bar.hidden = false;
  bar.innerHTML = `<span>${svgIcon("i-pen")}Đang sửa: <b>${pxEsc(label)}</b> <span class="muted">— Ctrl+Enter để lưu · Esc để hủy</span></span><span class="row" style="gap:8px"><button type="button" class="small" id="pv-edit-cancel">Hủy</button><button type="button" class="small primary" id="pv-edit-save">Lưu</button></span>`;
  pvQ("pv-edit-cancel").onclick = pvCancelEdit;
  pvQ("pv-edit-save").onclick = onSave;
}
function pvCancelEdit() {
  pv.editing = null;
  pvQ("pv-editbar").hidden = true;
  pvQ("pptx-preview-dialog").querySelectorAll(".pv-edit").forEach((n) => n.remove());
}
function pvOverlayRect(el) {
  const s = pvQ("pv-slide").getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: (r.left - s.left) / pv.k, y: (r.top - s.top) / pv.k, w: r.width / pv.k, h: r.height / pv.k };
}
function pvStartTextEdit(shapeEl, f) {
  if (!shapeEl) return;
  const rect = pvOverlayRect(shapeEl);
  const items = f.kind === "list" ? (f.content.items ?? []).filter((i) => i.selected !== false) : [];
  const value = f.kind === "list" ? items.map((i) => i.text).join("\n") : f.content.text ?? "";
  const sz = shapeEl.querySelector(".pv-p span")?.style.fontSize ?? "18px";
  const ta = document.createElement("textarea");
  ta.className = "pv-edit";
  ta.value = value;
  ta.placeholder = f.kind === "list" ? "Mỗi dòng một ý…" : "Nhập nội dung…";
  ta.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${Math.max(rect.w, 260)}px;height:${Math.max(rect.h, 90)}px;font-size:calc(${sz.replace(/calc\(|\)|var\(--k, 1\)|\*/g, "").trim() || "18px"})`;
  pvQ("pv-slide").appendChild(ta);
  pv.editing = { code: f.code, kind: f.kind };
  const save = () => pvSaveText(f, ta.value);
  pvEditBar(f.label, save);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      pvCancelEdit();
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  });
  ta.focus();
}
function pvStartCellEdit(cell, f) {
  const row = (f.content.rows ?? []).find((r) => r.id === cell.dataset.row);
  const sub = cell.dataset.sub;
  if (!row) return;
  const rect = pvOverlayRect(cell);
  const input = document.createElement("input");
  input.className = "pv-edit pv-edit-cell";
  input.value = sub === "ten" || sub === "don_vi" ? row[sub] ?? "" : row[sub] ?? "";
  input.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${Math.max(rect.w, 120)}px;height:${Math.max(rect.h, 40)}px`;
  pvQ("pv-slide").appendChild(input);
  pv.editing = { code: f.code, kind: "table", row: row.id, sub };
  const label = { ten: "Chỉ tiêu", don_vi: "Đơn vị", ke_hoach: "Kế hoạch", thuc_hien: "Thực hiện" }[sub] ?? sub;
  const save = () => pvSaveCell(f, row, sub, input.value);
  pvEditBar(`${f.label} › ${label}`, save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      pvCancelEdit();
    } else if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  });
  input.focus();
  input.select();
}

// ---- Lưu: cập nhật nội dung đầu mục rồi vẽ lại slide ----
async function pvCommit(f) {
  recomputeFilled(f);
  pptx.dirty.add(f.code);
  clearTimeout(pptx.saveTimers[f.code]);
  await flushPptxSave(f.code);
  pvCancelEdit();
  renderPptxSection(f.code); // cập nhật cả màn hình báo cáo phía sau
  try {
    pv.model = await api(`/api/reports/${pptx.report.id}/preview`);
  } catch (e) {
    showToast(e.message);
  }
  pvRenderAll();
  showToast("Đã lưu.", "success");
}
async function pvSaveText(f, raw) {
  if (pv.busy) return;
  pv.busy = true;
  try {
    if (f.kind === "paragraph") f.content.text = raw;
    else {
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const old = f.content.items ?? [];
      const pool = old.filter((i) => i.selected !== false);
      const used = new Set();
      const next = lines.map((text, k) => {
        // giữ id (và nhãn nguồn) của dòng cũ cùng nội dung / cùng vị trí để không mất liên kết
        const same = pool.find((i) => i.text === text && !used.has(i.id)) ?? (pool[k] && !used.has(pool[k].id) ? pool[k] : null);
        if (same) used.add(same.id);
        return same ? { ...same, text } : { id: pxNewId(), text };
      });
      // dòng gợi ý chưa tick (selected=false) vẫn giữ nguyên
      f.content.items = [...next, ...old.filter((i) => i.selected === false)];
    }
    await pvCommit(f);
  } finally {
    pv.busy = false;
  }
}
async function pvSaveCell(f, row, sub, raw) {
  if (pv.busy) return;
  pv.busy = true;
  try {
    if (sub === "ten" || sub === "don_vi") row[sub] = raw.trim();
    else {
      const s = raw.replace(",", ".").trim();
      row[sub] = s === "" ? null : Number(s);
      if (Number.isNaN(row[sub])) row[sub] = null;
      if (f.source === "sum" || f.source === "prior_year") row.edited = { ...(row.edited ?? {}), [sub]: true };
    }
    await pvCommit(f);
  } finally {
    pv.busy = false;
  }
}

// ---- Cột phải: đầu mục của slide + góp ý ----
function pvRenderSide() {
  const side = pvQ("pv-side");
  const fs = pvFieldsOf(pv.no);
  const sel = pv.code ? pxField(pv.code) : null;
  const list = fs.length
    ? fs
        .map((f) => {
          const cm = pvCommentsOf(f.code);
          const open = pxOpenOf(cm);
          return `<button type="button" class="pv-field${f.code === pv.code ? " is-active" : ""}" data-code="${pxEsc(f.code)}"><span class="pv-field-name">${pxEsc(f.label)}</span><i class="${f.kind === "auto" || f.filled ? "ok" : "warn"}">${f.kind === "auto" ? "Tự điền" : f.filled ? "Đã nhập" : "Trống"}</i>${cm.length ? `<em class="${open ? "has-open" : ""}">${svgIcon("i-message")}${open || cm.length}</em>` : ""}</button>`;
        })
        .join("")
    : '<p class="muted" style="margin:6px 0">Slide này không có đầu mục nhập liệu.</p>';
  const thread = sel
    ? `<div class="pv-thread"><div class="pv-thread-title">${svgIcon("i-message")}Góp ý — ${pxEsc(sel.label)}</div>${
        pvCommentsOf(sel.code)
          .map(
            (c) => `<div class="pptx-cm-item${c.status === "resolved" ? " is-resolved" : ""}">
          <div class="pptx-cm-meta"><b>${pxEsc(c.author_name ?? "Ẩn danh")}</b><span class="muted">${pxDateTime(c.created_at)}</span>
            <div style="margin-left:auto;display:flex;gap:4px">${
              c.status === "resolved"
                ? `<span class="pptx-pill ok">Đã xử lý</span><button type="button" class="pptx-icon write-action" data-cm="cm-open" data-id="${c.id}" title="Mở lại">↺</button>`
                : `<button type="button" class="small btn-view write-action" data-cm="cm-resolve" data-id="${c.id}">Đã xử lý</button>`
            }${pptx.report.access === "shared" && c.author_id !== state.currentUserId ? "" : `<button type="button" class="pptx-icon write-action" data-cm="cm-del" data-id="${c.id}" title="Xóa góp ý" aria-label="Xóa góp ý">${svgIcon("i-trash")}</button>`}</div></div>
          <div class="pptx-cm-text">${pxEsc(c.content).replace(/\n/g, "<br/>")}</div></div>`,
          )
          .join("") || '<p class="muted" style="margin:4px 0">Chưa có góp ý cho đầu mục này.</p>'
      }
      <div class="pv-cm-form write-action"><textarea id="pv-cm-input" rows="3" placeholder="Viết góp ý cho đầu mục này…"></textarea><button type="button" class="small primary" id="pv-cm-add">Gửi góp ý</button></div></div>`
    : `<p class="muted pv-pick-hint">Bấm vào nội dung trên slide (hoặc chọn một đầu mục ở trên) để xem và viết góp ý${pv.ro ? "" : ". Đoạn văn, danh sách và ô bảng còn sửa trực tiếp được"}.</p>`;
  side.innerHTML = `<div class="pv-side-title">Slide ${pv.no}${pv.ro ? ' <span class="pptx-pill muted-pill">Chỉ xem + góp ý</span>' : ""}</div><div class="pv-fields">${list}</div>${thread}`;
}
pvQ("pv-side")?.addEventListener("click", async (e) => {
  const fb = e.target.closest(".pv-field");
  if (fb) {
    pv.code = fb.dataset.code;
    pvMarkActive();
    pvRenderSide();
    pvQ("pv-slide").querySelector(`[data-code="${CSS.escape(pv.code)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const code = pv.code;
  if (!code) return;
  const rep = pptx.report;
  try {
    if (e.target.id === "pv-cm-add") {
      const content = pvQ("pv-cm-input").value.trim();
      if (!content) return showToast("Hãy nhập nội dung góp ý.");
      const c = await api(`/api/reports/${rep.id}/comments`, { method: "POST", body: JSON.stringify({ field_code: code, content }) });
      rep.comments.push(c);
    } else {
      const b = e.target.closest("[data-cm]");
      if (!b) return;
      const act = b.dataset.cm;
      const id = Number(b.dataset.id);
      if (act === "cm-resolve" || act === "cm-open") {
        if (act === "cm-resolve" && !(await confirmDialog("Xác nhận góp ý này đã được ghi nhận/ chỉnh sửa?", { title: "Xác nhận xử lý", okText: "Xác nhận", danger: false }))) return;
        const c = await api(`/api/report-comments/${id}`, { method: "PUT", body: JSON.stringify({ status: act === "cm-resolve" ? "resolved" : "open" }) });
        rep.comments = rep.comments.map((x) => (x.id === id ? c : x));
      } else if (act === "cm-del") {
        if (!(await confirmDialog("Xóa góp ý này?", { title: "Xác nhận xóa", okText: "Xóa" }))) return;
        await api(`/api/report-comments/${id}`, { method: "DELETE" });
        rep.comments = rep.comments.filter((x) => x.id !== id);
      } else return;
    }
    renderPptxSection(code);
    refreshSpNavBadge();
    refreshPptxPickerBadges();
    pvRenderThumbs();
    pvRenderSlide();
    pvRenderSide();
  } catch (err) {
    showToast(err.message);
  }
});

// ---- Chuyển slide / đóng / xuất ----
function pvGo(delta) {
  if (pv.editing) return;
  const next = pv.no + delta;
  if (next < 1 || next > pv.model.slides.length) return;
  pv.no = next;
  pv.code = null;
  pvRenderAll();
}
pvQ("pv-prev")?.addEventListener("click", () => pvGo(-1));
pvQ("pv-next")?.addEventListener("click", () => pvGo(1));
document.addEventListener("keydown", (e) => {
  const dlg = pvQ("pptx-preview-dialog");
  if (!dlg?.open || pv.editing || /^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
  if (e.key === "ArrowLeft") pvGo(-1);
  else if (e.key === "ArrowRight") pvGo(1);
});
pvQ("pptx-preview-dialog")?.addEventListener("close", () => {
  pv.editing = null;
  pvQ("pv-editbar").hidden = true;
  if (pptx.report) renderPptxReportView(); // vẽ lại màn hình báo cáo theo nội dung vừa sửa/góp ý
});
pvQ("pv-close-btn")?.addEventListener("click", () => pvQ("pptx-preview-dialog").close());
pvQ("pv-export-btn")?.addEventListener("click", () => {
  pvQ("pptx-preview-dialog").close();
  exportPptxReport();
});
