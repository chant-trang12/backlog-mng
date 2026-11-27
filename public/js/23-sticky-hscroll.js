// ---- Thanh cuộn ngang nổi ở đáy màn hình cho bảng dài ----
// Thanh cuộn ngang thật của .table-wrap nằm ở cuối bảng: bảng dài thì phải
// kéo xuống hết mới cuộn ngang được. Khi đáy khung bảng nằm dưới mép dưới
// màn hình mà bảng có cuộn ngang, hiện 1 thanh giả ghim đáy màn hình, đồng bộ
// 2 chiều scrollLeft với bảng thật. Dùng chung 1 thanh cho mọi bảng.
(function () {
  const bar = document.createElement("div");
  bar.className = "sticky-hscroll";
  bar.hidden = true;
  const inner = document.createElement("div");
  bar.appendChild(inner);
  document.body.appendChild(bar);

  let target = null;
  let syncing = false;
  let queued = false;

  function pick() {
    for (const w of document.querySelectorAll(".table-wrap")) {
      if (!w.offsetParent || w.closest("dialog")) continue;
      if (w.scrollWidth <= w.clientWidth + 1) continue;
      const r = w.getBoundingClientRect();
      // Đáy bảng (nơi có thanh cuộn thật) chưa vào khung nhìn, nhưng đã thấy phần trên bảng.
      if (r.bottom > window.innerHeight && r.top < window.innerHeight - 80) return { w, r };
    }
    return null;
  }

  function update() {
    queued = false;
    const hit = pick();
    if (!hit) {
      bar.hidden = true;
      target = null;
      return;
    }
    target = hit.w;
    bar.hidden = false;
    bar.style.left = `${hit.r.left}px`;
    bar.style.width = `${hit.r.width}px`;
    inner.style.width = `${target.scrollWidth}px`;
    if (bar.scrollLeft !== target.scrollLeft) {
      syncing = true;
      bar.scrollLeft = target.scrollLeft;
    }
  }

  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  bar.addEventListener("scroll", () => {
    if (syncing) {
      syncing = false;
      return;
    }
    if (target && target.scrollLeft !== bar.scrollLeft) {
      syncing = true;
      target.scrollLeft = bar.scrollLeft;
    }
  });
  // scroll không nổi bọt -> bắt ở pha capture để nghe cả cuộn trang lẫn cuộn bảng.
  document.addEventListener(
    "scroll",
    (e) => {
      if (e.target === bar) return;
      if (target && e.target === target) {
        if (bar.scrollLeft !== target.scrollLeft) {
          syncing = true;
          bar.scrollLeft = target.scrollLeft;
        }
        return;
      }
      schedule();
    },
    true,
  );
  window.addEventListener("resize", schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  new ResizeObserver(schedule).observe(document.documentElement);
  schedule();
})();
