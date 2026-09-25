// ---- Dropdown tự vẽ cho mọi <select> ----
//
// Danh sách option khi mở <select> gốc là menu của HỆ ĐIỀU HÀNH — CSS không
// đổi được màu/bo góc/khoảng cách (appearance: base-select đã thử và tắt,
// xem ghi chú ở style.css). Ở đây KHÔNG thay thế <select>: vẫn để nguyên
// select gốc làm nút bấm + nguồn dữ liệu (value, option render lại động,
// listener "change" sẵn có đều chạy như cũ), chỉ chặn menu gốc và mở 1 popup
// tự vẽ thay thế. Chọn option -> gán select.value + phát "input"/"change"
// (bubbles) y như người dùng chọn trên select gốc.
//
// Bỏ qua: select multiple/size>1, select disabled, và thiết bị cảm ứng
// (picker gốc của iOS/Android dễ dùng hơn trên màn hình nhỏ).
(function () {
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  if (isTouch) return;

  const SEARCH_THRESHOLD = 10; // từ ngần này option trở lên thì có ô tìm kiếm
  const supportsPopover = typeof HTMLElement.prototype.showPopover === "function";

  let popup = null; // phần tử popup đang mở
  let current = null; // select đang mở
  let items = []; // [{ el, option }] các dòng đang hiển thị (sau lọc)
  let activeIndex = -1;

  function enhanceable(select) {
    return select instanceof HTMLSelectElement && !select.multiple && select.size <= 1 && !select.disabled;
  }

  function close({ focus = true } = {}) {
    if (!popup) return;
    if (supportsPopover && popup.matches(":popover-open")) popup.hidePopover();
    popup.remove();
    const sel = current;
    popup = null;
    current = null;
    items = [];
    activeIndex = -1;
    sel?.classList.remove("dd-open");
    if (focus) sel?.focus({ preventScroll: true });
  }

  function choose(option) {
    const sel = current;
    close();
    if (!sel || option.disabled) return;
    if (sel.value !== option.value) {
      sel.value = option.value;
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function setActive(i) {
    if (!items.length) return;
    activeIndex = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((it, idx) => it.el.classList.toggle("is-active", idx === activeIndex));
    items[activeIndex].el.scrollIntoView({ block: "nearest" });
  }

  function moveActive(delta) {
    if (!items.length) return;
    let i = activeIndex;
    for (let step = 0; step < items.length; step++) {
      i = (i + delta + items.length) % items.length;
      if (!items[i].option.disabled) return setActive(i);
    }
  }

  function renderList(list, filter) {
    list.textContent = "";
    items = [];
    const term = filter.trim().toLowerCase();
    let lastGroup = null;
    for (const option of current.options) {
      if (option.hidden) continue;
      const label = option.label || option.text;
      if (term && !label.toLowerCase().includes(term)) continue;
      const group = option.parentElement instanceof HTMLOptGroupElement ? option.parentElement : null;
      if (group && group !== lastGroup) {
        const g = document.createElement("div");
        g.className = "dd-group";
        g.textContent = group.label;
        list.appendChild(g);
      }
      lastGroup = group;
      const row = document.createElement("div");
      row.className = "dd-option";
      row.setAttribute("role", "option");
      if (option.selected) row.classList.add("is-selected");
      if (option.disabled) row.classList.add("is-disabled");
      row.setAttribute("aria-selected", String(option.selected));
      const text = document.createElement("span");
      text.className = "dd-option-text";
      text.textContent = label || " ";
      row.appendChild(text);
      row.insertAdjacentHTML(
        "beforeend",
        '<svg class="dd-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
      );
      row.title = label;
      const index = items.length;
      row.addEventListener("mousemove", () => {
        if (activeIndex !== index && !option.disabled) setActive(index);
      });
      row.addEventListener("click", () => choose(option));
      items.push({ el: row, option });
      list.appendChild(row);
    }
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "dd-empty";
      empty.textContent = "Không có lựa chọn phù hợp";
      list.appendChild(empty);
    }
    const selectedIdx = items.findIndex((it) => it.option.selected);
    activeIndex = -1;
    if (items.length) setActive(selectedIdx >= 0 && !term ? selectedIdx : items.findIndex((it) => !it.option.disabled));
  }

  function position() {
    if (!popup || !current) return;
    const r = current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(r.width, 180), vw - 16);
    popup.style.minWidth = `${width}px`;
    popup.style.maxWidth = `${Math.max(width, Math.min(360, vw - 16))}px`;
    const pw = popup.offsetWidth;
    const left = Math.min(Math.max(8, r.left), vw - pw - 8);
    const spaceBelow = vh - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxH = Math.min(320, openUp ? spaceAbove - 6 : spaceBelow - 6);
    popup.style.maxHeight = `${Math.max(120, maxH)}px`;
    popup.style.left = `${left}px`;
    if (openUp) {
      popup.style.top = "";
      popup.style.bottom = `${vh - r.top + 4}px`;
    } else {
      popup.style.bottom = "";
      popup.style.top = `${r.bottom + 4}px`;
    }
  }

  function open(select) {
    if (current === select) return close();
    close({ focus: false });
    current = select;
    select.classList.add("dd-open");

    popup = document.createElement("div");
    popup.className = "dd-popup";
    popup.setAttribute("role", "listbox");
    const list = document.createElement("div");
    list.className = "dd-list";

    const optionCount = Array.from(select.options).filter((o) => !o.hidden).length;
    let search = null;
    if (optionCount >= SEARCH_THRESHOLD) {
      search = document.createElement("input");
      search.type = "search";
      search.className = "dd-search";
      search.placeholder = "Tìm nhanh…";
      search.setAttribute("aria-label", "Tìm trong danh sách");
      search.addEventListener("input", () => {
        renderList(list, search.value);
        position();
      });
      search.addEventListener("keydown", onKeydown);
      popup.appendChild(search);
    }
    popup.appendChild(list);

    // Gắn vào ĐÚNG <dialog> đang chứa select (nếu có) — dialog modal làm mọi
    // phần tử bên ngoài nó bị inert, popup gắn ở body sẽ không bấm được.
    // Popover API (khi có) đưa popup lên top layer, không bị overflow/z-index
    // của khung chứa cắt mất.
    (select.closest("dialog") ?? document.body).appendChild(popup);
    if (supportsPopover) {
      popup.setAttribute("popover", "manual");
      popup.showPopover();
    }
    renderList(list, "");
    position();
    if (search) search.focus({ preventScroll: true });
  }

  function onKeydown(e) {
    if (!popup) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveActive(-1);
        break;
      case "Home":
        if (e.target.classList?.contains("dd-search")) return;
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        if (e.target.classList?.contains("dd-search")) return;
        e.preventDefault();
        setActive(items.length - 1);
        break;
      case "Enter":
        e.preventDefault();
        if (items[activeIndex]) choose(items[activeIndex].option);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation(); // không để Esc đóng luôn <dialog> đang chứa select
        close();
        break;
      case "Tab":
        close();
        break;
    }
  }

  // Chặn menu gốc: mousedown là lúc trình duyệt mở menu hệ điều hành.
  document.addEventListener(
    "mousedown",
    (e) => {
      const select = e.target.closest?.("select");
      if (select && enhanceable(select) && e.button === 0) {
        e.preventDefault();
        select.focus({ preventScroll: true });
        open(select);
        return;
      }
      if (popup && !popup.contains(e.target)) close({ focus: false });
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (popup) {
        if (!popup.contains(e.target) || !e.target.classList?.contains("dd-search")) onKeydown(e);
        // Đang mở popup mà focus vẫn ở select gốc: chặn phím chữ, không để
        // select gốc tự nhảy giá trị ngầm phía sau.
        if (e.target === current && e.key.length === 1) e.preventDefault();
        return;
      }
      const select = e.target;
      if (!(select instanceof HTMLSelectElement) || !enhanceable(select)) return;
      const opensMenu = e.key === " " || e.key === "Enter" || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"));
      if (opensMenu) {
        e.preventDefault();
        open(select);
      }
    },
    true,
  );

  // Cuộn trang/khung chứa hoặc đổi kích thước cửa sổ -> đóng (popup định vị
  // fixed theo toạ độ select lúc mở, không bám theo khi select di chuyển).
  window.addEventListener(
    "scroll",
    (e) => {
      if (popup && !popup.contains(e.target)) close({ focus: false });
    },
    true,
  );
  window.addEventListener("resize", () => close({ focus: false }));
  window.addEventListener("blur", () => close({ focus: false }));
})();
