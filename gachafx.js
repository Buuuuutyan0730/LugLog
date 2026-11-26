// ガチャの演出（ほかの演出とは別に作る）
//   光の線が画面を走って軌跡を描き、中央へ巻き取られて光の玉になる → 玉の色でレア度の予感
//   → ときどき玉にひびが入り、上のレア度の色の光がもれ出して色が変わる（昇格）→ 玉が割れて品が出る
//   10回引きは玉が10個並び、順に割れる（SR以上は少しためてから大きく割れる）。「まとめて開ける」で残りを一度に
import { gachaCell } from './screens.js?v=20261126181944';
import { snapIcons } from './icons.js?v=20261126181944';
import { GACHA } from './skins.js?v=20261126181944';
import { playSound } from './audio.js?v=20261126181944';

const TAU = Math.PI * 2;
const RANK = ['N', 'R', 'SR', 'SSR'];
const COL = { N: [143, 155, 214], R: [76, 240, 138], SR: [199, 166, 255] };   // 品の枠の色と同じ（SSR は虹）
const TRAILS = { N: 3, R: 4, SR: 5, SSR: 6 };
const PROMOTE = { R: 0.1, SR: 0.3, SSR: 0.3 };   // 昇格して見せる割合（そのレア度が出たとき）
const UP_ONE = 1.9, UP_TEN = 1.0;   // 昇格にかける秒数（1回引き・10回引き）
const ease = (u) => 1 - (1 - u) ** 3;
const PITCH = { N: 1, R: 1.12, SR: 1.26, SSR: 1.5 };   // 玉の音の高さ（レア度の予感）
const clamp = (v) => Math.max(0, Math.min(1, v));

