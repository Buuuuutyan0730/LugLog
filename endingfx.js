// エンディング（終筆を初めて倒したときに1回だけ）：「軌跡の絵」
//   画面が暗くなる → そのプレイで描いた線（分身の通り道）を、描いた順に光る線で描き直していく（だんだん速く）
//   → 何百本も重なって1枚の絵になる → 絵が少し引いて、題名と記録が出る → クレジットが1つずつ出る → 続けるボタン
//   data = { trails: [[x, y, x, y, ...], ...]（ステージの座標）, world: { w, h }, ghosts, phase, time, score }
import { ghostColor } from './theme.js?v=20261127030107';
import { LOGO_TRAIL } from './screens.js?v=20261127030107';

// 題字：ホームと同じロゴ（光の軌跡つき）。出す瞬間に入れて、軌跡が描かれる動きをそこから始める
const LOGO = `<div class="logo-wrap">${LOGO_TRAIL}<div class="logo-main" data-t="LugLog"><span>Lug</span><span class="lg2">Log</span></div></div>`;

const TAU = Math.PI * 2;
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => 1 - (1 - u) ** 3;
// 時間の割りふり（秒）
const T = { dark: 1.2, drawEnd: 10.5, pull: 11.0, pullLen: 1.6, title: 11.8, credits: 13.6, credit: 2.0, go: 0 };
const CREDITS = [['企画・ゲームデザイン', ['いぶ']], ['グラフィック', ['いぶ']], ['サウンド', ['いぶ']], ['プログラム', ['いぶ', 'Claude（Anthropic）']]];
T.go = T.credits + CREDITS.length * T.credit + 1.6;

const fmtTime = (s) => { const h = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60); return h ? `${h}時間${mm}分` : `${mm}分`; };

