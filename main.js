(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Smooth scrolling is optional: the page works with native scrolling if Lenis fails to load
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new Lenis({ lerp: 0.075 });
    window.lenis = lenis;
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { duration: 1.8 });
        history.pushState(null, '', a.getAttribute('href'));
      });
    });
  }

  // Split headlines into letters so they rise one after another
  const heads = document.querySelectorAll('[data-lines]');
  heads.forEach((head) => {
    let index = 0;
    head.setAttribute('aria-label', head.textContent.replace(/\s+/g, ' ').trim());
    head.querySelectorAll('.line > span').forEach((line) => {
      const words = line.textContent.split(' ');
      line.textContent = '';
      line.setAttribute('aria-hidden', 'true');
      words.forEach((word, w) => {
        const wrap = document.createElement('span');
        wrap.className = 'w';
        [...word].forEach((ch) => {
          const c = document.createElement('span');
          c.className = 'c';
          c.textContent = ch;
          c.style.transitionDelay = `${index++ * 16}ms`;
          wrap.append(c);
        });
        line.append(wrap);
        if (w < words.length - 1) line.append(' ');
      });
    });
    // The closing punctuation of each headline carries the red accent
    if (!head.classList.contains('red-line')) { const all = head.querySelectorAll('.c'); if (all.length) all[all.length - 1].classList.add('is-accent'); }
  });
  const seen = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('seen');
      seen.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -6% 0px' });
  heads.forEach((h) => seen.observe(h));

  // Explore projects
  const root = document.documentElement;
  const explore = document.getElementById('projects');
  const slidesBox = document.getElementById('slides');
  const slides = [...slidesBox.children];
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');
  const pinQuery = matchMedia('(min-width: 1101px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)');
  let current = 0;
  let prevTimer = 0;

  const show = (i) => {
    if (i === current) return;
    const old = slides[current];
    slides.forEach((s) => s.classList.remove('is-prev'));
    old.classList.remove('is-on');
    old.classList.add('is-prev');
    clearTimeout(prevTimer);
    prevTimer = setTimeout(() => old.classList.remove('is-prev'), 1000);
    current = i;
    slides[i].classList.add('is-on');
    updateControls();
    syncClips();
  };
  const updateControls = () => {
    prev.disabled = current === 0;
    next.disabled = current === slides.length - 1;
    slides.forEach((s, i) => { s.inert = root.classList.contains('explore-pin') && i !== current; });
  };
  const goTo = (i) => {
    const target = clamp(i, 0, slides.length - 1);
    if (root.classList.contains('explore-pin')) {
      const top = explore.getBoundingClientRect().top + window.scrollY;
      const y = top + ((target + 0.5) / slides.length) * (explore.offsetHeight - window.innerHeight);
      if (lenis) lenis.scrollTo(y, { duration: 1.1 }); else window.scrollTo(0, y);
    } else {
      slidesBox.scrollTo({ left: slides[target].offsetLeft - slidesBox.offsetLeft, behavior: reduced ? 'auto' : 'smooth' });
      show(target);
    }
  };
  prev.addEventListener('click', () => goTo(current - 1));
  next.addEventListener('click', () => goTo(current + 1));
  slidesBox.addEventListener('scroll', () => {
    if (root.classList.contains('explore-pin')) return;
    show(clamp(Math.round(slidesBox.scrollLeft / slidesBox.clientWidth), 0, slides.length - 1));
  }, { passive: true });
  const applyMode = () => {
    root.classList.toggle('explore-pin', pinQuery.matches);
    updateControls();
    onScroll();
  };

  // StarLED figures count up from zero the first time they scroll into view in the story
  function runCounters(box) {
    if (reduced) return;
    box.querySelectorAll('[data-count]').forEach((el) => {
      const end = Number(el.dataset.count);
      el.textContent = '0';
      const io = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (t) => {
          const p = Math.min((t - t0) / 1400, 1);
          el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, { threshold: 0.6 });
      io.observe(el);
    });
  }

  // Project story panel
  const panel = document.getElementById('story-panel');
  const panelContent = document.getElementById('panel-content');
  let opener = null;
  slides.forEach((s) => {
    s.querySelector('.slide-open').addEventListener('click', (e) => {
      opener = e.currentTarget;
      panelContent.innerHTML = s.querySelector('.story').innerHTML;
      runCounters(panelContent);
      panel.scrollTop = 0;
      panel.showModal();
      if (lenis) lenis.stop();
    });
  });
  document.getElementById('panel-close').addEventListener('click', () => panel.close());
  panel.addEventListener('click', (e) => { if (e.target === panel) panel.close(); });
  panel.addEventListener('close', () => {
    if (lenis) lenis.start();
    if (opener) opener.focus({ preventScroll: true });
  });

  // Project videos play only while on screen; visitors can pause any of them
  const stopped = new WeakSet();
  const inView = new WeakSet();
  const clips = [...document.querySelectorAll('.work-video')];
  const syncClips = () => {
    // In the grid only the clips nearest mid-screen play, so the page never decodes too many at once
    const mid = window.innerHeight / 2;
    const dist = (v) => { const r = v.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - mid); };
    const cap = window.innerWidth <= 800 ? 4 : 6;
    const live = new Set(clips.filter((v) => v.closest('.agrid') && inView.has(v)).sort((x, y) => dist(x) - dist(y)).slice(0, cap));
    clips.forEach((v) => {
      const slide = v.closest('.slide');
      const inGrid = !!v.closest('.agrid');
      const allowed = inView.has(v) && !stopped.has(v) && (inGrid ? live.has(v) : (!slide || slide.classList.contains('is-on')));
      if (allowed) v.play().catch(() => {}); else v.pause();
    });
  };
  const clipView = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) inView.add(en.target); else inView.delete(en.target); });
    syncClips();
  }, { threshold: 0.5 });
  clips.forEach((v) => clipView.observe(v));
  // A project slide's button controls its own clip
  document.querySelectorAll('.video-toggle').forEach((button) => {
    const own = button.parentElement.querySelector('.work-video');
    if (reduced) { stopped.add(own); button.textContent = 'Play'; }
    button.addEventListener('click', () => {
      if (stopped.has(own)) { stopped.delete(own); button.textContent = 'Pause'; } else { stopped.add(own); button.textContent = 'Play'; }
      syncClips();
    });
  });

  // Moving grid: CSS runs the columns; this handles Pause and keeps the right clips playing as they pass
  const agrid = document.getElementById('agrid');
  const agClips = [...agrid.querySelectorAll('.work-video')];
  const agToggle = document.getElementById('ag-toggle');
  let agPaused = reduced;
  const syncAgToggle = () => { agToggle.textContent = agPaused ? 'Play' : 'Pause'; agrid.classList.toggle('is-paused', agPaused); };
  agClips.forEach((v) => { if (agPaused) stopped.add(v); });
  syncAgToggle();
  agToggle.addEventListener('click', () => {
    agPaused = !agPaused;
    agClips.forEach((v) => { if (agPaused) stopped.add(v); else stopped.delete(v); });
    syncAgToggle();
    syncClips();
  });
  let agTimer = 0;
  new IntersectionObserver(([en]) => {
    clearInterval(agTimer);
    if (en.isIntersecting && !reduced) agTimer = setInterval(syncClips, 1200);
  }).observe(agrid);

  // Grid lightbox
  const agBox = document.getElementById('ag-box');
  const agBoxVideo = document.getElementById('ag-box-video');
  const agCards = [...document.querySelectorAll('#ag-data i')];
  let agIndex = 0;
  let agOpener = null;
  const showCard = (i) => {
    agIndex = (i + agCards.length) % agCards.length;
    const d = agCards[agIndex].dataset;
    agBoxVideo.poster = d.poster;
    agBoxVideo.src = d.src;
    agBoxVideo.setAttribute('aria-label', `${d.name} website, desktop walkthrough`);
    document.getElementById('ag-box-name').textContent = d.name;
    document.getElementById('ag-box-count').textContent = `${agIndex + 1} / ${agCards.length}`;
    const link = document.getElementById('ag-box-link');
    link.textContent = '';
    if (d.href) {
      const a = document.createElement('a');
      a.className = 'text-link'; a.href = d.href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = d.label;
      link.append(a);
    } else { link.textContent = d.label; }
    if (!reduced) agBoxVideo.play().catch(() => {});
  };
  agrid.querySelectorAll('.ag-card').forEach((card) => card.querySelector('.ag-open').addEventListener('click', (e) => {
    agOpener = e.currentTarget;
    agBox.showModal();
    if (lenis) lenis.stop();
    showCard(agCards.findIndex((d) => d.dataset.key === card.dataset.key));
  }));
  document.getElementById('ag-box-prev').addEventListener('click', () => showCard(agIndex - 1));
  document.getElementById('ag-box-next').addEventListener('click', () => showCard(agIndex + 1));
  document.getElementById('ag-box-close').addEventListener('click', () => agBox.close());
  agBox.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') showCard(agIndex + 1); if (e.key === 'ArrowLeft') showCard(agIndex - 1); });
  agBox.addEventListener('close', () => {
    agBoxVideo.pause();
    agBoxVideo.removeAttribute('src');
    if (lenis) lenis.start();
    if (agOpener) agOpener.focus({ preventScroll: true });
  });

  // Overlay menu: a circle opens from the Menu button, links rise out of a blur one by one
  const menu = document.getElementById('menu');
  const menuOpen = document.getElementById('menu-open');
  const openMenu = () => {
    const r = menuOpen.getBoundingClientRect();
    menu.style.setProperty('--cx', `${r.left + r.width / 2}px`);
    menu.style.setProperty('--cy', `${r.top + r.height / 2}px`);
    menu.showModal();
    if (lenis) lenis.stop();
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
  };
  const closeMenu = () => {
    if (!menu.open) return;
    menu.classList.remove('is-open');
    if (lenis) lenis.start();
    setTimeout(() => { if (!menu.classList.contains('is-open')) menu.close(); }, reduced ? 0 : 800);
  };
  menuOpen.addEventListener('click', openMenu);
  document.getElementById('menu-close').addEventListener('click', closeMenu);
  menu.addEventListener('cancel', (e) => { e.preventDefault(); closeMenu(); });
  // Capture phase: the menu must release scrolling before the link's own smooth-scroll handler runs
  menu.addEventListener('click', (e) => { if (e.target.closest('a[href^="#"]')) closeMenu(); }, true);

  // Hero footage plays only while on screen
  const heroVideo = document.getElementById('hero-video');
  if (!reduced) {
    new IntersectionObserver(([en]) => { if (en.isIntersecting) heroVideo.play().catch(() => {}); else heroVideo.pause(); }, { threshold: 0.05 }).observe(document.getElementById('hero-media'));
  }

  // Fix this homepage: every choice restyles the live page; the slider reveals the untouched original
  const fixPage = document.getElementById('fix-page');
  const fixFrame = document.getElementById('fix-frame');
  const fixOpts = [...document.querySelectorAll('.fix-opt[data-group]')];
  const fixGroups = [...new Set(fixOpts.map((o) => o.dataset.group))];
  const fixOriginal = fixPage.cloneNode(true);
  fixOriginal.removeAttribute('id');
  fixOriginal.classList.add('fix-original');
  fixOriginal.setAttribute('aria-hidden', 'true');
  fixOriginal.querySelector('img').alt = '';
  fixFrame.append(fixOriginal);
  const setFix = (group, value) => {
    fixPage.dataset[group] = value;
    fixOpts.filter((o) => o.dataset.group === group).forEach((o) => {
      const on = o.dataset.value === String(value);
      o.setAttribute('aria-pressed', String(on));
      if (on) document.getElementById(`why-${group}`).textContent = o.dataset.why;
    });
    const done = fixGroups.filter((g) => fixPage.dataset[g] !== '0').length;
    document.getElementById('fix-count').textContent = `${done} of ${fixGroups.length} fixed`;
  };
  fixOpts.forEach((o) => o.addEventListener('click', () => setFix(o.dataset.group, o.dataset.value)));
  const optionCount = (g) => fixOpts.filter((o) => o.dataset.group === g).length;
  document.getElementById('fix-all').addEventListener('click', () => fixGroups.forEach((g) => setFix(g, 1)));
  document.getElementById('fix-reset').addEventListener('click', () => fixGroups.forEach((g) => setFix(g, 0)));
  document.getElementById('fix-random').addEventListener('click', () => fixGroups.forEach((g) => setFix(g, 1 + Math.floor(Math.random() * (optionCount(g) - 1)))));
  document.querySelectorAll('.fix-opt[data-device]').forEach((b, _, all) => b.addEventListener('click', () => {
    all.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fixPage.dataset.device = b.dataset.device;
    fixOriginal.dataset.device = b.dataset.device;
    fixFrame.classList.toggle('is-phone', b.dataset.device === 'phone');
  }));
  document.getElementById('fix-cut').addEventListener('input', (e) => {
    fixFrame.style.setProperty('--cut', `${e.target.value}%`);
    fixFrame.style.setProperty('--cut-line', e.target.value === '0' || e.target.value === '100' ? 0 : 1);
    fixOriginal.style.setProperty('--cut', `${e.target.value}%`);
  });

  // Scroll-linked motion
  const header = document.getElementById('header');
  const toned = [...document.querySelectorAll('[data-tone]')];
  const services = document.getElementById('services');
  let lastY = window.scrollY;

  const heroCopy = document.querySelector('.hero-copy');
  const tick = () => {
    const y = window.scrollY;
    const vh = window.innerHeight;

    const under = toned.find((s) => { const r = s.getBoundingClientRect(); return r.top <= 30 && r.bottom > 30; });
    if (under) header.dataset.tone = under.dataset.tone; else if (heroCopy.getBoundingClientRect().top < 72 && y < vh) header.dataset.tone = 'ground'; else delete header.dataset.tone;

    // Header steps aside while scrolling down so it never sits on top of a headline
    if (Math.abs(y - lastY) > 4) { header.classList.toggle('is-away', y > lastY && y > 120); lastY = y; }

    // The page ground turns to stone as Services arrives
    const s = services.getBoundingClientRect();
    document.body.classList.toggle('is-stone', s.top < vh * 0.55 && s.bottom > vh * 0.35);

    if (reduced) return;

    if (root.classList.contains('explore-pin')) {
      const box = explore.getBoundingClientRect();
      const p = clamp(-box.top / (box.height - vh), 0, 0.9999);
      const raw = p * slides.length;
      show(Math.floor(raw));
      // Screenshots around the frame keep drifting a little within each project
      slides[current].style.setProperty('--drift', ((raw % 1) - 0.5) * -5);
    }
  };
  let queued = false;
  function onScroll() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; tick(); }); }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  pinQuery.addEventListener('change', applyMode);
  applyMode();

  // Letter form: checks the fields, then hands the message to the visitor's email app
  const letter = document.getElementById('letter');
  const letterStatus = document.getElementById('letter-status');
  const letterFields = [...letter.querySelectorAll('input, select, textarea')];
  const checkField = (el) => {
    const bad = !el.checkValidity();
    el.setAttribute('aria-invalid', String(bad));
    return !bad;
  };
  letterFields.forEach((el) => {
    el.addEventListener('blur', () => { if (el.getAttribute('aria-invalid') === 'true') checkField(el); });
    el.addEventListener('change', () => { if (el.getAttribute('aria-invalid') === 'true') checkField(el); });
  });
  letter.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = letterFields.filter((el) => !checkField(el));
    if (bad.length) { bad[0].focus(); letterStatus.textContent = 'A couple of blanks are still empty. Fill in the marked ones and send again.'; return; }
    const d = Object.fromEntries(new FormData(letter).entries());
    const body = [`Hey, my name is ${d.name} and I run ${d.business}.`, d.website ? `You can see us at ${d.website}.` : '', `What I need most is ${d.need}.`, `Here's what isn't working yet:\n${d.message}`, `I'd like to start ${d.when}.`, `You can reach me at ${d.email}.`].filter(Boolean).join('\n\n');
    location.href = `mailto:aabid@starleddisplay.com?subject=${encodeURIComponent(`Project enquiry from ${d.business}`)}&body=${encodeURIComponent(body)}`;
    letterStatus.textContent = 'Your email app should open with this filled in. Press send there and it reaches us.';
  });

  // Services: the word melts from one service into the next, only while on screen
  if (!reduced) {
    const words = ['website', 'SEO', 'ads'];
    const wordA = document.getElementById('morph-a');
    const wordB = document.getElementById('morph-b');
    const HOLD = 1700;
    const MELT = 1000;
    let index = 0;
    let started = 0;
    let visible = false;
    let raf = 0;
    const show = (el, f) => {
      if (f <= 0) { el.style.opacity = 0; el.style.filter = ''; return; }
      el.style.opacity = Math.pow(f, 0.4);
      el.style.filter = f >= 1 ? '' : `blur(${Math.min(8 / f - 8, 40).toFixed(2)}px)`;
    };
    wordB.textContent = words[1];
    show(wordB, 0);
    const melt = (t) => {
      if (!visible) { raf = 0; return; }
      if (!started) started = t;
      const f = Math.min(Math.max((t - started - HOLD) / MELT, 0), 1);
      show(wordB, f);
      show(wordA, 1 - f);
      if (f >= 1) {
        index = (index + 1) % words.length;
        wordA.textContent = words[index];
        wordB.textContent = words[(index + 1) % words.length];
        show(wordA, 1);
        show(wordB, 0);
        started = t;
      }
      raf = requestAnimationFrame(melt);
    };
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible && !raf) { started = 0; raf = requestAnimationFrame(melt); }
    }).observe(document.getElementById('morph'));
  }
})();
