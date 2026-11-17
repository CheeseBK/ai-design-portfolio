// Room Tone — final build (DSC 494, Week 3)
// One input: click / tap where you hear something.
// Sound check -> Opening -> 01 Calibrate -> 02 Phantoms -> 03 Feedback -> Ending (clean take)
//
// Week 3 changes: the phantoms are no longer random fragments but one song —
// the song recorded all night — on a tempo grid. The more the player listens
// for it (clicks), the more of the song plays; stillness takes it apart layer
// by layer. Stage titles, a goal meter, earlier hints, a headphone check and
// an ending that says what happened.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const cv = $('#room'), ctx = cv.getContext('2d');
  const recEl = $('#rec'), takeEl = $('#take'), clockEl = $('#clock');
  const meterEl = $('#meter'), meterBar = meterEl.querySelector('b');
  const lineEl = $('#line'), sndBtn = $('#snd');
  const titleEl = $('#title'), creditsEl = $('#credits');

  const C = { line: '#2a3340', obj: '#6f7b8c', dim: '#3c4758', real: '#8fc2ff', ph: '#ff3d7f', ink: '#dcebff' };
  const A = 1.6;                        // room aspect, long side / short side
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Q = new URLSearchParams(location.search);
  const SPEED = Math.max(.25, Math.min(20, parseFloat(Q.get('speed')) || 1)); // testing only
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // ------------------------------------------------------------------ layout
  let W = 0, H = 0, dpr = 1, R = { x: 0, y: 0, w: 1, h: 1, L: 1, S: 1, portrait: false };
  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const portrait = H > W * 1.05, small = Math.min(W, H) < 560;
    const mt = small ? 64 : 76, mb = small ? 84 : 70, ml = small ? 16 : 40, mr = small ? 44 : 64;
    const aw = Math.max(50, W - ml - mr), ah = Math.max(50, H - mt - mb);
    let w, h;
    if (!portrait) { w = Math.min(aw, ah * A); h = w / A; } else { h = Math.min(ah, aw * A); w = h / A; }
    R = { x: ml + (aw - w) / 2, y: mt + (ah - h) / 2, w, h, portrait, L: portrait ? h : w, S: portrait ? w : h };
  }
  // room coords: u along the long side (0..1), v along the short side (0..1)
  function toScreen(u, v) { return R.portrait ? { x: R.x + (1 - v) * R.w, y: R.y + u * R.h } : { x: R.x + u * R.w, y: R.y + v * R.h }; }
  function fromScreen(px, py) { return R.portrait ? { u: (py - R.y) / R.h, v: 1 - (px - R.x) / R.w } : { u: (px - R.x) / R.w, v: (py - R.y) / R.h }; }
  const dist = (a, b) => Math.hypot((a.u - b.u) * A, a.v - b.v); // in short-side units

  // ------------------------------------------------------------------ the room
  // real sources, in the order the player meets them (spread left/right for the ear)
  const SRC = [
    { id: 'cym', u: .905, v: .215, snd: 'cym' },
    { id: 'chair', u: .135, v: .79, snd: 'chair' },
    { id: 'ac', u: .585, v: .955, snd: 'ac' },
    { id: 'stand', u: .37, v: .62, snd: 'stand' }
  ];
  const MIC = { u: .53, v: .52 };
  const BLOCK = [ // areas where nothing "empty" can appear
    { u0: .02, v0: .06, u1: .40, v1: .46 },   // piano + bench
    { u0: .61, v0: .05, u1: .98, v1: .47 },   // drum kit
    { u0: .50, v0: .92, u1: .67, v1: 1 }      // AC vent
  ];
  const POINTS = [MIC, SRC[1], SRC[3], { u: .985, v: .7 }];
  function freeFloor(near, radius) {
    for (let i = 0; i < 80; i++) {
      let p;
      if (near && i < 50) { const a = rand(0, Math.PI * 2), r = rand(.06, radius); p = { u: near.u + Math.cos(a) * r / A, v: near.v + Math.sin(a) * r }; }
      else p = { u: rand(.07, .93), v: rand(.1, .9) };
      if (p.u < .06 || p.u > .94 || p.v < .08 || p.v > .91) continue;
      if (BLOCK.some(b => p.u > b.u0 && p.u < b.u1 && p.v > b.v0 && p.v < b.v1)) continue;
      if (POINTS.some(q => dist(p, q) < .085)) continue;
      if (ghosts.some(g => dist(p, g) < .07)) continue;
      return p;
    }
    return { u: rand(.42, .58), v: rand(.62, .82) };
  }

  // ------------------------------------------------------------------ audio
  let ac = null, out, dry, conv, fbGain, droneG, humG, noiseBuf, soundOn = false;
  function makeIR(sec) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let y = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n, a = .85 - .7 * k;          // the tail gets darker
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = y * Math.pow(1 - k, 2.4);
      }
    }
    return b;
  }
  function initAudio() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    out = ac.createGain(); out.gain.value = soundOn ? .9 : 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = .004; comp.release.value = .3;
    comp.connect(out).connect(ac.destination);
    dry = ac.createGain(); dry.connect(comp);
    conv = ac.createConvolver(); conv.buffer = makeIR(3.8);
    const wet = ac.createGain(); wet.gain.value = .6; conv.connect(wet).connect(comp);
    // Lucier loop: the reverb feeds itself a little more with every phantom
    const fd = ac.createDelay(1); fd.delayTime.value = .13;
    const flp = ac.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 1500;
    fbGain = ac.createGain(); fbGain.gain.value = 0;
    conv.connect(fd); fd.connect(flp).connect(fbGain).connect(conv);

    const n = ac.sampleRate * 4; noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;

    // the room's real hum — the only sound that never stops
    humG = ac.createGain(); humG.gain.value = 0; humG.connect(dry);
    const hn = loopNoise(), hlp = ac.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 170; hlp.Q.value = .7;
    const hng = ac.createGain(); hng.gain.value = .07; hn.connect(hlp).connect(hng).connect(humG);
    [[60, .014], [120, .008], [180, .003]].forEach(([f, g]) => { const o = ac.createOscillator(); o.frequency.value = f; const og = ac.createGain(); og.gain.value = g; o.connect(og).connect(humG); o.start(); });

    // room modes that start to ring in stage 3
    droneG = ac.createGain(); droneG.gain.value = 0;
    const dn = loopNoise();
    [113, 169.5, 226, 339].forEach((f, i) => { const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 28; const g = ac.createGain(); g.gain.value = [1, .8, .7, .4][i]; dn.connect(bp).connect(g).connect(droneG); });
    const dd = ac.createGain(); dd.gain.value = .35; droneG.connect(dd).connect(dry);
    const dw = ac.createGain(); dw.gain.value = .8; droneG.connect(dw).connect(conv);
  }
  function loopNoise() { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random() * 3); return s; }
  function noise(t, dur) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random() * 3); s.stop(t + dur); return s; }
  function osc(type, f, t, dur) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t + dur); return o; }
  function filt(type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function gain(v) { const g = ac.createGain(); g.gain.value = v; return g; }
  function setSound(on) {
    soundOn = on;
    sndBtn.setAttribute('aria-pressed', on);
    sndBtn.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
    if (on) { initAudio(); if (ac && ac.state !== 'running') ac.resume(); }
    if (ac) out.gain.setTargetAtTime(on ? .9 : 0, ac.currentTime, .05);
  }
  function setTarget(param, v, tc) { if (ac) param.setTargetAtTime(v, ac.currentTime, tc); }

  // place a sound in the room: stereo position + low-pass by distance from the listener (centre)
  function place(u, v, o) {
    const s = toScreen(u, v);
    const pan = clamp((s.x - (R.x + R.w / 2)) / (R.w / 2) * .92, -1, 1);
    const d = clamp(dist({ u, v }, { u: .5, v: .5 }) / (A / 2), 0, 1.1);
    const inp = ac.createGain();
    const lp = filt('lowpass', Math.min(o.lpMax || 16000, 500 + 15000 * Math.pow(Math.max(0, 1 - d * .85), 1.6)), .5);
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const g = gain((o.gain ?? 1) / (1 + 1.2 * d));
    inp.connect(lp);
    if (p) { p.pan.value = pan; lp.connect(p).connect(g); } else lp.connect(g);
    g.connect(gain(o.dry ?? 1)).connect(dry);
    if (o.wet) g.connect(gain(o.wet)).connect(conv);
    return inp;
  }

  // ---- real sounds: dry, close, physical
  function creak(dst, t, base, dur, amp) {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const n = 24, f = new Float32Array(n), a = new Float32Array(n); let x = rand(18, 40);
    for (let i = 0; i < n; i++) { x = clamp(x + rand(-9, 9), 12, 60); f[i] = x; a[i] = rand(.25, 1); }
    o.frequency.setValueCurveAtTime(f, t, dur); o.start(t); o.stop(t + dur + .05);
    const jit = gain(0); jit.gain.setValueCurveAtTime(a, t, dur);
    const g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .06); g.gain.setValueAtTime(amp, t + dur - .1); g.gain.linearRampToValueAtTime(0, t + dur);
    [[base, 7, 3.2], [base * 2.37, 9, 2], [base * .52, 5, 1.4]].forEach(([fr, q, k]) => o.connect(filt('bandpass', fr, q)).connect(gain(k)).connect(jit));
    jit.connect(g).connect(dst);
  }
  const SND = {
    cym(dst, t) {           // a ride cymbal still settling
      const hp = filt('highpass', 5200), bp = filt('bandpass', 9000, .6), g = gain(0), tg = gain(.65);
      [205.3, 304.4, 369.6, 522.7, 540, 800].forEach(f => osc('square', f * 1.47, t, 3.3).connect(hp));
      hp.connect(bp).connect(g);
      noise(t, 3.3).connect(filt('highpass', 7000)).connect(gain(.6)).connect(g);
      const l = osc('sine', rand(3.6, 4.8), t, 3.3), lg = gain(.35); l.connect(lg).connect(tg.gain);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.075, t + .03); g.gain.exponentialRampToValueAtTime(.0004, t + 3.1);
      g.connect(tg).connect(dst);
    },
    stand(dst, t) { creak(dst, t, rand(880, 1050), .85, .5); },            // music stand creaks
    chair(dst, t) {                                                        // chair settles
      creak(dst, t, rand(420, 520), .5, .55);
      const o = osc('sine', 120, t + .42, .4), g = gain(0);
      o.frequency.setValueAtTime(120, t + .42); o.frequency.exponentialRampToValueAtTime(48, t + .7);
      g.gain.setValueAtTime(0, t + .42); g.gain.linearRampToValueAtTime(.55, t + .43); g.gain.exponentialRampToValueAtTime(.001, t + .75);
      o.connect(g).connect(dst);
      noise(t + .42, .05).connect(filt('bandpass', 900, 1.5)).connect(gain(.15)).connect(dst);
    },
    ac(dst, t) {                                                           // air conditioning clicks off
      const c = gain(0); noise(t, .02).connect(filt('highpass', 1500)).connect(c).connect(dst);
      c.gain.setValueAtTime(.5, t); c.gain.exponentialRampToValueAtTime(.001, t + .012);
      const lp = filt('lowpass', 2400, .7), g = gain(0);
      lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(110, t + 2.1);
      noise(t, 2.3).connect(lp).connect(g).connect(dst);
      g.gain.setValueAtTime(.16, t); g.gain.linearRampToValueAtTime(0, t + 2.2);
      const m = osc('sine', 118, t, 2), mg = gain(0);
      m.frequency.setValueAtTime(118, t); m.frequency.exponentialRampToValueAtTime(52, t + 1.9);
      mg.gain.setValueAtTime(.05, t); mg.gain.linearRampToValueAtTime(0, t + 1.9);
      m.connect(mg).connect(dst);
    }
  };
  // ---- phantoms: fragments of the session, wet and far
  function vowel(dst, t, f0, F) {
    const o = osc('sawtooth', f0, t, 2.1);
    o.frequency.setValueAtTime(f0 * .96, t); o.frequency.linearRampToValueAtTime(f0, t + .18);
    const vib = osc('sine', 5.3, t, 2.1), vg = gain(f0 * .013); vib.connect(vg).connect(o.frequency);
    const g = gain(0);
    F.forEach((f, i) => o.connect(filt('bandpass', f, [6, 9, 12][i])).connect(gain([2.2, 1.2, .45][i])).connect(g));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5, t + .24); g.gain.setValueAtTime(.42, t + .9); g.gain.linearRampToValueAtTime(0, t + 1.95);
    g.connect(dst);
  }
  function piano(dst, t, f, amp) {
    for (let k = 1; k <= 7; k++) {
      const o = osc('sine', f * k * Math.sqrt(1 + .0003 * k * k), t, 3.4), g = gain(0), dec = 3.2 / (1 + .4 * (k - 1));
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp / Math.pow(k, 1.25), t + .005); g.gain.exponentialRampToValueAtTime(.0003, t + dec);
      o.connect(g).connect(dst);
    }
  }
  // ---- the song from tonight's session: D minor, 76 BPM, i–VI–III–VII
  const BPM = 76, BEAT = 60 / BPM, BAR = BEAT * 4;
  const NOTE = { A3: 220, Bb3: 233.08, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440 };
  const MELODY = ['D4', 'F4', 'E4', 'D4', 'C4', 'D4', 'A3', 'C4', 'D4', 'F4', 'G4', 'F4', 'E4', 'D4', 'C4', 'D4'].map(n => NOTE[n]);
  const CHORDS = [[146.83, 174.61, 220], [116.54, 146.83, 174.61], [174.61, 220, 261.63], [130.81, 164.81, 196]]; // Dm Bb F C
  let songT0 = 0, melI = 0;
  const barNow = t => Math.max(0, Math.floor((t - songT0) / BAR)) % 4;
  const grid = (t, div) => songT0 + Math.ceil((t - songT0) / div - 1e-6) * div; // next grid line at or after t
  const FRAG = {
    ah(d, t) { vowel(d, t, MELODY[melI++ % MELODY.length], [800, 1150, 2900]); },
    oo(d, t) { vowel(d, t, MELODY[melI++ % MELODY.length], [350, 620, 2700]); },
    breath(d, t) {
      const g = gain(0); noise(t, .8).connect(filt('bandpass', 1300, .7)).connect(filt('highpass', 450)).connect(g).connect(d);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.45, t + .55); g.gain.linearRampToValueAtTime(0, t + .68);
    },
    piano(d, t) { piano(d, t, CHORDS[barNow(t)][2] * 2, .22); },
    chord(d, t) { const c = CHORDS[barNow(t)]; c.forEach((f, i) => piano(d, t + i * .05, f * 2, [.16, .13, .12][i])); },
    count(d, t) { // count-in: three sticks, and the downbeat never comes
      for (let i = 0; i < 3; i++) {
        const tt = t + i * BEAT, g = gain(0);
        noise(tt, .05).connect(filt('bandpass', 3200, 2.5)).connect(g).connect(d);
        g.gain.setValueAtTime(.7, tt); g.gain.exponentialRampToValueAtTime(.001, tt + .035);
        const o = osc('sine', 1900, tt, .03), og = gain(.08); o.connect(og).connect(d);
      }
    }
  };
  // which part of the song a phantom plays depends on how loud the room already is:
  // a few voices = the vocal line; more = piano; a crowded room = the count-in, the band
  const SEQ = [['ah', 'breath', 'oo', 'ah'], ['ah', 'piano', 'oo', 'chord', 'ah', 'piano'], ['ah', 'chord', 'oo', 'count', 'ah', 'piano', 'chord']];
  // a drummer that is not there, on the kit that is
  function kick(d, t) {
    const o = osc('sine', 110, t, .45), g = gain(0);
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9, t + .004); g.gain.exponentialRampToValueAtTime(.001, t + .42);
    o.connect(g).connect(d);
  }
  function hat(d, t, a) {
    const g = gain(0); noise(t, .06).connect(filt('highpass', 7500)).connect(g).connect(d);
    g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(.001, t + .045);
  }
  function snare(d, t) {
    const g = gain(0); noise(t, .22).connect(filt('bandpass', 1900, .8)).connect(g).connect(d);
    g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .2);
    const o = osc('triangle', 190, t, .12), og = gain(0); og.gain.setValueAtTime(.25, t); og.gain.exponentialRampToValueAtTime(.001, t + .1); o.connect(og).connect(d);
  }
  function bass(d, t, f) {
    const o = osc('triangle', f / 2, t, BEAT * 1.9), g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.5, t + .02); g.gain.setTargetAtTime(0, t + BEAT * 1.2, .15);
    o.connect(filt('lowpass', 500)).connect(g).connect(d);
  }
  function playReal(src) { if (!ac) return; const t = ac.currentTime + .01; SND[src.snd](place(src.u, src.v, { dry: 1, wet: .07 }), t); }
  function playFrag(name, u, v, wetter, t) {
    if (!ac) return;
    FRAG[name](place(u, v, { dry: wetter ? .1 : .22, wet: wetter ? 1.1 : .9, lpMax: 3200, gain: .9 }), t || ac.currentTime + .01);
  }

  // ------------------------------------------------------------------ state
  let state = 'title', gt = 0, stT = 0;   // game time, time in current state
  let take = 1, clock = 30, ruinedT = 0;
  let calIdx = 0, found = new Set(), cur = null, nextEmit = 0, emits = 0;
  let ghostsMade = 0, lastClick = 0, autoSpawn = 0, stageNext = -1;
  let seqI = 0, clean = 0, bestClean = 0, hintI = 0, fbClicks = 0, playStart = 0, endTime = 0;
  let nextStep = 0, stepI = 0;            // phantom band scheduler (8th notes)
  const rings = [], ghosts = [], pings = [];
  let lvl = .1, ghostFade = 1, playP = 0, wave = null;
  const kb = { u: .5, v: .5, on: false };
  const stageEl = $('#stage'), goalEl = $('#goal'), goalL = $('#goal-l'), goalV = $('#goal-v'), goalBar = $('#goal-bar');
  const interEl = $('#inter');
  const KIT = { u: .80, v: .25 }, PNO = { u: .22, v: .25 };
  const CLEAN_NEED = 10;

  function say(text, faint) {
    lineEl.textContent = text || '';
    lineEl.classList.toggle('show', !!text);
    lineEl.classList.toggle('faint', !!faint);
  }
  let interTimer = 0;
  function inter(n, h, p, phantom) {
    $('#inter-n').textContent = n; $('#inter-h').textContent = h; $('#inter-p').textContent = p;
    interEl.classList.toggle('ph', !!phantom);
    interEl.classList.add('show');
    clearTimeout(interTimer); interTimer = setTimeout(() => interEl.classList.remove('show'), reduce ? 3600 : 3000);
  }
  function setStage(n, name) { stageEl.innerHTML = n ? `<b>${n} / 03</b> · ${name}` : (name || ''); }
  function setGoal(label, value, frac, cls) {
    goalEl.hidden = !label; if (!label) return;
    goalL.textContent = label; goalV.textContent = value;
    goalBar.style.width = (clamp(frac, 0, 1) * 100).toFixed(1) + '%';
    goalEl.className = 'goal' + (cls ? ' ' + cls : '');
  }
  function go(s) {
    state = s; stT = 0;
    if (s === 'opening') {
      recEl.className = 'hud-rec on'; say('Click where you hear something.');
      setStage('', 'Room tone · 3:07 a.m.'); setGoal('');
      if (ac) setTarget(humG.gain, 1, .8);
    }
    if (s === 'calibrate') {
      calIdx = 0; cur = SRC[0]; nextEmit = 3.3; emits = 0;
      setStage('01', 'Calibrate');
      inter('01 / 03', 'Calibrate', 'Every sound in this room has a source. Find all four.');
      say('Click where you hear something.');
    }
    if (s === 'phantoms') {
      nextEmit = 3.2; seqI = 0;
      if (ac) { songT0 = ac.currentTime + 3.2; melI = 0; }
      setStage('02', 'Phantoms');
      inter('02 / 03', 'Phantoms', 'The band left an hour ago. Someone is still singing. Find them.', true);
      say('');
    }
    if (s === 'feedback') {
      lastClick = 0; autoSpawn = 0; hintI = 0; clean = 0; bestClean = 0; fbClicks = 0;
      ghosts.forEach(g => { g.next = rand(.3, 1.6); g.life = 1; });
      if (ac) { nextStep = grid(ac.currentTime + .5, BEAT / 2); stepI = Math.round((nextStep - songT0) / (BEAT / 2)); }
      setStage('03', 'Feedback');
      inter('03 / 03', 'Get a clean take', 'Ten seconds of the empty room. No voices, no song. Then you can go home.', true);
      say('');
    }
    if (s === 'ending') {
      endTime = gt;
      recEl.className = 'hud-rec clean'; say('');
      setStage('', 'Clean take');
      setGoal('Clean', CLEAN_NEED.toFixed(1) + ' / ' + CLEAN_NEED.toFixed(1) + ' s', 1, 'done');
      takeEl.textContent = 'Take ' + take + ' · clean';
      if (ac) { setTarget(droneG.gain, 0, .8); setTarget(fbGain.gain, 0, .6); }
      wave = Array.from({ length: 360 }, (_, i) => { let s = 0; for (let k = 0; k < 4; k++) s += Math.random(); return (s / 4 - .5) * (.6 + .4 * Math.sin(i * .05)); });
    }
    if (s === 'credits') {
      creditsEl.hidden = false; creditsEl.classList.add('out');
      creditsEl.querySelector('#c-take').textContent = 'Take ' + take + ' · clean';
      $('#s-ph').textContent = ghostsMade;
      $('#s-take').textContent = take - 1;
      const secs = Math.round(endTime - playStart); $('#s-time').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
      setStage(''); setGoal('');
      requestAnimationFrame(() => creditsEl.classList.remove('out'));
      setTimeout(() => $('#again').focus({ preventScroll: true }), 900);
    }
  }
  function reset() {
    rings.length = ghosts.length = pings.length = 0; found = new Set();
    take = 1; clock = 30; ghostsMade = 0; ghostFade = 1; playP = 0; kb.on = false; stageNext = -1; calIdx = 0; cur = null; lastPhAudio = -1;
    playStart = gt;
    recEl.querySelector('i').style.animationDuration = '';
    takeEl.textContent = 'Take 1';
    if (ac) { humG.gain.setValueAtTime(1, ac.currentTime); droneG.gain.setValueAtTime(0, ac.currentTime); fbGain.gain.setValueAtTime(0, ac.currentTime); }
    creditsEl.hidden = true;
    go('opening');
  }
  function start(withSound) {
    setSound(withSound);
    if (!ac) { initAudio(); if (ac) out.gain.value = soundOn ? .9 : 0; }
    if (ac && ac.state !== 'running') ac.resume();
    [titleEl, checkEl].forEach(el => { if (!el.hidden) { el.classList.add('out'); setTimeout(() => { el.hidden = true; }, 900); } });
    cv.focus({ preventScroll: true });
    reset();
    const jump = Q.get('stage'); // testing shortcut: ?stage=phantoms|feedback|ending
    if (jump === 'phantoms' || jump === 'feedback' || jump === 'ending') {
      SRC.forEach(s => found.add(s.id));
      if (ac) songT0 = ac.currentTime;
      if (jump !== 'phantoms') for (let i = 0; i < 3; i++) addGhost(freeFloor());
      go(jump);
    }
  }

  // ---- sound check: one tone left, one right (classmate feedback)
  const checkEl = $('#check');
  function beep(pan, t) {
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null, g = gain(0);
    const o = osc('sine', 1000, t, .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .01); g.gain.setValueAtTime(.18, t + .4); g.gain.linearRampToValueAtTime(0, t + .48);
    if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(dry); } else o.connect(g).connect(dry);
  }
  let checkTimers = [];
  function runCheck() {
    if (!ac) return;
    if (ac.state !== 'running') ac.resume();
    checkTimers.forEach(clearTimeout); checkTimers = [];
    const L = $('#k-l'), Rr = $('#k-r'), t = ac.currentTime + .15;
    beep(-1, t); beep(1, t + .9);
    checkTimers.push(setTimeout(() => L.classList.add('on'), 150), setTimeout(() => L.classList.remove('on'), 650),
      setTimeout(() => Rr.classList.add('on'), 1050), setTimeout(() => Rr.classList.remove('on'), 1550));
  }
  function openCheck() {
    setSound(true);
    titleEl.classList.add('out'); setTimeout(() => { titleEl.hidden = true; }, 900);
    checkEl.hidden = false; checkEl.classList.add('out');
    requestAnimationFrame(() => checkEl.classList.remove('out'));
    setTimeout(runCheck, 350);
    setTimeout(() => $('#k-go').focus({ preventScroll: true }), 400);
  }

  function addRing(u, v, kind, o = {}) { rings.push({ u, v, kind, t: o.delay ? -o.delay : 0, born: gt, str: o.str || 1, big: !!o.big, small: !!o.small }); }
  function addGhost(p) { const g = { u: p.u, v: p.v, life: 1, born: gt, next: rand(.5, 2), jx: 0, jy: 0, decay: rand(4, 9) }; ghosts.push(g); ghostsMade++; return g; }
  let lastPhAudio = -1;
  const loudness = () => ghosts.reduce((s, g) => s + g.life, 0);
  function emitPhantom(u, v, wetter) {
    const n = loudness(), layer = n < 4 ? 0 : n < 9 ? 1 : 2, seq = SEQ[layer];
    let name = seq[seqI++ % seq.length];
    // quantize to the song's grid so the phantoms play in time with each other
    let t = 0, delay = reduce ? 0 : .5;
    if (ac) {
      const now = ac.currentTime + .02;
      t = name === 'count' ? grid(now, BAR) : grid(now, state === 'feedback' ? BEAT / 2 : BEAT);
      if (!reduce) delay = (t - ac.currentTime) + .3;
    }
    // cap the voice count: in a crowded room only some phantoms get a new sound, all of them still ring
    if (gt - lastPhAudio > (ghosts.length > 12 ? .28 : .14)) { playFrag(name, u, v, wetter, t); lastPhAudio = gt; }
    addRing(u, v, 'ph', { delay });
  }
  // the band that is not there: kit, then bass from the piano, louder as the room gets louder
  function bandStep(i, t) {
    const n = loudness(), pos = i % 8, delay = reduce ? 0 : Math.max(0, t - ac.currentTime) + .25;
    if (n >= 5 && (pos === 0 || pos === 4 || (n >= 11 && pos === 5))) {
      kick(place(KIT.u, KIT.v, { dry: .25, wet: .8, lpMax: 2600, gain: .7 }), t); addRing(KIT.u, KIT.v, 'ph', { delay, small: true });
    }
    if (n >= 8 && (pos === 2 || pos === 6)) snare(place(KIT.u - .05, KIT.v + .05, { dry: .2, wet: .9, lpMax: 3000, gain: .6 }), t);
    if (n >= 11) hat(place(.835, .155, { dry: .2, wet: .7, lpMax: 4000, gain: .5 }), t, pos % 2 ? .12 : .22);
    if (n >= 14 && (pos === 0 || pos === 4)) { bass(place(PNO.u, PNO.v, { dry: .3, wet: .7, lpMax: 1200, gain: .8 }), t, CHORDS[barNow(t)][0]); if (pos === 0) addRing(PNO.u, PNO.v, 'ph', { delay, small: true }); }
  }

  // ------------------------------------------------------------------ input
  function click(u, v) {
    if (!['opening', 'calibrate', 'phantoms', 'feedback'].includes(state)) return;
    if (ac && ac.state !== 'running') ac.resume();
    const p = { u, v };
    if (u < -.05 || u > 1.05 || v < -.05 || v > 1.05) return;

    if (state === 'opening' || state === 'calibrate') {
      if (state === 'calibrate' && cur && emits > 0 && dist(p, cur) < .11) {
        found.add(cur.id);
        addRing(cur.u, cur.v, 'real', { big: true, str: 1.4 });
        if (calIdx === 0) say('Found it. That one is real.');
        else if (calIdx === 1) say('');
        calIdx++; emits = 0;
        if (calIdx >= SRC.length) { cur = null; stageNext = gt + 2.6; say('Four sources. The room is calibrated.'); }
        else { cur = SRC[calIdx]; nextEmit = stT + 2.4; }
      } else {
        pings.push({ u, v, t: 0 });
        if (state === 'calibrate' && emits > 0 && calIdx === 0) say('Nothing there. Listen again — left or right? near or far?', true);
      }
      return;
    }

    if (state === 'phantoms') {
      const hit = rings.filter(r => r.kind === 'ph' && !r.small && gt - r.born < 5.5 && dist(p, r) < .14).sort((a, b) => dist(p, a) - dist(p, b))[0];
      if (hit && !ghosts.some(g => dist(g, hit) < .05)) {
        addGhost({ u: hit.u + rand(-.01, .01), v: hit.v + rand(-.015, .015) });
        addRing(hit.u, hit.v, 'ph', { big: true });
        playFrag('breath', hit.u, hit.v, true);
        say(['There is no one there. Only an outline.', 'Another one. Empty floor.', 'The song from tonight. It is still playing.'][Math.min(2, ghostsMade - 1)], ghostsMade < 3);
        if (ghostsMade >= 3) stageNext = gt + 2.2;
      } else {
        const realHit = SRC.find(s => dist(p, s) < .08);
        if (realHit) addRing(realHit.u, realHit.v, 'real', { str: .5 }); else pings.push({ u, v, t: 0 });
      }
      return;
    }

    if (state === 'feedback') {
      lastClick = stT; fbClicks++;
      take++; clock = 30; ruinedT = .45; clean = 0;   // any click is a sound on the take
      ghosts.forEach(g => { g.life = 1; });
      const near = ghosts.find(g => dist(p, g) < .1) || rings.find(r => r.kind === 'ph' && gt - r.born < 2.5 && dist(p, r) < .12);
      const realHit = SRC.find(s => dist(p, s) < .07);
      if (near) {                       // attention feeds the phantom: two more
        addRing(near.u, near.v, 'ph', { big: true });
        for (let i = 0; i < 2 && ghosts.length < 40; i++) { const g = addGhost(freeFloor(near, .6)); g.next = rand(.2, .9); }
        if (ac) playFrag(pick(['ah', 'oo', 'chord']), near.u, near.v, true, grid(ac.currentTime + .02, BEAT / 2));
      } else if (realHit) {
        addRing(realHit.u, realHit.v, 'real', { str: .6 });
      } else if (ghosts.length < 40) {  // pointing at nothing creates something
        const g = addGhost(p); g.next = rand(.3, 1); addRing(u, v, 'ph');
      }
    }
  }
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    kb.on = false;
    const q = fromScreen(e.clientX, e.clientY);
    click(q.u, q.v);
  });
  cv.addEventListener('keydown', e => {
    const k = e.key, step = e.shiftKey ? .06 : .025;
    if (k.startsWith('Arrow')) {
      e.preventDefault(); kb.on = true;
      // arrows follow the screen, so swap axes when the room is turned in portrait
      let du = 0, dv = 0;
      if (k === 'ArrowLeft') R.portrait ? dv = step : du = -step;
      if (k === 'ArrowRight') R.portrait ? dv = -step : du = step;
      if (k === 'ArrowUp') R.portrait ? du = -step : dv = -step;
      if (k === 'ArrowDown') R.portrait ? du = step : dv = step;
      kb.u = clamp(kb.u + du / A, .02, .98); kb.v = clamp(kb.v + dv, .03, .97);
    } else if (k === 'Enter' || k === ' ') { e.preventDefault(); kb.on = true; click(kb.u, kb.v); }
  });
  $('#go-snd').addEventListener('click', openCheck);
  $('#go-mute').addEventListener('click', () => start(false));
  $('#k-go').addEventListener('click', () => start(true));
  $('#k-again').addEventListener('click', runCheck);
  $('#again').addEventListener('click', () => { cv.focus({ preventScroll: true }); reset(); });
  sndBtn.addEventListener('click', () => setSound(!soundOn));
  addEventListener('resize', layout);

  // ------------------------------------------------------------------ update
  const HINTS = [
    [22, 'Every click is a sound on the take.'],
    [38, 'The song only plays while you listen for it.'],
    [55, 'Hold still.']
  ];
  function update(dt) {
    gt += dt; stT += dt;
    if (stageNext > 0 && gt >= stageNext) { stageNext = -1; go(state === 'calibrate' ? 'phantoms' : state === 'phantoms' ? 'feedback' : state); }

    const recording = ['opening', 'calibrate', 'phantoms', 'feedback'].includes(state);
    if (recording) { clock -= dt; if (clock <= 0) { take++; clock = 30; } }
    if (ruinedT > 0) ruinedT -= dt;

    if (state === 'opening' && stT >= 3) go('calibrate');

    if (state === 'calibrate') {
      if (cur && stT >= nextEmit) {
        playReal(cur); emits++;
        addRing(cur.u, cur.v, 'real', { delay: reduce ? 0 : .4, str: emits > 3 ? 1.6 : 1 });
        nextEmit = stT + rand(3.1, 4.1);
      }
      setGoal('Sources', found.size + ' / 4', found.size / 4);
    }

    if (state === 'phantoms') {
      if (stT >= nextEmit && ghostsMade < 3) {
        const last = rings.filter(r => r.kind === 'ph').pop();
        let p; for (let i = 0; i < 6; i++) { p = freeFloor(); if (!last || dist(p, last) > .3) break; }
        emitPhantom(p.u, p.v, false);
        nextEmit = stT + (ac ? BEAT * pick([4, 5, 6]) : rand(3.4, 4.6));
      }
      setGoal('Voices found', Math.min(3, ghostsMade) + ' / 3', Math.min(3, ghostsMade) / 3);
      if (stT > 16 && ghostsMade === 0 && !lineEl.classList.contains('show')) say('Pink means no source. Click where the voice was.', true);
    }

    if (state === 'feedback') {
      const idle = stT - lastClick;
      // the room gets louder on its own at first
      if (autoSpawn < 2 && stT > 4 + autoSpawn * 4.5) { autoSpawn++; const g = addGhost(freeFloor(pick(ghosts), .4)); g.next = .3; }
      for (const g of ghosts) {
        g.next -= dt;
        if (g.next <= 0) {
          emitPhantom(g.u, g.v, ghosts.length > 6);
          const n = ghosts.length; g.next = clamp(5.5 - .2 * n, 1.1, 5.5) * rand(.7, 1.35) * (1 + Math.max(0, idle - 2) * .4);
        }
        if (idle > 2.5) g.life -= dt / g.decay;
      }
      for (let i = ghosts.length - 1; i >= 0; i--) if (ghosts[i].life <= 0) ghosts.splice(i, 1);
      const n = loudness();
      if (ac) {
        setTarget(droneG.gain, Math.min(7, n * .45), .4); setTarget(fbGain.gain, Math.min(.34, n * .022), .4);
        while (nextStep < ac.currentTime + .12) { bandStep(stepI++, nextStep); nextStep += BEAT / 2; }
      }
      // the goal: ten clean seconds. It only counts up while the player does nothing.
      clean = clamp(Math.min(idle, stT - 6), 0, CLEAN_NEED);
      bestClean = Math.max(bestClean, clean);
      setGoal('Clean', clean.toFixed(1) + ' / ' + CLEAN_NEED.toFixed(1) + ' s', clean / CLEAN_NEED, ruinedT > 0 ? 'reset' : '');
      // hints, only for players who have not found stillness yet
      if (hintI < HINTS.length && stT > HINTS[hintI][0] && bestClean < 6) { say(HINTS[hintI][1], hintI === 2); hintI++; }
      if (clean > 3 && lineEl.classList.contains('show') && hintI < 3) say('');
      // the REC light slows down for players who never stop
      const slow = clamp((stT - 30) / 40, 0, 1);
      recEl.querySelector('i').style.animationDuration = (1.6 + slow * 3.4) + 's';
      if (clean >= CLEAN_NEED) go('ending');
    }

    if (state === 'ending') {
      ghostFade = Math.max(0, 1 - stT / 3);
      if (stT > 3.5) {
        playP = clamp((stT - 3.5) / 12, 0, 1);
        if (ac && stT - dt <= 3.5) setTarget(humG.gain, 1.45, .6);
        clock = playP * 12;
      }
      if (stT > 16.5) go('credits');
    }

    // rings, pings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (r.kind === 'ph' && !reduce) { r.acc = (r.acc || 0) + dt; if (r.acc >= 1 / 12) { r.t += r.acc; r.acc = 0; } }
      else r.t += dt;
      if (r.t > (r.kind === 'ph' ? 2.8 : 1.8)) rings.splice(i, 1);
    }
    for (let i = pings.length - 1; i >= 0; i--) { pings[i].t += dt; if (pings[i].t > .9) pings.splice(i, 1); }

    // level meter (from game state, so it works with sound off too)
    let target = .12;
    for (const r of rings) if (r.t > 0) target += r.kind === 'real' ? .32 * Math.max(0, 1 - r.t / 1.2) : (r.small ? .1 : .22) * Math.max(0, 1 - r.t / 2);
    if (state === 'feedback') target += loudness() * .032;
    if (state === 'ending' || state === 'credits') target = .1 + (playP > 0 && playP < 1 ? .04 * Math.random() : 0);
    target = clamp(target, 0, 1);
    lvl += (target - lvl) * (target > lvl ? .45 : .05);
  }

  // ------------------------------------------------------------------ draw
  let lastHud = '';
  function hud() {
    const s = Math.max(0, Math.ceil(clock - 1e-6));
    const txt = state === 'ending' ? (playP > 0 ? '▶ 00:' + String(Math.floor(clock)).padStart(2, '0') : '00:30') : '00:' + String(s).padStart(2, '0');
    if (txt !== lastHud) { clockEl.textContent = txt; lastHud = txt; }
    if (state !== 'ending' && state !== 'credits' && state !== 'title') takeEl.textContent = 'Take ' + take;
    recEl.classList.toggle('ruined', ruinedT > 0);
    meterBar.style.height = (lvl * 100).toFixed(1) + '%';
    meterEl.classList.toggle('hot', lvl > .58);
  }

  let jitT = 0;
  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (R.portrait) { ctx.translate(R.x + R.w, R.y); ctx.rotate(Math.PI / 2); } else ctx.translate(R.x, R.y);
    const L = R.L, S = R.S, lw = Math.max(1, S / 620);
    const X = u => u * L, Y = v => v * S;
    const ending = state === 'ending' || state === 'credits';
    const roomA = state === 'title' ? .55 : state === 'credits' ? .3 : state === 'ending' ? Math.max(.35, 1 - stT / 4) : 1;

    // ---- plan
    ctx.globalAlpha = roomA; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const dS = .56, dE = .70;
    ctx.strokeStyle = C.obj; ctx.lineWidth = lw * 1.8;
    ctx.beginPath(); ctx.moveTo(0, Y(dE)); ctx.lineTo(0, S); ctx.lineTo(L, S); ctx.lineTo(L, 0); ctx.lineTo(X(.62), 0); ctx.moveTo(X(.40), 0); ctx.lineTo(0, 0); ctx.lineTo(0, Y(dS)); ctx.stroke();
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(X(.40), -3 * lw); ctx.lineTo(X(.62), -3 * lw); ctx.moveTo(X(.40), 3 * lw); ctx.lineTo(X(.62), 3 * lw); ctx.stroke(); // control-room glass
    ctx.strokeStyle = C.line; ctx.setLineDash([3 * lw, 4 * lw]);
    const dl = Y(dE) - Y(dS);
    ctx.beginPath(); ctx.arc(0, Y(dE), dl, -Math.PI / 2, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C.obj; ctx.beginPath(); ctx.moveTo(0, Y(dE)); ctx.lineTo(dl, Y(dE)); ctx.stroke();
    ctx.strokeStyle = C.line; ctx.setLineDash([2 * lw, 5 * lw]); ctx.strokeRect(X(.62), Y(.06), X(.35), Y(.40)); ctx.setLineDash([]); // drum rug

    ctx.strokeStyle = C.obj;
    // grand piano, keyboard to the left
    ctx.beginPath();
    ctx.moveTo(X(.085), Y(.12)); ctx.lineTo(X(.35), Y(.12));
    ctx.bezierCurveTo(X(.385), Y(.12), X(.37), Y(.26), X(.30), Y(.29));
    ctx.bezierCurveTo(X(.24), Y(.32), X(.20), Y(.33), X(.17), Y(.41));
    ctx.lineTo(X(.085), Y(.41)); ctx.closePath(); ctx.stroke();
    ctx.strokeRect(X(.07), Y(.14), X(.015), Y(.25));
    for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(X(.07), Y(.14 + i * .025)); ctx.lineTo(X(.085), Y(.14 + i * .025)); ctx.stroke(); }
    ctx.setLineDash([2 * lw, 4 * lw]); ctx.beginPath(); ctx.moveTo(X(.095), Y(.13)); ctx.lineTo(X(.30), Y(.27)); ctx.stroke(); ctx.setLineDash([]); // lid prop line
    ctx.strokeRect(X(.03), Y(.21), X(.022), Y(.12)); // bench
    // drum kit
    const circ = (u, v, r) => { ctx.beginPath(); ctx.arc(X(u), Y(v), r * S, 0, Math.PI * 2); ctx.stroke(); };
    circ(.80, .25, .06); circ(.73, .335, .033); circ(.765, .155, .028); circ(.835, .155, .028); circ(.87, .335, .04);
    circ(.685, .26, .03); circ(.70, .12, .045); circ(.79, .41, .022);
    // the ride: real source 01
    ctx.strokeStyle = found.has('cym') ? C.real : C.obj; circ(.905, .215, .05); ctx.beginPath(); ctx.arc(X(.905), Y(.215), .006 * S, 0, 7); ctx.stroke();
    ctx.strokeStyle = C.obj;
    // vocal mic on a boom
    micGlyph(X(MIC.u), Y(MIC.v), S, C.obj, false);
    // music stand: real source 04
    ctx.strokeStyle = found.has('stand') ? C.real : C.obj;
    ctx.beginPath(); ctx.moveTo(X(.345), Y(.60)); ctx.lineTo(X(.395), Y(.585)); ctx.stroke();
    circ(.37, .62, .014); ctx.beginPath(); ctx.moveTo(X(.37), Y(.62)); ctx.lineTo(X(.37), Y(.597)); ctx.stroke();
    // second stand (never makes a sound)
    ctx.strokeStyle = C.obj;
    ctx.beginPath(); ctx.moveTo(X(.205), Y(.555)); ctx.lineTo(X(.25), Y(.57)); ctx.stroke(); circ(.228, .585, .013);
    // chair: real source 02
    ctx.strokeStyle = found.has('chair') ? C.real : C.obj;
    ctx.strokeRect(X(.135) - .03 * S, Y(.79) - .03 * S, .06 * S, .06 * S);
    ctx.beginPath(); ctx.moveTo(X(.135) - .03 * S, Y(.79) + .042 * S); ctx.lineTo(X(.135) + .03 * S, Y(.79) + .042 * S); ctx.stroke();
    // AC vent: real source 03
    ctx.strokeStyle = found.has('ac') ? C.real : C.obj;
    ctx.strokeRect(X(.53), Y(.955), X(.11), Y(.035));
    for (let i = 1; i < 8; i++) { ctx.beginPath(); ctx.moveTo(X(.53 + i * .11 / 8), Y(.958)); ctx.lineTo(X(.53 + i * .11 / 8), Y(.987)); ctx.stroke(); }
    // wall box + cables
    ctx.strokeStyle = C.obj; ctx.strokeRect(X(.975), Y(.67), X(.02), Y(.06));
    ctx.strokeStyle = C.line; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(X(MIC.u), Y(MIC.v)); ctx.bezierCurveTo(X(.62), Y(.86), X(.86), Y(.62), X(.975), Y(.69)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(.80), Y(.31)); ctx.bezierCurveTo(X(.86), Y(.55), X(.93), Y(.60), X(.975), Y(.71)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(.30), Y(.29)); ctx.bezierCurveTo(X(.48), Y(.36), X(.60), Y(.48), X(.975), Y(.70)); ctx.stroke();
    // labels, like a session sketch
    ctx.fillStyle = C.dim; ctx.font = `500 ${Math.max(9, S * .02)}px "IBM Plex Mono", monospace`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText('PNO', X(.11), Y(.385)); ctx.fillText('KIT', X(.64), Y(.44)); ctx.fillText('VOX', X(MIC.u) + .03 * S, Y(MIC.v) + .045 * S);
    ctx.fillText('AC', X(.655), Y(.985)); ctx.fillText('CONTROL ROOM', X(.42), -9 * lw);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.globalAlpha = 1;

    // ---- phantom mics (12 fps stutter)
    jitT += dt; const step = jitT > 1 / 12; if (step) jitT = 0;
    for (const g of ghosts) {
      if (step && !reduce) { g.jx = rand(-1, 1) * .003 * S; g.jy = rand(-1, 1) * .003 * S; }
      const born = clamp((gt - g.born) / .4, 0, 1);
      ctx.globalAlpha = clamp(g.life, 0, 1) * ghostFade * (reduce ? born : (born > .5 ? 1 : (Math.floor(gt * 12) % 2 ? .3 : .8)));
      micGlyph(X(g.u) + g.jx, Y(g.v) + g.jy, S, C.ph, true);
    }
    ctx.globalAlpha = 1;

    // ---- rings
    for (const r of rings) {
      if (r.t <= 0) continue;
      const x = X(r.u), y = Y(r.v);
      if (r.kind === 'real') {
        const life = 1.8, a = Math.max(0, 1 - r.t / life) * (r.big ? 1 : .55) * Math.min(1.4, r.str);
        ctx.strokeStyle = C.real; ctx.lineWidth = lw * (r.big ? 2 : 1.2);
        for (let k = 0; k < (r.big ? 2 : 3); k++) {
          ctx.globalAlpha = clamp(a - k * .22, 0, 1);
          ctx.beginPath(); ctx.arc(x, y, (r.big ? .03 + r.t * .16 : .02 + r.t * .085) * S + k * .03 * S, 0, Math.PI * 2); ctx.stroke();
        }
      } else {
        const life = 2.8, a = Math.max(0, 1 - r.t / life) * (r.big ? .95 : r.small ? .38 : .5) * ghostFade, sc = r.small ? .55 : 1;
        ctx.strokeStyle = C.ph; ctx.lineWidth = lw * (r.big ? 1.8 : 1.1); ctx.setLineDash([4 * lw, 5 * lw]);
        for (let k = 0; k < 3; k++) {
          ctx.globalAlpha = clamp(a - k * .2, 0, 1);
          ctx.beginPath(); ctx.arc(x, y, ((.02 + r.t * .07) * S + k * .035 * S) * sc, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1; ctx.lineWidth = lw;
    // ---- misses: nothing here
    for (const p of pings) {
      const a = 1 - p.t / .9, x = X(p.u), y = Y(p.v), r = .012 * S;
      ctx.globalAlpha = a * .7; ctx.strokeStyle = C.obj;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r * (1.4 + p.t * 1.5), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // ---- keyboard cursor
    if (kb.on && !ending && state !== 'title') {
      const x = X(kb.u), y = Y(kb.v), r = .02 * S; ctx.strokeStyle = C.ink; ctx.globalAlpha = .8;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * .35, y); ctx.moveTo(x + r * .35, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y - r * .35); ctx.moveTo(x, y + r * .35); ctx.lineTo(x, y + r); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // ---- playback of the clean take
    if (state === 'ending' && wave && stT > 3.2) {
      const a = clamp((stT - 3.2) / .8, 0, 1), x0 = X(.08), x1 = X(.92), y0 = Y(.5), amp = .05 * S, n = wave.length;
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(7,9,12,.75)'; ctx.fillRect(x0 - .03 * S, y0 - amp * 2.6, x1 - x0 + .06 * S, amp * 5.2);
      const px = x0 + (x1 - x0) * playP;
      for (const [col, from, to] of [[C.ink, 0, playP], [C.line, playP, 1]]) {
        ctx.strokeStyle = col; ctx.beginPath();
        for (let i = Math.floor(from * (n - 1)); i <= Math.ceil(to * (n - 1)); i++) { const x = x0 + (x1 - x0) * i / (n - 1); ctx.moveTo(x, y0 - wave[i] * amp); ctx.lineTo(x, y0 + wave[i] * amp); }
        ctx.stroke();
      }
      ctx.strokeStyle = C.real; ctx.lineWidth = lw * 1.5; ctx.beginPath(); ctx.moveTo(px, y0 - amp * 2); ctx.lineTo(px, y0 + amp * 2); ctx.stroke();
      ctx.fillStyle = C.real; ctx.font = `500 ${Math.max(10, S * .022)}px "IBM Plex Mono", monospace`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillText('PLAYBACK · TAKE ' + take + ' · ROOM TONE', x0, y0 - amp * 2.6 - .02 * S);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
  function micGlyph(x, y, S, col, dashed) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, S / 620) * (dashed ? 1.3 : 1);
    if (dashed) ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, .022 * S, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + .05 * S, y - .032 * S); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + .056 * S, y - .036 * S, .009 * S, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ------------------------------------------------------------------ loop
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000) * SPEED; last = now;
    if (state !== 'title') update(dt);
    draw(dt); hud();
    requestAnimationFrame(frame);
  }
  layout();
  requestAnimationFrame(frame);

  // test hooks (used for automated playtests; harmless for players)
  window.RT = {
    get state() { return state; },
    get info() { return { state, stT: +stT.toFixed(2), clean: +clean.toFixed(2), loud: +loudness().toFixed(1), take, found: [...found], cur: cur && cur.id, emits, ghosts: ghosts.length, ghostsMade, lvl: +lvl.toFixed(2) }; },
    click, start,
    recentPhantom: () => { const r = rings.filter(r => r.kind === 'ph').pop(); return r && { u: r.u, v: r.v }; },
    ghost: () => ghosts[0] && { u: ghosts[0].u, v: ghosts[0].v },
    ghosts: () => ghosts.map(g => ({ u: g.u, v: g.v })),
    current: () => cur && { u: cur.u, v: cur.v },
    toScreen
  };
})();
