/* Sonar landing — page behaviour.
   Plain ES2018, no framework. Every animation from the original build is here:
   hero grain, glass nav, char-split headline, scroll reveals, counters,
   waterfall bars, FAQ accordion, and the two WebGL shader canvases. */
(function () {
  'use strict';

  var ACCENT = '#499DE0';
  var ACCENT_RGB = '73,157,224';
  var ACCENT_VEC = [0.49, 0.83, 0.99];
  var GRAIN_OPACITY = 0.055;

  /* `soft` is the restrained motion track: shorter, smaller, no scrubbing,
     no shader loops. Everything still arrives, it just stops moving. */
  var soft = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function wait(test, ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() {
        if (test()) return res(true);
        if (Date.now() - t0 > ms) return res(false);
        requestAnimationFrame(tick);
      })();
    });
  }

  /* ---------- hero video ---------- */
  function heroVideo() {
    var vid = document.querySelector('[data-hero-video]');
    if (!vid) return;
    vid.muted = true;
    vid.volume = 0;
    var show = function () { vid.style.opacity = '1'; };
    if (vid.readyState >= 2) show(); else vid.addEventListener('loadeddata', show, { once: true });
    if (soft) {
      vid.removeAttribute('autoplay');
      vid.loop = false;
      var hold = function () { vid.pause(); vid.currentTime = 0; };
      if (vid.readyState >= 2) hold(); else vid.addEventListener('loadeddata', hold, { once: true });
    } else {
      var p = vid.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  /* ---------- hero grain ---------- */
  function grain() {
    var cv = document.querySelector('[data-grain]');
    if (!cv) return;
    cv.style.opacity = String(GRAIN_OPACITY);
    var ctx = cv.getContext('2d', { alpha: true });
    // 1:1 grain: build small noise tiles, repeat them at native pixel size
    var T = 128;
    var tiles = [];
    for (var f = 0; f < 4; f++) {
      var tc = document.createElement('canvas');
      tc.width = T; tc.height = T;
      var tx = tc.getContext('2d');
      var img = tx.createImageData(T, T);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = (Math.random() * 255) | 0;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      tx.putImageData(img, 0, 0);
      tiles.push(ctx.createPattern(tc, 'repeat'));
    }
    var fit = function () {
      var r = cv.getBoundingClientRect();
      var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    };
    fit();
    var paint = function (k) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.save();
      ctx.translate(-((Math.random() * T) | 0), -((Math.random() * T) | 0));
      ctx.fillStyle = tiles[k % tiles.length];
      ctx.fillRect(0, 0, cv.width + T, cv.height + T);
      ctx.restore();
    };
    var n = 0, last = 0, raf, stopped = false;
    var loop = function (t) {
      if (stopped) return;
      if (t - last > 90) { paint(n++); last = t; }
      raf = requestAnimationFrame(loop);
    };
    // ResizeObserver, not window.resize: the hero also changes size when the
    // layout around it moves (zoom, a revealed pane, orientation), and a stale
    // backing store stretches the grain instead of retiling it.
    new ResizeObserver(function () { fit(); paint(n); }).observe(cv);
    if (soft) paint(0);
    else raf = requestAnimationFrame(loop);
    // The loop costs nothing while the hero is off screen.
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (soft) return;
        if (e.isIntersecting && stopped) { stopped = false; raf = requestAnimationFrame(loop); }
        else if (!e.isIntersecting) { stopped = true; cancelAnimationFrame(raf); }
      });
    }).observe(cv);
  }

  /* ---------- sticky glass nav ---------- */
  function nav() {
    var el = document.querySelector('[data-nav]');
    if (!el) return;
    var glassy = null;
    var apply = function () {
      var on = window.scrollY > 24;
      if (on === glassy) return;
      glassy = on;
      el.style.background = on ? 'rgba(9,10,11,0.62)' : 'rgba(9,10,11,0)';
      el.style.backdropFilter = on ? 'blur(22px) saturate(150%)' : 'blur(0px)';
      el.style.webkitBackdropFilter = el.style.backdropFilter;
      el.style.borderColor = on ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0)';
      el.style.padding = on ? '13px 0' : '22px 0';
      el.style.boxShadow = on ? '0 10px 40px rgba(0,0,0,0.45)' : 'none';
    };
    apply();
    window.addEventListener('scroll', apply, { passive: true });

    var toggle = document.querySelector('[data-nav-toggle]');
    var panel = document.querySelector('[data-nav-panel]');
    var mq = window.matchMedia('(max-width: 760px)');

    var setOpen = function (on) {
      if (!panel || !toggle) return;
      if (on) { panel.hidden = false; panel.dataset.open = '1'; }
      else { panel.dataset.open = ''; panel.hidden = true; }
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      toggle.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    };
    if (toggle && panel) {
      setOpen(false);
      toggle.addEventListener('click', function () {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
      });
      panel.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { setOpen(false); });
      });
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;
        setOpen(false);
        toggle.focus();
      });
    }

    // Which of the two navs is shown is CSS. The only thing left for script is
    // the disclosure's state: a panel left open while the viewport grows past
    // the breakpoint would stay open behind the desktop links.
    mq.addEventListener('change', function () { if (!mq.matches) setOpen(false); });
  }

  /* ---------- faq accordion ---------- */
  function faq() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-faq]'));
    items.forEach(function (it, i) {
      var b = it.querySelector('[data-faq-btn]'), body = it.querySelector('[data-faq-body]');
      if (!b || !body) return;
      var id = 'faq-panel-' + (i + 1);
      body.id = id;
      body.setAttribute('role', 'region');
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-controls', id);
      b.id = b.id || 'faq-btn-' + (i + 1);
      body.setAttribute('aria-labelledby', b.id);
    });
    var close = function (it) {
      var body = it.querySelector('[data-faq-body]'), ic = it.querySelector('[data-faq-icon]');
      if (window.gsap) window.gsap.to(body, { height: 0, duration: .45, ease: 'power3.inOut' });
      else body.style.height = '0px';
      ic.style.transform = 'rotate(0deg)';
      ic.style.borderColor = 'rgba(255,255,255,0.14)';
      var cb = it.querySelector('[data-faq-btn]');
      if (cb) cb.setAttribute('aria-expanded', 'false');
      it.dataset.open = '';
    };
    items.forEach(function (it) {
      var btn = it.querySelector('[data-faq-btn]');
      var body = it.querySelector('[data-faq-body]');
      var icon = it.querySelector('[data-faq-icon]');
      if (!btn || !body || !icon) return;
      btn.addEventListener('click', function () {
        var open = it.dataset.open === '1';
        items.forEach(function (o) { if (o !== it && o.dataset.open === '1') close(o); });
        if (open) return close(it);
        it.dataset.open = '1';
        btn.setAttribute('aria-expanded', 'true');
        var h = body.scrollHeight;
        if (window.gsap) {
          window.gsap.fromTo(body, { height: 0 }, {
            height: h, duration: .5, ease: 'power3.out',
            onComplete: function () { body.style.height = 'auto'; }
          });
        } else {
          body.style.height = h + 'px';
        }
        icon.style.transform = 'rotate(135deg)';
        icon.style.borderColor = 'rgba(' + ACCENT_RGB + ',0.5)';
      });
    });
  }

  /* ---------- copy the install command ---------- */
  function copyCmd() {
    var btn = document.querySelector('[data-copy-cmd]');
    var cmd = document.querySelector('[data-install-cmd]');
    if (!btn || !cmd) return;
    var label = btn.querySelector('[data-copy-label]');
    var timer;
    var flash = function (text, ok) {
      if (label) label.textContent = text;
      btn.style.color = ok ? ACCENT : 'rgba(235,238,240,.72)';
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (label) label.textContent = 'Copy';
        btn.style.color = 'rgba(235,238,240,.72)';
      }, 1800);
    };
    var fallback = function (text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    };
    btn.addEventListener('click', function () {
      var text = cmd.textContent.trim();
      if (!navigator.clipboard) {
        var done = fallback(text);
        return flash(done ? 'Copied' : 'Press Ctrl+C', done);
      }
      navigator.clipboard.writeText(text).then(
        function () { flash('Copied', true); },
        function () { var ok = fallback(text); flash(ok ? 'Copied' : 'Press Ctrl+C', ok); }
      );
    });
  }

  /* ---------- scroll + entrance ---------- */
  function scrollAnims() {
    var gsap = window.gsap;

    // hero headline: char reveal
    var h1 = document.querySelector('[data-split]');
    if (h1 && !h1.dataset.done) {
      h1.dataset.done = '1';
      var lines = h1.querySelectorAll('[data-hero-line]');
      var hosts = lines.length ? Array.prototype.slice.call(lines) : [h1];
      var spans = [];
      hosts.forEach(function (host) {
        var txt = host.textContent;
        host.textContent = '';
        txt.split('').forEach(function (ch) {
          var s = document.createElement('span');
          s.textContent = ch === ' ' ? '\u00A0' : ch;
          s.style.display = 'inline-block';
          s.style.willChange = 'transform, opacity';
          host.appendChild(s);
          spans.push(s);
        });
      });
      gsap.set(h1, { opacity: 1 });
      gsap.from(spans, {
        yPercent: soft ? 0 : 118, opacity: 0, filter: 'blur(10px)',
        duration: soft ? .5 : 1.15, ease: 'power4.out',
        stagger: soft ? 0.01 : 0.035, delay: .12,
        onComplete: function () { gsap.set(spans, { clearProps: 'willChange,filter' }); }
      });
    }
    gsap.from('[data-hero-el]', {
      y: soft ? 8 : 26, opacity: 0, duration: .9, ease: 'power3.out',
      stagger: .09, delay: soft ? .1 : .5
    });

    // hero content parks out as you scroll into the logo strip
    var hero = document.querySelector('[data-hero-content]');
    if (hero && !soft) {
      gsap.to(hero, {
        y: -70, opacity: 0, filter: 'blur(6px)', ease: 'none',
        scrollTrigger: { trigger: '#top', start: 'top top', end: 'bottom 55%', scrub: .6 }
      });
    }

    // generic reveals — cards are excluded so nothing gets two tweens at once
    gsap.utils.toArray('[data-reveal]:not([data-card])').forEach(function (el) {
      gsap.fromTo(el, { y: soft ? 10 : 34, opacity: 0 }, {
        y: 0, opacity: 1, duration: soft ? .5 : .95, ease: 'power3.out', force3D: true,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onComplete: function () { gsap.set(el, { clearProps: 'willChange' }); }
      });
    });

    // card lift-in: one tween per card. Row grids animate together with a stagger;
    // stacked (mobile) cards each trigger on themselves.
    var stacked = window.matchMedia('(max-width: 1000px)').matches;
    var groups = new Map();
    gsap.utils.toArray('[data-card]').forEach(function (el) {
      var grid = el.parentElement;
      var inRow = !stacked && grid && grid.hasAttribute('data-pricing-grid');
      var key = inRow ? grid : el;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(el);
    });
    groups.forEach(function (els, trigger) {
      gsap.set(els, { willChange: 'transform, opacity' });
      gsap.fromTo(els, { y: soft ? 10 : 40, opacity: 0 }, {
        y: 0, opacity: 1, duration: soft ? .5 : .85, ease: 'power3.out',
        force3D: true, stagger: els.length > 1 ? .08 : 0,
        scrollTrigger: { trigger: trigger, start: 'top 90%', once: true },
        onComplete: function () { gsap.set(els, { clearProps: 'willChange,transform' }); }
      });
    });

    // waterfall bars
    gsap.utils.toArray('[data-bar]').forEach(function (bar) {
      gsap.fromTo(bar, { scaleX: 0 }, {
        scaleX: 1, duration: 1.1, ease: 'power3.out', delay: .1,
        scrollTrigger: { trigger: bar, start: 'top 92%', once: true }
      });
    });

    // counters
    gsap.utils.toArray('[data-count]').forEach(function (el) {
      var to = parseFloat(el.dataset.count);
      var dec = parseInt(el.dataset.decimals || '0', 10);
      var o = { v: 0 };
      gsap.to(o, {
        v: to, duration: 1.8, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onUpdate: function () { el.textContent = o.v.toFixed(dec); }
      });
    });
  }

  /* ---------- shared shader plumbing ----------
     Both canvases are one fullscreen quad with a fragment shader, so the
     renderer / camera / resize / visibility wiring lives here once. */
  var VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy*2.0, 0.0, 1.0); }';
  var NOISE = [
    'float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }'
  ].join('\n');

  function shaderQuad(selector, fragment, extraUniforms, rootMargin) {
    var cv = document.querySelector(selector);
    if (!cv || soft) return;
    var THREE = window.THREE;
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false }); }
    catch (e) { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    var scene = new THREE.Scene();
    var cam = new THREE.OrthographicCamera(-.5, .5, .5, -.5, 0, 1);
    var uni = { uTime: { value: 0 }, uAspect: { value: 1 } };
    Object.keys(extraUniforms).forEach(function (k) { uni[k] = extraUniforms[k]; });
    var mat = new THREE.ShaderMaterial({
      transparent: true, uniforms: uni, vertexShader: VERT, fragmentShader: fragment
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));

    var size = function () {
      var r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      uni.uAspect.value = r.width / r.height;
    };
    size();
    var raf, visible = false, t0 = performance.now();
    var loop = function (t) {
      uni.uTime.value = (t - t0) / 1000;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(loop);
    };
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !visible) {
          visible = true;
          raf = requestAnimationFrame(loop);
        } else if (!e.isIntersecting && visible) {
          visible = false;
          cancelAnimationFrame(raf);
        }
      });
    }, { rootMargin: rootMargin }).observe(cv);
    // Same reason as the grain canvas: track the element, not the window.
    new ResizeObserver(size).observe(cv);
  }

  /* ---------- halo shader behind the terminal window ---------- */
  function halo() {
    var THREE = window.THREE;
    shaderQuad('[data-halo-gl]', [
      'precision mediump float;',
      'varying vec2 vUv; uniform float uTime, uAspect; uniform vec3 uC1, uC2, uC3;',
      NOISE,
      'void main(){',
      '  float t = uTime*0.16;',
      '  vec2 p = (vUv-0.5)*vec2(uAspect,1.0);',
      // domain warp so the halo drifts and folds instead of pulsing on a circle
      '  float w1 = n(p*1.5 + vec2(t*1.1, -t*0.8));',
      '  float w2 = n(p*3.0 - vec2(t*0.9, t*0.6));',
      '  float w3 = n(p*0.9 + vec2(-t*0.6, t*0.4));',
      '  vec2 q = p + 0.46*vec2(w1-0.5, w2-0.5) + 0.20*vec2(w3-0.5, w1-0.5);',
      '  vec2 c = vec2(0.10*uAspect + 0.10*sin(t*0.9), 0.10 + 0.12*cos(t*0.7));',
      '  float d = length((q-c)*vec2(0.62,1.15));',
      '  float halo = smoothstep(1.05 + 0.10*sin(t*0.8), 0.02, d);',
      '  float ring = smoothstep(0.44, 0.0, abs(d-0.38-0.06*sin(t*1.2)));',
      '  vec3 col = mix(uC2*0.42, uC1, pow(halo, 1.30));',
      '  col = mix(col, uC3, 0.28*ring*halo);',
      '  col *= 1.2;',
      '  float vx = smoothstep(0.0,0.34,vUv.x)*smoothstep(1.0,0.90,vUv.x);',
      '  float vy = smoothstep(0.0,0.24,vUv.y)*smoothstep(1.0,0.76,vUv.y);',
      '  float a = clamp(halo*0.95 + ring*0.22, 0.0, 1.0) * mix(0.10, 1.0, vx*vy);',
      '  float g = (h(vUv*1024.0 + fract(uTime))-0.5)*0.085;',
      '  gl_FragColor = vec4(col + g, clamp(a + abs(g)*0.5, 0.0, 1.0));',
      '}'
    ].join('\n'), {
      uC1: { value: new THREE.Vector3(ACCENT_VEC[0], ACCENT_VEC[1], ACCENT_VEC[2]) },
      uC2: { value: new THREE.Vector3(0.0, 0.0, 0.655) },
      uC3: { value: new THREE.Vector3(0.816, 0.737, 0.882) }
    }, '150px');
  }

  /* ---------- glow field in the closing CTA ---------- */
  function ctaGlow() {
    var THREE = window.THREE;
    shaderQuad('[data-cta-gl]', [
      'precision mediump float;',
      'varying vec2 vUv; uniform float uTime; uniform float uAspect; uniform vec3 uCol;',
      NOISE,
      'void main(){',
      '  vec2 uv = vUv;',
      '  vec2 p = vec2((uv.x-0.5)*uAspect*0.9, uv.y-0.02);',
      '  float d = length(p);',
      '  float glow = smoothstep(0.85, 0.0, d);',
      '  float f1 = n(uv*2.6 + vec2(uTime*0.045, uTime*0.03));',
      '  float f2 = n(uv*6.0 - vec2(uTime*0.03, uTime*0.05));',
      '  float f = glow*(0.5+0.5*f1)*(0.72+0.28*f2);',
      '  float band = smoothstep(0.0, 0.55, uv.y);',
      '  f *= mix(1.0, 0.25, band);',
      '  vec3 col = uCol*f;',
      '  gl_FragColor = vec4(col, f*0.85);',
      '}'
    ].join('\n'), {
      uCol: { value: new THREE.Vector3(ACCENT_VEC[0], ACCENT_VEC[1], ACCENT_VEC[2]) }
    }, '120px');
  }

  function boot() {
    heroVideo();
    grain();
    nav();
    faq();
    copyCmd();

    wait(function () { return window.gsap && window.ScrollTrigger; }, 8000).then(function (ok) {
      if (!ok) return;
      window.gsap.registerPlugin(window.ScrollTrigger);
      scrollAnims();
    });
    wait(function () { return window.THREE; }, 8000).then(function (ok) {
      if (!ok) return;
      ctaGlow();
      halo();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
