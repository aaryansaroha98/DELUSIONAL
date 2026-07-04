/* ===================================================================
   DELUSIONAL — book reader
   Desktop (> 820px): single centered page with a 3D page-turn.
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

  /* desktop shows one page at a time, dead-centered */
  let page = 1;
  const clampPage = (p) => Math.max(1, Math.min(N, p | 0));

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
    n = clampPage(n);
    if (isMobile()) {
      const c = scrollSlots[n - 1];
      if (c) scrollView.scrollTo({ top: c.offsetTop - 4, behavior: reduceMotion() ? 'auto' : 'smooth' });
    } else {
      page = n;
      paintPage();
    }
  }

  function commitInput() {
    const v = parseInt(pageNum.value, 10);
    if (isNaN(v)) { setPageInput(currentPage()); return; }
    jumpToPage(v);
  }
  const currentPage = () => (isMobile() ? scrollCurrent : page);

  pageNum.addEventListener('change', commitInput);
  pageNum.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); pageNum.blur(); } });
  pageNum.addEventListener('focus', () => pageNum.select());

  /* ============================================================
     Desktop — single centered page + 3D turn
     ============================================================ */
  function measure() {
    const full = !!document.fullscreenElement;
    const cs = getComputedStyle(stage);
    let availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    availW -= (46 * 2 + 24);                          // leave a gutter for the edge arrows
    availW = Math.max(availW, 200);

    let w = availW;
    const availH = full ? (window.innerHeight - 150) : Math.min(window.innerHeight * 0.82, 760);
    let h = w * aspect;
    if (h > availH) { h = availH; w = h / aspect; }
    w *= zoom; h *= zoom;
    pageW = Math.max(Math.floor(w), 80);
    pageH = Math.max(Math.floor(h), 80);

    book.style.width = pageW + 'px';
    book.style.height = pageH + 'px';
    leafLeft.style.display = 'none';
    leafRight.style.display = 'block';
    leafRight.style.width = pageW + 'px'; leafRight.style.height = pageH + 'px'; leafRight.style.left = '0px';
  }

  function updateArrows() {
    const atStart = page <= 1, atEnd = page >= N;
    ['prevBtn', 'prevBtn2'].forEach(id => $(id).disabled = atStart);
    ['nextBtn', 'nextBtn2'].forEach(id => $(id).disabled = atEnd);
  }

  async function paintPage() {
    measure();
    flip.style.display = 'none';
    await renderPage(cvRight, page, pageW, pageH);
    setPageInput(page); updateArrows();
    loading.classList.add('hidden');
    requestAnimationFrame(centerStage);
  }

  function afterTransition(node, cb) {
    let done = false;
    const h = () => { if (done) return; done = true; node.removeEventListener('transitionend', h); cb(); };
    node.addEventListener('transitionend', h);
    setTimeout(h, 950);
  }

  async function runTurn(dir) {                       // dir = +1 next, -1 prev
    animating = true;
    const target = page + dir;
    flip.style.width = pageW + 'px'; flip.style.height = pageH + 'px'; flip.style.left = '0px';
    flip.style.transformOrigin = dir > 0 ? '0% 50%' : '100% 50%';
    const toDeg = dir > 0 ? -180 : 180;

    await Promise.all([renderPage(cvFront, page, pageW, pageH), renderPage(cvBack, target, pageW, pageH)]);
    flip.style.display = 'block';
    flip.classList.remove('animating');
    flip.style.transform = 'rotateY(0deg)';
    void flip.offsetWidth;
    await renderPage(cvRight, target, pageW, pageH);  // reveal target underneath
    void flip.offsetWidth;
    flip.classList.add('animating');
    flip.style.transform = 'rotateY(' + toDeg + 'deg)';
    afterTransition(flip, () => {
      page = target;
      flip.classList.remove('animating');
      flip.style.display = 'none';
      animating = false;
      setPageInput(page); updateArrows();
    });
  }

  function next() {
    if (!pdf || isMobile()) { if (isMobile()) jumpToPage(scrollCurrent + 1); return; }
    if (animating || page >= N) return;
    if (reduceMotion()) { page += 1; paintPage(); return; }
    runTurn(1);
  }
  function prev() {
    if (!pdf || isMobile()) { if (isMobile()) jumpToPage(scrollCurrent - 1); return; }
    if (animating || page <= 1) return;
    if (reduceMotion()) { page -= 1; paintPage(); return; }
    runTurn(-1);
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
      page = clampPage(keepPage);
      paintPage();
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

  /* keep the enlarged page centred so zoom grows from the middle,
     then the user can pan to read the cropped edges */
  function centerStage() {
    if (isMobile()) return;
    stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
    stage.scrollTop  = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
  }

  function reflow() {
    if (!pdf) return;
    const keep = currentPage();
    if (isMobile()) applyMode(keep);
    else if (!animating) paintPage();
  }

  // keyboard — desktop only (mobile uses native scroll)
  let inView = false;
  new IntersectionObserver(es => es.forEach(e => (inView = e.isIntersecting)), { threshold: 0.2 }).observe(reader);
  window.addEventListener('keydown', (e) => {
    if (isMobile() || document.activeElement === pageNum) return;
    if (!inView && !document.fullscreenElement) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
  });

  // swipe — desktop only
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
      else if (!animating) paintPage();
    }, 180);
  });
})();
