// Room Tone — interactive preview on the proposal page
(() => {
  const hero = document.getElementById('hero');
  if (!hero) return;
  const cv = hero.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const btn = document.getElementById('snd');
  const clock = document.getElementById('clock');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C = { line: '#2a3340', obj: '#6f7b8c', real: '#8fc2ff', ph: '#ff3d7f', ink: '#dcebff' };

  let W = 0, H = 0, dpr = 1;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', size); size();

  // room objects in normalised coordinates
  const objs = [
    { k: 'piano', x: .22, y: .34, w: .2, h: .16, f: 220 },
    { k: 'kick', x: .72, y: .32, r: .05, f: 70 },
    { k: 'cym', x: .82, y: .22, r: .035, f: 3200 },
    { k: 'mic', x: .5, y: .7, r: .018, f: 900 },
    { k: 'stand', x: .3, y: .74, r: .022, f: 1400 }
  ];
  const rings = []; // {x,y,t,ph,hit}
  const ghosts = []; // outlines the player "found" in empty space

  // ---------- audio ----------
  let ac = null, rev = null, on = false;
  function initAudio() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    const len = ac.sampleRate * 2.6, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    rev = ac.createConvolver(); rev.buffer = ir;
    const g = ac.createGain(); g.gain.value = .5; rev.connect(g).connect(ac.destination);
  }
  function play(x, y, f, ph) {
    if (!on || !ac) return;
    const t = ac.currentTime, pan = ac.createStereoPanner(), lp = ac.createBiquadFilter(), g = ac.createGain();
    pan.pan.value = Math.max(-1, Math.min(1, x * 2 - 1));
    lp.type = 'lowpass'; lp.frequency.value = ph ? 900 : 6000 - y * 3000;
    const o = ac.createOscillator(); o.type = ph ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(f, t); if (!ph) o.frequency.exponentialRampToValueAtTime(f * .7, t + .4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ph ? .09 : .16, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + (ph ? 1.6 : .5));
    o.connect(lp).connect(g).connect(pan);
    if (ph) pan.connect(rev); else pan.connect(ac.destination);
    o.start(t); o.stop(t + 1.8);
  }
  btn.addEventListener('click', () => {
    initAudio(); on = !on; if (on) ac.resume();
    btn.setAttribute('aria-pressed', on); btn.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
  });

  // ---------- events ----------
  let n = 0;
  function emit() {
    n++;
    const ph = n > 2 && Math.random() < .5;
    let x, y, f;
    if (ph) { x = .1 + Math.random() * .8; y = .15 + Math.random() * .7; f = [262, 330, 392, 523][n % 4]; }
    else { const o = objs[Math.floor(Math.random() * objs.length)]; x = o.x + (o.w ? o.w / 2 : 0); y = o.y + (o.h ? o.h / 2 : 0); f = o.f; }
    rings.push({ x, y, t: 0, ph, hit: false });
    play(x, y, f, ph);
    setTimeout(emit, 1800 + Math.random() * 2200);
  }
  setTimeout(emit, 900);

  function click(px, py) {
    initAudio();
    const x = px / W, y = py / H;
    let best = null, bd = .08;
    for (const r of rings) { const d = Math.hypot(r.x - x, (r.y - y) * H / W); if (r.t < 2.2 && d < bd) { bd = d; best = r; } }
    if (best) { best.hit = true; if (best.ph) ghosts.push({ x: best.x, y: best.y, a: 1 }); }
    else { ghosts.push({ x, y, a: 1 }); rings.push({ x, y, t: 0, ph: true, hit: true }); play(x, y, 196, true); }
    hero.classList.add('used');
  }
  cv.addEventListener('pointerdown', e => { const b = cv.getBoundingClientRect(); click(e.clientX - b.left, e.clientY - b.top); });
  cv.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click(W / 2, H / 2); } });

  // ---------- draw ----------
  function room() {
    const m = 28;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(W - m, H * .45); ctx.lineTo(W - m, H * .65); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = C.obj;
    for (const o of objs) {
      ctx.beginPath();
      if (o.w) ctx.rect(o.x * W, o.y * H, o.w * W, o.h * H);
      else ctx.arc(o.x * W, o.y * H, o.r * Math.min(W, H) * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(objs[3].x * W, objs[3].y * H); ctx.quadraticCurveTo(W * .62, H * .9, W - m, H * .82); ctx.stroke();
  }
  let last = performance.now(), phTick = 0, start = last;
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now; phTick += dt;
    const phStep = phTick > 1 / 12; if (phStep) phTick = 0;
    ctx.clearRect(0, 0, W, H); room();
    for (const g of ghosts) {
      g.a *= .995;
      ctx.globalAlpha = g.a * .9; ctx.strokeStyle = C.ph; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(g.x * W, g.y * H, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g.x * W - 6, g.y * H); ctx.lineTo(g.x * W + 6, g.y * H); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (!r.ph || phStep || reduce) r.t += r.ph ? (reduce ? dt : 1 / 12) : dt;
      if (r.t > 3) { rings.splice(i, 1); continue; }
      const a = 1 - r.t / 3;
      ctx.strokeStyle = r.ph ? C.ph : C.real; ctx.lineWidth = r.hit ? 2 : 1.2;
      if (r.ph) ctx.setLineDash([5, 5]);
      for (let k = 0; k < 3; k++) {
        const rr = (r.t * 46 + k * 16);
        ctx.globalAlpha = Math.max(0, a - k * .25);
        ctx.beginPath(); ctx.arc(r.x * W, r.y * H, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    while (ghosts.length > 24) ghosts.shift();
    const s = 30 - Math.floor(((now - start) / 1000) % 31);
    clock.textContent = '00:' + String(s).padStart(2, '0');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
