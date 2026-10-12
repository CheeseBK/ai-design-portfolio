/* ------------------------------------------------------------------
   Signal Garden — homepage interaction
   Each click / tap plants one flower at the pointer and plays one
   FM note. Height -> pitch (F# minor pentatonic), left/right -> pan,
   petal shape -> timbre (FM ratio), flower size -> note length.
------------------------------------------------------------------- */
(function () {
  const field = document.querySelector(".field");
  if (!field) return;
  const canvas = field.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const countEl = field.querySelector(".count");
  const soundBtn = field.querySelector(".sound");
  const hint = field.querySelector(".hint");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse && hint) hint.firstChild.textContent = "Tap to plant a note";

  let W = 0, H = 0, DPR = 1;
  const flowers = [];
  const ripples = [];
  const ticks = new Float32Array(157); // 157 bars, like the track −0

  /* ---------- palette & variation ---------- */
  // cold blues/cyans/violets, with the magenta and ON-AIR red of PUNK RADIO
  const HUES = [196, 206, 218, 232, 252, 272, 292, 318, 338, 352, 178, 46];
  const PROFILES = ["rounded", "pointed", "lobed", "narrow", "cells"];
  let lastHue = -999, lastProfile = "";

  function pickHue() {
    let h, tries = 0;
    do {
      h = HUES[(Math.random() * HUES.length) | 0] + (Math.random() * 10 - 5);
      tries++;
    } while (tries < 20 && Math.min(Math.abs(h - lastHue), 360 - Math.abs(h - lastHue)) < 38);
    lastHue = h;
    return h;
  }
  function pickProfile() {
    const opts = PROFILES.filter((p) => p !== lastProfile);
    const p = opts[(Math.random() * opts.length) | 0];
    lastProfile = p;
    return p;
  }

  /* ---------- canvas sizing ---------- */
  function resize() {
    const r = field.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw(performance.now());
  }

  /* ---------- petal paths (drawn pointing up, length L, width w) ---------- */
  function petalPath(profile, L, w) {
    const p = new Path2D();
    switch (profile) {
      case "rounded":
        p.moveTo(0, 0);
        p.bezierCurveTo(w * 1.1, -L * 0.25, w * 1.0, -L * 0.95, 0, -L);
        p.bezierCurveTo(-w * 1.0, -L * 0.95, -w * 1.1, -L * 0.25, 0, 0);
        break;
      case "pointed":
        p.moveTo(0, 0);
        p.quadraticCurveTo(w * 1.05, -L * 0.45, 0, -L * 1.08);
        p.quadraticCurveTo(-w * 1.05, -L * 0.45, 0, 0);
        break;
      case "lobed":
        p.moveTo(0, 0);
        p.bezierCurveTo(w * 1.2, -L * 0.3, w * 1.15, -L * 1.0, w * 0.35, -L * 0.98);
        p.quadraticCurveTo(0, -L * 0.8, -w * 0.35, -L * 0.98);
        p.bezierCurveTo(-w * 1.15, -L * 1.0, -w * 1.2, -L * 0.3, 0, 0);
        break;
      case "narrow":
        p.moveTo(0, 0);
        p.bezierCurveTo(w * 0.42, -L * 0.3, w * 0.38, -L * 1.1, 0, -L * 1.22);
        p.bezierCurveTo(-w * 0.38, -L * 1.1, -w * 0.42, -L * 0.3, 0, 0);
        break;
    }
    return p;
  }

  /* ---------- drawing ---------- */
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function back(t) { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

  function drawFlower(f, now) {
    const age = now - f.born;
    const t = reduced ? 1 : Math.min(1, age / 520);
    const s = reduced ? 1 : back(t);
    const x = f.nx * W, y = f.ny * H;
    const R = f.size * f.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(f.rot + (1 - ease(t)) * 0.6);
    ctx.scale(s, s);

    const fill = `hsla(${f.hue}, ${f.sat}%, ${f.light}%, 0.78)`;
    const edge = `hsla(${f.hue}, ${Math.min(100, f.sat + 10)}%, ${Math.min(94, f.light + 26)}%, 0.95)`;
    const inner = `hsla(${(f.hue + f.shift) % 360}, ${f.sat}%, ${Math.max(12, f.light - 22)}%, 0.9)`;

    ctx.shadowColor = `hsla(${f.hue}, 100%, 70%, ${0.55 * (1 - ease(Math.min(1, age / 1600))) + 0.18})`;
    ctx.shadowBlur = 16;

    for (let i = 0; i < f.petals; i++) {
      ctx.save();
      ctx.rotate((i / f.petals) * Math.PI * 2);
      if (f.profile === "cells") {
        // petal made of hard rectangular cells — the −0 cover's cells
        const n = f.cellCount, cs = R / n;
        for (let k = 0; k < n; k++) {
          const wk = cs * (0.9 + 0.9 * Math.sin(((k + 0.5) / n) * Math.PI));
          ctx.fillStyle = k % 2 ? fill : edge;
          ctx.fillRect(-wk / 2, -(k + 1) * cs + cs * 0.18, wk, cs * 0.64);
        }
      } else {
        const path = petalPath(f.profile, R, R * f.width);
        const g = ctx.createLinearGradient(0, 0, 0, -R);
        g.addColorStop(0, inner);
        g.addColorStop(1, fill);
        ctx.fillStyle = g;
        ctx.fill(path);
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = edge;
        ctx.stroke(path);
      }
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    // centre
    ctx.fillStyle = `hsl(${(f.hue + f.shift) % 360}, 90%, 82%)`;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(2.5, R * 0.13), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(7,9,12,.85)";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.fillRect(Math.cos(a) * R * 0.07 - 0.75, Math.sin(a) * R * 0.07 - 0.75, 1.5, 1.5);
    }
    ctx.restore();
  }

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);
    // dot grid
    ctx.fillStyle = "rgba(220,235,255,0.07)";
    const step = 28;
    for (let y = step; y < H; y += step) for (let x = step; x < W; x += step) ctx.fillRect(x, y, 1, 1);
    // the minus sign: one thin line of light across the middle
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(220,235,255,0)");
    g.addColorStop(0.5, "rgba(220,235,255,0.22)");
    g.addColorStop(1, "rgba(220,235,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.round(H / 2), W, 1);
    // 157 bar ticks along the bottom — each flower lights the bar under it
    const pad = 18, span = W - pad * 2;
    for (let i = 0; i < 157; i++) {
      const x = pad + (i / 156) * span;
      const v = ticks[i];
      const major = i % 16 === 0;
      ctx.fillStyle = v > 0.01
        ? `rgba(143,194,255,${0.25 + 0.75 * Math.min(1, v)})`
        : `rgba(220,235,255,${major ? 0.22 : 0.1})`;
      const h = (major ? 7 : 4) + Math.min(1, v) * 10;
      ctx.fillRect(Math.round(x), H - 46 - h, 1, h);
    }
  }

  function drawIdle(now) {
    // pulsing target in the centre until the first flower is planted
    const t = (now % 2400) / 2400;
    const x = W / 2, y = H / 2;
    ctx.strokeStyle = `rgba(143,194,255,${0.5 * (1 - t)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 6 + t * 46, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(220,235,255,0.85)";
    ctx.fillRect(x - 7, y - 0.5, 14, 1); ctx.fillRect(x - 0.5, y - 7, 1, 14);
  }

  function draw(now) {
    drawBackground();
    if (!flowers.length) drawIdle(now);
    for (const r of ripples) {
      const t = (now - r.born) / 1100;
      if (t >= 1) continue;
      ctx.strokeStyle = `hsla(${r.hue}, 90%, 75%, ${0.5 * (1 - t)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(r.nx * W, r.ny * H, r.size * (0.6 + ease(t) * 2.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of flowers) drawFlower(f, now);
  }

  let raf = 0;
  function loop(now) {
    draw(now);
    const busy = (!flowers.length && !reduced) || flowers.some((f) => now - f.born < 1700) || ripples.some((r) => now - r.born < 1100);
    while (ripples.length && now - ripples[0].born > 1100) ripples.shift();
    raf = busy ? requestAnimationFrame(loop) : 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  /* ---------- sound ---------- */
  let ac = null, master = null, delayIn = null;
  let soundOn = true;
  try { if (localStorage.getItem("rc-sound") === "off") soundOn = false; } catch (e) {}
  function setSoundUI() {
    if (!soundBtn) return;
    soundBtn.setAttribute("aria-pressed", String(soundOn));
    soundBtn.querySelector("span").textContent = soundOn ? "Sound on" : "Sound off";
  }
  setSoundUI();

  function initAudio() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain();
    master.gain.value = 0.14; // about −17 dBFS peak per note
    master.connect(comp); comp.connect(ac.destination);
    // dotted-eighth feedback delay at 130 BPM (0.346 s) — a nod to −0
    delayIn = ac.createGain(); delayIn.gain.value = 0.22;
    const d = ac.createDelay(1.0); d.delayTime.value = 60 / 130 * 0.75;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
    delayIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);
  }

  // F# minor pentatonic, two octaves from F#3
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
  const RATIO = { rounded: 1, pointed: 2, lobed: 3, narrow: 3.5, cells: 1.5 };

  function playNote(f) {
    if (!soundOn) return;
    initAudio();
    if (!ac) return;
    if (ac.state === "suspended") ac.resume();
    const step = SCALE[Math.round((1 - f.ny) * (SCALE.length - 1))];
    const freq = 185 * Math.pow(2, step / 12);
    const t = ac.currentTime + 0.005;
    const len = 0.7 + (f.size - 22) / 44 * 1.2;

    const car = ac.createOscillator(); car.type = "sine"; car.frequency.value = freq;
    const mod = ac.createOscillator(); mod.type = "sine"; mod.frequency.value = freq * RATIO[f.profile];
    const modGain = ac.createGain();
    const idx = freq * (1.2 + f.petals / 6);
    modGain.gain.setValueAtTime(idx, t);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.04), t + len * 0.6);
    mod.connect(modGain); modGain.connect(car.frequency);

    const amp = ac.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len);

    let out = amp;
    if (ac.createStereoPanner) {
      const pan = ac.createStereoPanner(); pan.pan.value = (f.nx - 0.5) * 1.6;
      amp.connect(pan); out = pan;
    }
    car.connect(amp);
    out.connect(master); out.connect(delayIn);
    car.start(t); mod.start(t);
    car.stop(t + len + 0.05); mod.stop(t + len + 0.05);
  }

  /* ---------- planting ---------- */
  function plant(nx, ny) {
    const small = Math.min(1, Math.max(0.68, W / 980));
    const profile = pickProfile();
    const f = {
      nx, ny, profile,
      hue: pickHue(),
      sat: 70 + Math.random() * 25,
      light: 52 + Math.random() * 14,
      shift: 20 + Math.random() * 60,
      petals: profile === "narrow" ? 9 + ((Math.random() * 6) | 0)
            : profile === "cells" ? 6 + ((Math.random() * 5) | 0)
            : 5 + ((Math.random() * 4) | 0),
      width: profile === "lobed" ? 0.55 + Math.random() * 0.2 : 0.38 + Math.random() * 0.3,
      cellCount: 5 + ((Math.random() * 4) | 0),
      size: 22 + Math.random() * 44,
      scale: small,
      rot: Math.random() * Math.PI * 2,
      born: performance.now(),
    };
    flowers.push(f);
    if (flowers.length > 160) flowers.shift();
    ripples.push({ nx, ny, size: f.size * small, hue: f.hue, born: f.born });
    const ti = Math.round(Math.max(0, Math.min(1, (nx * W - 18) / (W - 36))) * 156);
    for (let k = -2; k <= 2; k++) {
      const j = ti + k;
      if (j >= 0 && j < 157) ticks[j] += k === 0 ? 0.6 : 0.25;
    }
    field.classList.add("used");
    if (countEl) countEl.textContent = String(flowers.length).padStart(3, "0") + " / NOTES";
    playNote(f);
    kick();
  }

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    plant((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      plant(0.1 + Math.random() * 0.8, 0.15 + Math.random() * 0.7);
    }
  });
  if (soundBtn) {
    soundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      soundOn = !soundOn;
      try { localStorage.setItem("rc-sound", soundOn ? "on" : "off"); } catch (err) {}
      setSoundUI();
    });
  }

  let rt = 0;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(resize, 80); });
  resize();
  kick();
})();

/* ------------------------------------------------------------------
   Before / after comparison sliders on project pages
------------------------------------------------------------------- */
document.querySelectorAll(".compare").forEach((c) => {
  const input = c.querySelector("input");
  const set = () => c.style.setProperty("--pos", input.value + "%");
  input.addEventListener("input", set);
  set();
});