export function createEndingFx(stage) {
  const root = document.createElement('div');
  root.className = 'efx';
  root.innerHTML = `<canvas></canvas>
    <div class="efx-foot">
      <div class="efx-title"><div class="efx-logo ms-logo"></div><div class="efx-count"></div><div class="efx-stat"></div></div>
      <div class="efx-slot"><div class="efx-credit"></div><div class="efx-thanks">遊んでくれて、ありがとう</div></div>
      <button class="btn wide efx-go"><span>この先も、描き続ける</span></button>
    </div>`;
  stage.appendChild(root);
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  const titleEl = root.querySelector('.efx-title'), creditEl = root.querySelector('.efx-credit'), thanksEl = root.querySelector('.efx-thanks'), goEl = root.querySelector('.efx-go');
  let run = null, raf = 0;

  function play(data, opts = {}) {
    stop();
    root.classList.add('show');
    const r = root.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const W = cv.width, H = cv.height;
    // 絵を描きためておく紙（描き終わった線はここへ焼き付けて、毎回描き直さない）
    const art = document.createElement('canvas'); art.width = W; art.height = H;
    const ax = art.getContext('2d');
    // 線を画面に収める：全部の線が入る四角を求め、画面の上 6 割ほどに合わせる
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of data.trails) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
    const sc = Math.min((W * 0.9) / bw, (H * 0.66) / bh), ox = W / 2 - ((x0 + x1) / 2) * sc, oy = H * 0.42 - ((y0 + y1) / 2) * sc;
    const n = data.trails.length;
    // 1本ずつ、いつ描き始めていつ描き終えるか。最初はゆっくり1本ずつ、だんだん速く何本も同時に
    const trails = data.trails.map((p, i) => {
      const k = i / Math.max(1, n - 1);
      const start = T.dark + (T.drawEnd - 0.6 - T.dark) * k ** 0.55;
      const len = 0.25 + 1.3 * (1 - k) ** 2;
      const pts = []; for (let j = 0; j < p.length; j += 2) pts.push([ox + p[j] * sc, oy + p[j + 1] * sc]);
      return { pts, start, len, col: i, done: false };
    });
    const u = W / 360;
    // 本数が多いほど1本を薄くして、重なっても真っ白につぶれないようにする
    const alpha = Math.max(0.07, Math.min(0.5, 0.5 * Math.sqrt(50 / Math.max(1, n))));
    // 見せるための紙：絵のふちを楕円形にぼかして、四角く切れて見えないようにする
    const view = document.createElement('canvas'); view.width = W; view.height = H;
    const rx = Math.min(W * 0.5, (bw * sc) / 2 + 12 * u), ry = Math.min(H * 0.36, (bh * sc) / 2 + 12 * u);
    run = { data, opts, trails, art, ax, W, H, u, alpha, view, vx: view.getContext('2d'), rx, ry, t0: performance.now(), t: 0, step: 0 };
    root.querySelector('.efx-count').innerHTML = `描いた軌跡 <b>${n.toLocaleString()}</b> 本`;
    root.querySelector('.efx-stat').textContent = `フェーズ ${data.phase}・${fmtTime(data.time || 0)}`;
    titleEl.classList.remove('on'); root.querySelector('.efx-logo').innerHTML = ''; thanksEl.classList.remove('on'); goEl.classList.remove('on'); creditEl.className = 'efx-credit'; creditEl.innerHTML = '';
    goEl.onclick = () => { if (run && run.t >= T.go) { const cb = opts.onDone; stop(); if (cb) cb(); } };
    raf = requestAnimationFrame(frame);
  }

  function strokeTrail(c, pts, upto, col, u, head, al = 0.5) {
    if (upto < 2) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineJoin = 'round'; c.lineCap = 'round';
    for (const [w, a] of [[5 * u, al * 0.14], [1.6 * u, al]]) {
      c.strokeStyle = ghostColor(col, a); c.lineWidth = w;
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < upto; i++) c.lineTo(pts[i][0], pts[i][1]);
      c.stroke();
    }
    if (head) { const [x, y] = pts[upto - 1]; c.fillStyle = '#fff'; c.globalAlpha = 0.9; c.beginPath(); c.arc(x, y, 2.2 * u, 0, TAU); c.fill(); }
    c.restore();
  }

  function frame(now) {
    if (!run) return;
    const R = run, t = (R.t = (now - R.t0) / 1000), { W, H, u, ax } = R;
    // 線を進める
    const active = [];
    for (const tr of R.trails) {
      if (tr.done || t < tr.start) continue;
      const k = clamp((t - tr.start) / tr.len);
      if (k >= 1) { strokeTrail(ax, tr.pts, tr.pts.length, tr.col, u, false, R.alpha); tr.done = true; continue; }
      active.push([tr, Math.max(2, Math.ceil(tr.pts.length * ease(k)))]);
    }
    // 背景：暗くなっていく
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgba(4,5,12,${0.97 * ease(clamp(t / T.dark))})`;
    ctx.fillRect(0, 0, W, H);
    // 絵：描き終わると少し引いて上へ寄り、題名の場所をあける
    const pk = ease(clamp((t - T.pull) / T.pullLen)), s = 1 - 0.24 * pk, cy = H * 0.42, ty = -H * 0.1 * pk;
    const vx = R.vx;
    vx.globalCompositeOperation = 'source-over';
    vx.clearRect(0, 0, W, H);
    vx.drawImage(R.art, 0, 0);
    for (const [tr, upto] of active) strokeTrail(vx, tr.pts, upto, tr.col, u, true, Math.max(R.alpha, 0.35));
    // 描き終わった瞬間：絵がふっと明るくなる
    const fl = clamp(1 - Math.abs(t - T.drawEnd) / 0.5);
    if (fl > 0) { vx.globalCompositeOperation = 'lighter'; vx.globalAlpha = 0.4 * fl; vx.drawImage(R.art, 0, 0); vx.globalAlpha = 1; }
    // ふちを楕円形にぼかす
    vx.globalCompositeOperation = 'destination-in';
    vx.save(); vx.translate(W / 2, cy); vx.scale(1, R.ry / R.rx);
    const g = vx.createRadialGradient(0, 0, 0, 0, 0, R.rx); g.addColorStop(0, '#000'); g.addColorStop(0.72, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    vx.fillStyle = g; vx.fillRect(-R.rx, -R.rx, R.rx * 2, R.rx * 2); vx.restore();
    vx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(W / 2, cy + ty); ctx.scale(s, s); ctx.translate(-W / 2, -cy);
    ctx.drawImage(R.view, 0, 0);
    ctx.restore();
    // 文字（題名 → クレジットを1つずつ → ありがとう → ボタン）
    if (t >= T.title && !titleEl.classList.contains('on')) { root.querySelector('.efx-logo').innerHTML = LOGO; titleEl.classList.add('on'); }
    const ci = Math.floor((t - T.credits) / T.credit);
    if (ci >= 0 && ci < CREDITS.length && R.step !== ci + 1) {
      R.step = ci + 1;
      const [k, vs] = CREDITS[ci];
      creditEl.className = 'efx-credit';
      creditEl.innerHTML = `<small>${k}</small>${vs.map((v) => `<b>${v}</b>`).join('')}`;
      void creditEl.offsetWidth; creditEl.classList.add('on');
    }
    if (ci >= CREDITS.length && R.step !== -1) { R.step = -1; creditEl.className = 'efx-credit'; thanksEl.classList.add('on'); }
    if (t >= T.go) goEl.classList.add('on');
    // 見本：最後まで行ったら、少しおいて最初から
    if (R.opts.replay && t > T.go + 3) { play(R.data, R.opts); return; }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    run = null;
    root.classList.remove('show');
  }
  return { play, stop, get playing() { return !!run; } };
}

// 見本用の線：指でなぞったような、なめらかに曲がる線をたくさん作る（毎回同じ形になるように、決まった乱数）
export function sampleTrails(count = 612, w = 420, h = 720) {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < count; i++) {
    let x = w * (0.2 + rnd() * 0.6), y = h * (0.15 + rnd() * 0.7), a = rnd() * TAU, turn = (rnd() - 0.5) * 0.2;
    const steps = 30 + Math.floor(rnd() * 90), p = [x, y];
    for (let j = 0; j < steps; j++) {
      turn += (rnd() - 0.5) * 0.06; turn = Math.max(-0.22, Math.min(0.22, turn));
      a += turn;
      x += Math.cos(a) * 6; y += Math.sin(a) * 6;
      if (x < 20 || x > w - 20) { a = Math.PI - a; x = Math.max(20, Math.min(w - 20, x)); }
      if (y < 20 || y > h - 20) { a = -a; y = Math.max(20, Math.min(h - 20, y)); }
      p.push(Math.round(x), Math.round(y));
    }
    out.push(p);
  }
  return out;
}
