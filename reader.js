/* ===================================================================
   DELUSIONAL — book reader
   Desktop (> 820px): two-page open spread with a 3D page-turn.
   Mobile  (<=820px): continuous vertical scroll reading.
   Page number is an editable jump box in both modes.
   Built on PDF.js.
   =================================================================== */
(function () {
  const pdfjsLib = window['pdfjsLib'];
  if (!pdfjsLib) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const FILE = 'Public/DELUSIONAL.pdf';
  const $ = (id) => document.getElementById(id);

  const reader    = $('reader');
  const stage     = $('stage');
  const book      = $('book');
  const leafLeft  = $('leafLeft');
  const leafRight = $('leafRight');
  const flip      = $('flip');
  const cvLeft    = $('cvLeft');
  const cvRight   = $('cvRight');
  const cvFront   = $('cvFront');
  const cvBack    = $('cvBack');
  const loading   = $('loading');
  const scrollView= $('scrollView');
  const pageNum   = $('pageNum');
  const pageTotal = $('pageTotal');

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  let pdf = null, N = 0;
  let aspect = 1.414;        // page height / width (from page 1)
  let zoom = 1;
  let animating = false;
  let pageW = 0, pageH = 0;

  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* spread 0 = [—, 1] (cover on the right); spread s = [2s, 2s+1] */
  let spread = 0;
  const spreadPages = (s) => (s <= 0 ? { L: null, R: 1 } : { L: 2 * s, R: 2 * s + 1 });
  const maxSpread = () => Math.floor(N / 2);
  const spreadForPage = (p) => (p <= 1 ? 0 : Math.min(Math.floor(p / 2), maxSpread()));
  const curSpreadPage = () => { const { L, R } = spreadPages(spread); return (R && R <= N) ? R : (L || 1); };

  /* ============================================================
     Rendering
     ============================================================ */
  async function renderPage(canvas, num, w, h) {
    const ctx = canvas.getContext('2d');
    if (!num || num < 1 || num > N) {                 // blank leaf
      canvas.width = Math.round(w * DPR); canvas.height = Math.round(h * DPR);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const page = await pdf.getPage(num);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (w * DPR) / base.width });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    canvas.style.width = w + 'px'; canvas.style.height = (w * (vp.height / vp.width)) + 'px';
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  }

  /* ============================================================
     Editable page number
     ============================================================ */
  function setPageInput(n) { if (document.activeElement !== pageNum) pageNum.value = n; }

  function jumpToPage(n) {
    n = Math.max(1, Math.min(N, n | 0));
    if (isMobile()) {
      const c = scrollSlots[n - 1];
      if (c) scrollView.scrollTo({ top: c.offsetTop - 4, behavior: reduceMotion() ? 'auto' : 'smooth' });
    } else {
      spread = spreadForPage(n);
      paintSpread();
    }
  }

  function commitInput() {
    const v = parseInt(pageNum.value, 10);
    if (isNaN(v)) { setPageInput(currentPage()); return; }
    jumpToPage(v);
  }
  const currentPage = () => (isMobile() ? scrollCurrent : curSpreadPage());

  pageNum.addEventListener('change', commitInput);
  pageNum.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pageNum.blur(); } });
  pageNum.addEventListener('focus', () => pageNum.select());

  /* ============================================================
     Desktop — two-page spread + 3D turn
     ============================================================ */
  function measure() {
    const full = !!document.fullscreenElement;
    const cs = getComputedStyle(stage);
    let availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (getComputedStyle($('prevBtn')).display !== 'none') availW -= (46 * 2 + 32);
    availW = Math.max(availW, 220);

    let w = availW / 2;
    const availH = full ? (window.innerHeight - 150) : Math.min(window.innerHeight * 0.82, 760);
    let h = w * aspect;
    if (h > availH) { h = availH; w = h / aspect; }
    w *= zoom; h *= zoom;
    pageW = Math.max(Math.floor(w), 80);
    pageH = Math.max(Math.floor(h), 80);

    book.classList.remove('single');
    book.style.width = (2 * pageW) + 'px';
    book.style.height = pageH + 'px';
    leafLeft.style.display = 'block';
    leafLeft.style.width = pageW + 'px';  leafLeft.style.height = pageH + 'px';  leafLeft.style.left = '0px';
    leafRight.style.width = pageW + 'px'; leafRight.style.height = pageH + 'px';  leafRight.style.left = pageW + 'px';
    layoutLeaves();
  }

  /* Center a single visible page (cover or trailing odd page) by shifting the
     spread and hiding the empty leaf — so it sits dead-center, not off to one side. */
  function layoutLeaves() {
    const { L, R } = spreadPages(spread);
    const rL = !!L && L >= 1 && L <= N;
    const rR = !!R && R <= N;
    book.style.transform = '';
    leafLeft.style.visibility = 'visible';
    leafRight.style.visibility = 'visible';
    book.classList.toggle('single', !(rL && rR));
    if (rR && !rL) {                 // cover: only the right page is real
      book.style.transform = 'translateX(' + (-pageW / 2) + 'px)';
      leafLeft.style.visibility = 'hidden';
    } else if (rL && !rR) {          // trailing odd page: only the left page is real
      book.style.transform = 'translateX(' + (pageW / 2) + 'px)';
      leafRight.style.visibility = 'hidden';
    }
  }

  function updateArrows() {
    const atStart = spread <= 0, atEnd = spread >= maxSpread();
    ['prevBtn', 'prevBtn2'].forEach(id => $(id).disabled = atStart);
    ['nextBtn', 'nextBtn2'].forEach(id => $(id).disabled = atEnd);
  }

  async function paintSpread() {
    measure();
    flip.style.display = 'none';
    const { L, R } = spreadPages(spread);
    await Promise.all([renderPage(cvLeft, L, pageW, pageH), renderPage(cvRight, R, pageW, pageH)]);
    setPageInput(curSpreadPage()); updateArrows();
    loading.classList.add('hidden');
  }

  function afterTransition(node, cb) {
    let done = false;
    const h = () => { if (done) return; done = true; node.removeEventListener('transitionend', h); cb(); };
    node.addEventListener('transitionend', h);
    setTimeout(h, 950);
  }
  function placeFlip(side) {
    flip.style.width = pageW + 'px'; flip.style.height = pageH + 'px';
    if (side === 'right') { flip.style.left = pageW + 'px'; flip.style.transformOrigin = '0% 50%'; }
    else { flip.style.left = '0px'; flip.style.transformOrigin = '100% 50%'; }
  }
  async function runTurn(o) {
    animating = true;
    placeFlip(o.side);
    await Promise.all([renderPage(cvFront, o.frontNum, pageW, pageH), renderPage(cvBack, o.backNum, pageW, pageH)]);
    flip.style.display = 'block';
    flip.classList.remove('animating');
    flip.style.transform = 'rotateY(' + o.fromDeg + 'deg)';
    void flip.offsetWidth;
    if (o.under) await o.under();
    void flip.offsetWidth;
    flip.classList.add('animating');
    flip.style.transform = 'rotateY(' + o.toDeg + 'deg)';
    afterTransition(flip, async () => {
      await o.commit();
      flip.classList.remove('animating');
      flip.style.display = 'none';
      animating = false;
      layoutLeaves();
      setPageInput(curSpreadPage()); updateArrows();
    });
  }

  function next() {
    if (!pdf || isMobile()) { if (isMobile()) jumpToPage(scrollCurrent + 1); return; }
    if (animating || spread >= maxSpread()) return;
    if (reduceMotion()) { spread += 1; paintSpread(); return; }
    const cur = spreadPages(spread), nxt = spreadPages(spread + 1);
    runTurn({
      side: 'right', frontNum: cur.R, backNum: nxt.L, fromDeg: 0, toDeg: -180,
      under: () => renderPage(cvRight, nxt.R, pageW, pageH),
      commit: async () => { spread += 1; await renderPage(cvLeft, nxt.L, pageW, pageH); }
    });
  }
  function prev() {
    if (!pdf || isMobile()) { if (isMobile()) jumpToPage(scrollCurrent - 1); return; }
    if (animating || spread <= 0) return;
    if (reduceMotion()) { spread -= 1; paintSpread(); return; }
    const cur = spreadPages(spread), prv = spreadPages(spread - 1);
    runTurn({
      side: 'left', frontNum: cur.L, backNum: prv.R, fromDeg: 0, toDeg: 180,
      under: () => renderPage(cvLeft, prv.L, pageW, pageH),
      commit: async () => { spread -= 1; await renderPage(cvRight, prv.R, pageW, pageH); }
    });
  }

  /* ============================================================
     Mobile — continuous scroll reading
     ============================================================ */
  let scrollSlots = [];      // canvas per page
  let scrollRendered = [];   // bool per page
  let scrollIO = null;
  let scrollCurrent = 1;

  function scrollWidth() {
    const pad = 8;
    return Math.max(Math.round((scrollView.clientWidth - pad) * zoom), 120);
  }

  function buildScroll() {
    scrollView.innerHTML = '';
    scrollSlots = []; scrollRendered = [];
    if (scrollIO) scrollIO.disconnect();
    scrollIO = new IntersectionObserver(onSlotVisible, { root: scrollView, rootMargin: '1000px 0px' });

    const w = scrollWidth();
    const ph = Math.round(w * aspect);
    for (let i = 1; i <= N; i++) {
      const c = document.createElement('canvas');
      c.className = 'sv-canvas';
      c.dataset.page = i;
      c.style.width = w + 'px';
      c.style.height = ph + 'px';                     // placeholder until rendered
      scrollView.appendChild(c);
      scrollSlots.push(c); scrollRendered.push(false);
      scrollIO.observe(c);
    }
    loading.classList.add('hidden');
  }

  function onSlotVisible(entries) {
    const w = scrollWidth();
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const i = +e.target.dataset.page;
      if (scrollRendered[i - 1]) return;
      scrollRendered[i - 1] = true;
      renderPage(scrollSlots[i - 1], i, w, w * aspect);
    });
  }

  let ticking = false;
  function onScroll() {
    const mid = scrollView.scrollTop + scrollView.clientHeight * 0.35;
    let best = 1, bd = Infinity;
    for (let i = 0; i < scrollSlots.length; i++) {
      const c = scrollSlots[i];
      const d = Math.abs((c.offsetTop + c.offsetHeight / 2) - mid);
      if (d < bd) { bd = d; best = i + 1; }
    }
    scrollCurrent = best;
    setPageInput(best);
  }
  scrollView.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });

  /* ============================================================
     Mode switching
     ============================================================ */
  let wasMobile = null;
  function applyMode(keepPage) {
    const mob = isMobile();
    reader.classList.toggle('scroll-mode', mob);
    scrollView.hidden = !mob;

    if (mob) {
      buildScroll();
      requestAnimationFrame(() => { jumpToPage(keepPage); onScroll(); });
    } else {
      spread = spreadForPage(keepPage);
      paintSpread();
    }
    wasMobile = mob;
  }

  /* ============================================================
     Boot + wiring
     ============================================================ */
  pdfjsLib.getDocument(FILE).promise.then(async (doc) => {
    pdf = doc; N = doc.numPages;
    pageTotal.textContent = N;
    const p1 = await doc.getPage(1);
    const v = p1.getViewport({ scale: 1 });
    aspect = v.height / v.width;
    applyMode(1);
  }).catch(() => {
    loading.innerHTML = '<a class="btn" href="' + FILE + '">Open the book</a>';
    loading.classList.remove('hidden');
  });

  ['prevBtn', 'prevBtn2'].forEach(id => $(id).addEventListener('click', prev));
  ['nextBtn', 'nextBtn2'].forEach(id => $(id).addEventListener('click', next));

  $('zoomIn').addEventListener('click', () => setZoom(zoom + 0.12));
  $('zoomOut').addEventListener('click', () => setZoom(zoom - 0.12));
  function setZoom(z) {
    zoom = Math.max(0.7, Math.min(2, z));
    reader.classList.toggle('zoomed', zoom > 1.001);
    reflow();
  }
  $('fsBtn').addEventListener('click', () => {
    if (!document.fullscreenElement) reader.requestFullscreen && reader.requestFullscreen();
    else document.exitFullscreen && document.exitFullscreen();
  });
  document.addEventListener('fullscreenchange', reflow);

  /* keep the enlarged spread centred so zoom grows from the middle,
     then the user can pan left/right to read each cropped page */
  function centerStage() {
    if (isMobile()) return;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop  = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
  }

  function reflow() {
    if (!pdf) return;
    const keep = currentPage();
    if (isMobile()) applyMode(keep);
    else if (!animating) { paintSpread(); requestAnimationFrame(centerStage); }
  }

  // keyboard — desktop spread only (mobile uses native scroll)
  let inView = false;
  new IntersectionObserver(es => es.forEach(e => (inView = e.isIntersecting)), { threshold: 0.2 }).observe(reader);
  window.addEventListener('keydown', (e) => {
    if (isMobile() || document.activeElement === pageNum) return;
    if (!inView && !document.fullscreenElement) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
  });

  // swipe — desktop spread only
  let sx = null, sy = null;
  stage.addEventListener('touchstart', (e) => { if (isMobile()) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next() : prev());
    sx = sy = null;
  }, { passive: true });

  // responsive
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (!pdf) return;
      const keep = currentPage();
      if (isMobile() !== wasMobile) applyMode(keep);
      else if (isMobile()) applyMode(keep);   // re-fit scroll widths
      else if (!animating) paintSpread();
    }, 180);
  });
})();