function rgb(rar, t, i = 0, a = 1) {
  if (rar === 'SSR') return `hsla(${(t * 220 + i * 47) % 360},95%,66%,${a})`;
  const c = COL[rar];
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export function createGachaFx(stage) {
  const root = document.createElement('div');
  root.className = 'gfx';
  root.innerHTML = '<canvas></canvas><div class="gfx-cards"></div><div class="gfx-info"></div><div class="gfx-foot"></div><div class="gfx-hint">タップで進む</div>';
  stage.appendChild(root);
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  const cardsEl = root.querySelector('.gfx-cards'), infoEl = root.querySelector('.gfx-info'), footEl = root.querySelector('.gfx-foot'), hintEl = root.querySelector('.gfx-hint');
  let run = null, raf = 0;
  // 音：見本で見ているときは、設定で切っていても鳴らす
  const snd = (id, pitch = 1) => playSound(id, { pitch, force: !!(run && run.opts.replay) });

  function size() {
    const r = root.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }

  // ---------- 始める ----------
  // got：[{ it, isNew }]（rollGacha の結果）。opts.onDone：終わったとき、opts.replay：見本の「もう一度」
  function play(got, opts = {}) {
    stop();
    root.classList.add('show');   // 見えている状態でないと、大きさを測れない
    size();
    const W = cv.width, H = cv.height, ten = got.length > 1;
    const orbs = got.map((g, i) => {
      const rar = g.it.rarity, up = opts.forceUp != null ? (opts.forceUp === true ? rar !== 'N' : opts.forceUp.includes(i)) : Math.random() < (PROMOTE[rar] || 0);   // forceUp：見本で昇格を必ず見せる
      const col = i % 5, row = Math.floor(i / 5);
      return {
        ...g, rar, shown: up ? RANK[RANK.indexOf(rar) - 1] : rar, up,
        x: ten ? W * (0.14 + col * 0.18) : W / 2, y: ten ? H * (0.36 + row * 0.2) : H * 0.42,
        r: (ten ? 0.055 : 0.13) * W, openAt: Infinity, done: false, el: null,
        trails: [...Array(ten ? 2 : TRAILS[up ? RANK[RANK.indexOf(rar) - 1] : rar])].map((_, k) => ({
          a0: Math.random() * TAU, R0: Math.max(W, H) * (0.75 + Math.random() * 0.3), spin: (Math.random() < 0.5 ? -1 : 1) * (2.2 + Math.random() * 1.6),
          delay: (ten ? i * 0.04 : 0) + k * 0.08, dur: 0.85 + Math.random() * 0.2,
        })),
      };
    });
    run = { got, orbs, ten, t0: performance.now(), t: 0, parts: [], flash: 0, dark: 0, quake: 0, opts, ended: false };
    // 1回引き：集まりきったら割る。昇格するときは、ひびの時間を足す
    if (!ten) { const o = orbs[0]; o.openAt = 1.6 + (o.up ? UP_ONE + 0.35 : 0) + (o.rar === 'SR' || o.rar === 'SSR' ? 0.25 : 0); }
    else schedule(1.3);
    cardsEl.innerHTML = ''; infoEl.innerHTML = ''; footEl.innerHTML = '';
    cardsEl.style.pointerEvents = 'none';
    if (ten) footEl.innerHTML = '<button class="btn gfx-all">まとめて開ける</button>';
    hintEl.style.opacity = '1';
    root.classList.add('show');
    snd('gacha'); snd('g_gather');
    raf = requestAnimationFrame(frame);
  }
  // 10回引き：開く時刻を並べる（SR以上は前に少しためる。昇格はひびの時間を足す）
  function schedule(from) {
    let at = from;
    for (const o of run.orbs) {
      if (o.done) continue;
      const big = o.rar === 'SR' || o.rar === 'SSR';
      if (big) at += 0.35;
      o.openAt = at + (o.up ? UP_TEN + 0.2 : 0);
      at = o.openAt + (big ? 0.45 : 0.26);
    }
  }
  function openAll() {
    if (!run) return;
    let at = run.t + 0.05;
    for (const o of run.orbs) if (!o.done) { o.openAt = at; o.up = false; o.shown = o.rar; at += 0.06; }
    footEl.innerHTML = '';
  }

  // ---------- 進める（タップ） ----------
  root.addEventListener('click', (e) => {
    if (!run) return;
    if (e.target.closest('.gfx-all')) { openAll(); return; }
    if (e.target.closest('.gfx-close')) { const o = run.opts; stop(); if (o.onDone) o.onDone(); return; }
    if (e.target.closest('.gfx-again')) { const { got, opts } = run; play(got, opts); return; }
    if (run.ended) return;
    if (!run.ten) {
      const o = run.orbs[0];
      if (!o.done) { o.openAt = Math.min(o.openAt, run.t); o.up = false; o.shown = o.rar; }
      return;
    }
    // 10回引き：集まっている途中なら、すぐ開きはじめる。開いている途中なら、次の玉をすぐ開ける
    const next = run.orbs.find((o) => !o.done);
    if (next) { const shift = next.openAt - run.t; if (shift > 0.05) for (const o of run.orbs) if (!o.done) o.openAt -= shift; }
  });

  // ---------- 1こま ----------
  function frame(now) {
    if (!run) return;
    const R = run, dt = Math.min(0.05, (now - R.t0) / 1000 - R.t);
    R.t += dt;
    const t = R.t, W = cv.width, H = cv.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 昇格の間：まわりが暗くなり、割れる前は画面が揺れる
    if (R.dark > 0) { ctx.fillStyle = `rgba(0,0,0,${R.dark})`; ctx.fillRect(0, 0, W, H); }
    if (R.quake > 0) ctx.translate((Math.random() - 0.5) * R.quake, (Math.random() - 0.5) * R.quake);
    R.dark = Math.max(0, (R.dark || 0) - dt * 1.2); R.quake = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (const [i, o] of R.orbs.entries()) {
      // 光の線：画面の外から、うずを巻いて玉の場所へ巻き取られる
      for (const tr of o.trails) {
        const u = clamp((t - tr.delay) / tr.dur);
        if (u <= 0 || u >= 1) continue;
        ctx.beginPath();
        const n = 16;
        for (let k = 0; k <= n; k++) {
          const uu = Math.max(0, u - 0.28 * (1 - k / n));
          const e = ease(uu), rr = tr.R0 * (1 - e), a = tr.a0 + tr.spin * e;
          const x = o.x + Math.cos(a) * rr, y = o.y + Math.sin(a) * rr;
          if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.strokeStyle = rgb(o.shown, t, i, 0.9 * (1 - u * 0.4));
        ctx.lineWidth = o.r * (R.ten ? 0.22 : 0.09);
        ctx.lineCap = 'round';
        ctx.shadowColor = rgb(o.shown, t, i, 1); ctx.shadowBlur = o.r * 0.5;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      if (o.done) continue;
      // 玉：集まるにつれて大きくなり、脈打つ
      const grow = ease(clamp((t - 0.6 - (R.ten ? i * 0.04 : 0)) / 0.45));
      if (grow <= 0) continue;
      if (grow > 0.9 && !o.sOrb) { o.sOrb = true; if (!R.ten || i === 0) snd('g_orb', PITCH[R.ten ? R.orbs.reduce((m, x) => (RANK.indexOf(x.shown) > RANK.indexOf(m) ? x.shown : m), 'N') : o.shown]); }
      const left = o.openAt - t;
      let rr = o.r * grow * (1 + 0.06 * Math.sin(t * 9 + i));
      let col = o.shown, dim = 1;
      // 昇格：①止まる（まわりが暗くなり、玉が2回 脈打つ）②ひびが広がり、すき間から上の色の光の筋が噴き出す
      //   ③まわりの光が吸い込まれ、震えが大きくなる ④外の殻がくだけ散り、中から上の色の玉が現れる
      const upLen = R.ten ? UP_TEN : UP_ONE;
      let crack = 0, beams = 0, jx = 0, jy = 0;
      const upStart = o.openAt - (R.ten ? 0.2 : 0.35) - upLen;
      if (o.up && t >= upStart) {
        const k = clamp((t - upStart) / upLen);
        R.dark = Math.max(R.dark, (R.ten ? 0.35 : 0.6) * Math.min(1, k * 4));
        const beat = Math.exp(-(((k - 0.1) / 0.035) ** 2)) + Math.exp(-(((k - 0.24) / 0.035) ** 2));
        rr *= 0.9 + beat * 0.18;
        dim = 0.65 + beat * 0.35;
        if (beat > 0.6 && !o['b' + (k < 0.17 ? 1 : 2)]) { o['b' + (k < 0.17 ? 1 : 2)] = true; snd('g_beat'); R.parts.push({ ring: true, x: o.x, y: o.y, r0: rr, r1: o.r * 2.4, w: o.r * 0.1, life: 0.45, max: 0.45, rar: o.shown, i }); }
        crack = clamp((k - 0.3) / 0.45);
        beams = clamp((k - 0.42) / 0.36);
        if (crack > 0 && !o.sCrack) { o.sCrack = true; snd('g_crack'); }
        if (beams > 0 && !o.sBeam) { o.sBeam = true; snd('g_beam', R.ten ? 1.2 : 1); }
        const shake = clamp((k - 0.45) / 0.33);
        jx = (Math.random() - 0.5) * o.r * 0.25 * shake; jy = (Math.random() - 0.5) * o.r * 0.25 * shake;
        R.quake = Math.max(R.quake, o.r * 0.12 * shake * (R.ten ? 0.5 : 1));
        // まわりの光の粒が吸い込まれる
        if (k > 0.4 && k < 0.78 && Math.random() < (R.ten ? 0.5 : 0.9)) {
          const a = Math.random() * TAU, d = o.r * (2.5 + Math.random() * 2);
          R.parts.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.6, vy: -Math.sin(a) * d * 2.6, s: o.r * 0.05, life: 0.35, max: 0.35, rar: o.rar, i, drag: 1 });
        }
        // 殻がくだける
        if (k >= 0.8 && !o.shattered) {
          o.shattered = true;
          snd('g_shatter');
          for (let n = 0; n < (R.ten ? 9 : 16); n++) {
            const a = n * TAU / (R.ten ? 9 : 16) + Math.random() * 0.3, sp = o.r * (5 + Math.random() * 6);
            R.parts.push({ shard: true, x: o.x + Math.cos(a) * rr * 0.6, y: o.y + Math.sin(a) * rr * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: a, vr: (Math.random() - 0.5) * 12, s: o.r * (0.22 + Math.random() * 0.2), life: 0.7, max: 0.7, rar: o.shown, i });
          }
          R.parts.push({ ring: true, x: o.x, y: o.y, r0: o.r * 0.6, r1: o.r * 5, w: o.r * 0.35, life: 0.55, max: 0.55, rar: o.rar, i });
          R.flash = Math.max(R.flash, R.ten ? 0.3 : 0.6);
          R.dark = 0;
        }
        if (o.shattered) { col = o.rar; dim = 1; rr *= 1.18; crack = 0; beams = 0; jx = jy = 0; }
      }
      // SR以上：割れる直前に震える
      if (!o.up && (o.rar === 'SR' || o.rar === 'SSR') && left < 0.35) { jx = (Math.random() - 0.5) * o.r * 0.12; jy = (Math.random() - 0.5) * o.r * 0.12; }
      // 光の筋：ひびのすき間から、上の色の光が外へ噴き出す（ゆっくり回る）
      if (beams > 0) {
        for (let c = 0; c < 6; c++) {
          const a = c * 1.05 + i + t * 0.6, len = o.r * (1.2 + beams * (R.ten ? 2.2 : 3.6)) * (0.8 + 0.2 * Math.sin(t * 30 + c)), wd = 0.05 + beams * 0.06;
          const gb = ctx.createLinearGradient(o.x, o.y, o.x + Math.cos(a) * len, o.y + Math.sin(a) * len);
          gb.addColorStop(0, rgb(o.rar, t, i, 0.9)); gb.addColorStop(1, rgb(o.rar, t, i, 0));
          ctx.fillStyle = gb;
          ctx.beginPath(); ctx.moveTo(o.x + jx, o.y + jy);
          ctx.lineTo(o.x + Math.cos(a - wd) * len, o.y + Math.sin(a - wd) * len);
          ctx.lineTo(o.x + Math.cos(a + wd) * len, o.y + Math.sin(a + wd) * len);
          ctx.closePath(); ctx.fill();
        }
      }
      const g = ctx.createRadialGradient(o.x + jx, o.y + jy, 0, o.x + jx, o.y + jy, rr * 1.9);
      g.addColorStop(0, `rgba(255,255,255,${0.95 * dim})`);
      g.addColorStop(0.3, rgb(col, t, i, 0.85 * dim));
      g.addColorStop(1, rgb(col, t, i, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x + jx, o.y + jy, rr * 1.9, 0, TAU); ctx.fill();
      // ひび：枝分かれしながら広がる
      if (crack > 0) {
        ctx.strokeStyle = rgb(o.rar, t, i, 1);
        ctx.lineWidth = Math.max(1, o.r * 0.045);
        ctx.shadowColor = rgb(o.rar, t, i, 1); ctx.shadowBlur = o.r * 0.7;
        for (let c = 0; c < 6; c++) {
          let a = c * 1.05 + i, x = o.x + jx, y = o.y + jy;
          const len = rr * 1.05 * crack;
          ctx.beginPath(); ctx.moveTo(x, y);
          for (let st = 1; st <= 5; st++) {
            a += ((c * 7 + st * 3) % 5 - 2) * 0.2;
            const nx = o.x + jx + Math.cos(a) * len * st / 5, ny = o.y + jy + Math.sin(a) * len * st / 5;
            ctx.lineTo(nx, ny);
            if (st === 2 || st === 4) { const ba = a + (st === 2 ? 0.7 : -0.6), bl = len * 0.28; ctx.moveTo(nx, ny); ctx.lineTo(nx + Math.cos(ba) * bl, ny + Math.sin(ba) * bl); ctx.moveTo(nx, ny); }
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }
      // 割れる
      if (t >= o.openAt) burst(o, i);
    }
    // はじけた破片と輪
    for (const p of R.parts) {
      p.life -= dt;
      if (p.ring) {
        const k = 1 - p.life / p.max;
        ctx.strokeStyle = rgb(p.rar, t, p.i, (1 - k) * 0.9);
        ctx.lineWidth = p.w * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * ease(k), 0, TAU); ctx.stroke();
        continue;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.drag) { p.vx *= 0.94; p.vy *= 0.94; }
      if (p.shard) {
        p.rot += p.vr * dt;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = rgb(p.rar, t, p.i, Math.max(0, p.life / p.max) * 0.9);
        ctx.beginPath(); ctx.moveTo(p.s, 0); ctx.lineTo(-p.s * 0.6, p.s * 0.5); ctx.lineTo(-p.s * 0.4, -p.s * 0.6); ctx.closePath(); ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.fillStyle = rgb(p.rar, t, p.i, Math.max(0, p.life / p.max));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.4 + 0.6 * p.life / p.max), 0, TAU); ctx.fill();
    }
    R.parts = R.parts.filter((p) => p.life > 0);
    // SSRが出ている間：後ろで虹の光の筋がゆっくり回る
    for (const [i, o] of R.orbs.entries()) {
      if (!o.done || o.rar !== 'SSR') continue;
      const k = clamp((t - o.openAt) / 0.5), len = o.r * (R.ten ? 3 : 2.6) * k;
      for (let n = 0; n < 12; n++) {
        const a = n * TAU / 12 + t * 0.4;
        ctx.fillStyle = rgb('SSR', t, n, (n % 2 ? 0.08 : 0.16) * k);
        ctx.beginPath(); ctx.moveTo(o.x, o.y);
        ctx.arc(o.x, o.y, len, a - 0.09, a + 0.09); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (R.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${R.flash})`; ctx.fillRect(0, 0, W, H); R.flash = Math.max(0, R.flash - dt * 2.2); }
    // 全部開いたら、ボタンを出す
    if (!R.ended && R.orbs.every((o) => o.done) && t > Math.max(...R.orbs.map((o) => o.openAt)) + 0.5) finish();
    raf = requestAnimationFrame(frame);
  }

  function burst(o, i) {
    const R = run, big = o.rar === 'SR' || o.rar === 'SSR';
    o.done = true; o.openAt = R.t;
    snd('g_open', PITCH[o.rar] * (R.ten ? 1.1 : 1));
    if (big) snd(o.rar === 'SSR' ? 'gssr' : 'gsr');
    const n = R.ten ? (big ? 22 : 10) : big ? 46 : 26;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, sp = o.r * (3 + Math.random() * (big ? 9 : 5));
      R.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: o.r * (0.05 + Math.random() * 0.07), life: 0.6 + Math.random() * 0.5, max: 1.1, rar: o.rar, i });
    }
    R.parts.push({ ring: true, x: o.x, y: o.y, r0: o.r * 0.5, r1: o.r * (big ? 4 : 2.6), w: o.r * 0.25, life: 0.5, max: 0.5, rar: o.rar, i });
    if (big) R.parts.push({ ring: true, x: o.x, y: o.y, r0: o.r * 0.3, r1: o.r * 6, w: o.r * 0.12, life: 0.75, max: 0.75, rar: o.rar, i });
    R.flash = Math.max(R.flash, R.ten ? (big ? 0.28 : 0.08) : big ? 0.55 : 0.3);
    // 品を出す
    const el = document.createElement('div');
    el.className = `gfx-card${R.ten ? '' : ' one'}${big ? ' big' : ''}`;
    el.style.left = `${(o.x / cv.width) * 100}%`; el.style.top = `${(o.y / cv.height) * 100}%`;
    el.innerHTML = gachaCell(o.it, o.isNew);
    cardsEl.appendChild(el);
    snapIcons(el);
    o.el = el;
    if (!R.ten) {
      const back = o.isNew ? '' : `<p class="gfx-dup">持っていた品なので、コイン <b>+${GACHA.refund[o.rar]}</b> に変わった</p>`;
      infoEl.innerHTML = `<p class="gfx-name r-${o.rar}"><span>${o.rar}</span>${o.it.name}</p>${back}`;
    }
  }
  function finish() {
    run.ended = true;
    cardsEl.style.pointerEvents = 'auto';   // 出そろったら、品を押して大きく見られる
    hintEl.style.opacity = '0';
    footEl.innerHTML = `${run.opts.replay ? '<button class="btn btn-sub gfx-again">もう一度見る</button>' : ''}<button class="btn gfx-close">${run.ten ? '結果を見る' : 'とじる'}</button>`;
  }
  function stop() {
    cancelAnimationFrame(raf);
    run = null;
    root.classList.remove('show');
    cardsEl.innerHTML = ''; infoEl.innerHTML = ''; footEl.innerHTML = '';
  }
  return { play, stop, get active() { return !!run; } };
}
