// できごとが始まるときの演出（見た目だけ）
//   分類とレア度で、背景・光・動きを変える
//   good：青い光がふわっと広がり、きらきらが上る／rare：虹の光線が回る／super：金の光線と紙ふぶき、白く光る
//   luck：紫の渦と「？」が回り、紋章がコインのように回ってから止まる
//   bad：暗く赤く沈み、画面が揺れて、紋章のまわりにひびが走る／bad の rare：真っ黒に近く、赤く脈打ち、文字がノイズで乱れる
import { EVENT_BY_ID, KIND_LABEL, RAR_LABEL, drawComet, COMET_HUES } from './events.js?v=20261127122206';

const TAU = Math.PI * 2;
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => 1 - (1 - u) ** 3;
const BANNER = { rare: 'レアイベント！', super: '超レアイベント！！' };

export function createEventFx(stage) {
  const root = document.createElement('div');
  root.className = 'evfx';
  root.innerHTML = `<canvas></canvas>
    <div class="evfx-banner"></div>
    <div class="evfx-card">
      <div class="evfx-tag"></div>
      <div class="evfx-mark"><span></span></div>
      <div class="evfx-name"></div>
      <div class="evfx-line"></div>
      <button class="btn evfx-go"><span>すすむ</span></button>
    </div>
    <div class="evfx-coins" hidden><div class="evfx-pill"><canvas width="44" height="44"></canvas><b>×12</b></div><div class="evfx-cnote">コメット（ゲーム中だけのお金）。中ボス・ボス・大きい敵が落とす</div></div>`;
  stage.appendChild(root);
  const cv = root.querySelector('canvas'), ctx = cv.getContext('2d');
  const card = root.querySelector('.evfx-card'), banner = root.querySelector('.evfx-banner');
  const coinsEl = root.querySelector('.evfx-coins'), pillCv = root.querySelector('.evfx-pill canvas'), pctx = pillCv.getContext('2d');
  let run = null, raf = 0;

  function size() {
    const r = root.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  }
  // できごとの演出を流す（replay：見本用に、最後まで行ったら少しおいてくり返す）
  function play(id, opts = {}) {
    stop();
    const ev = EVENT_BY_ID[id]; if (!ev) return;
    root.classList.add('show');
    root.dataset.kind = ev.kind; root.dataset.rar = ev.rar;
    root.classList.toggle('worst', ev.kind === 'bad' && ev.rar === 'rare');
    coinsEl.hidden = true; card.hidden = false;
    size();
    root.querySelector('.evfx-tag').textContent = KIND_LABEL[ev.kind] + (RAR_LABEL[ev.rar] ? `・${RAR_LABEL[ev.rar]}` : '');
    root.querySelector('.evfx-mark span').textContent = ev.mark;
    root.querySelector('.evfx-name').textContent = ev.name;
    root.querySelector('.evfx-line').textContent = ev.line;
    banner.textContent = ev.kind === 'bad' && ev.rar === 'rare' ? '最悪の…' : ev.kind !== 'bad' ? BANNER[ev.rar] || '' : '';
    card.className = 'evfx-card'; banner.className = 'evfx-banner';
    void card.offsetWidth;
    card.classList.add('in'); if (banner.textContent) banner.classList.add('in');
    run = { ev, opts, t0: performance.now(), parts: [], seed: Math.random() * 1000 };
    raf = requestAnimationFrame(frame);
  }
  // コメットの見本：いろいろな色のコメットが回り、持っている数の表示へ飛んでいく
  function comets(opts = {}) {
    stop();
    root.classList.add('show'); root.classList.remove('worst');
    root.dataset.kind = 'comet'; root.dataset.rar = '';
    card.hidden = true; banner.className = 'evfx-banner'; banner.textContent = '';
    coinsEl.hidden = false;
    size();
    run = { comet: true, opts, t0: performance.now(), fly: [] };
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    if (!run) return;
    const R = run, t = Math.max(0, (now - R.t0) / 1000), W = cv.width, H = cv.height, u = W / 360;
    ctx.clearRect(0, 0, W, H);
    if (R.comet) drawComets(R, t, W, H, u);
    else drawEvent(R, t, W, H, u);
    if (R.opts.replay && !R.comet && t > 5) { play(R.ev.id, R.opts); return; }
    raf = requestAnimationFrame(frame);
  }

  function drawComets(R, t, W, H, u) {
    ctx.fillStyle = 'rgba(5,7,18,0.92)'; ctx.fillRect(0, 0, W, H);
    // 大きく5色
    COMET_HUES.forEach((h, i) => drawComet(ctx, W * (0.14 + i * 0.18), H * 0.36, 22 * u, h, t + i, i));
    // ゲームの中の大きさ（小さく）
    COMET_HUES.forEach((h, i) => drawComet(ctx, W * (0.3 + i * 0.1), H * 0.56, 7 * u, h, t * 1.3 + i * 2, i * 2));
    ctx.fillStyle = 'rgba(200,210,255,0.7)'; ctx.font = `${Math.round(11 * u)}px DotGothic16, sans-serif`; ctx.textAlign = 'center';
    ctx.fillText('ゲームの中の大きさ', W / 2, H * 0.62);
    // 敵から飛び出して、上の数の表示へ吸いこまれる
    if (R.fly.length < 6 && Math.random() < 0.06) R.fly.push({ x: W * (0.3 + Math.random() * 0.4), y: H * 0.78, vx: (Math.random() - 0.5) * 160 * u, vy: -220 * u - Math.random() * 120 * u, h: COMET_HUES[Math.floor(Math.random() * 5)], age: 0 });
    const target = { x: W * 0.5, y: H * 0.1 };
    for (const f of R.fly) {
      f.age += 1 / 60;
      if (f.age < 0.5) { f.vy += 500 * u / 60; f.x += f.vx / 60; f.y += f.vy / 60; }
      else { const k = 0.14; f.x += (target.x - f.x) * k; f.y += (target.y - f.y) * k; }
      drawComet(ctx, f.x, f.y, 7 * u, f.h, t * 3, f.age * 6);
    }
    R.fly = R.fly.filter((f) => Math.hypot(f.x - target.x, f.y - target.y) > 6 * u || f.age < 0.5);
    pctx.clearRect(0, 0, 44, 44); drawComet(pctx, 22, 22, 15, COMET_HUES[Math.floor(t * 0.7) % 5], t);
  }

  function drawEvent(R, t, W, H, u) {
    const { kind, rar } = R.ev, worst = kind === 'bad' && rar === 'rare';
    const a = ease(clamp(t / 0.4));
    const cx = W / 2, cy = H * 0.42;
    // 背景
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.75);
    if (kind === 'good') { bg.addColorStop(0, rar === 'super' ? '#3a2a06' : '#0f2a55'); bg.addColorStop(1, '#04060f'); }
    else if (kind === 'luck') { bg.addColorStop(0, '#2a0f45'); bg.addColorStop(1, '#06030c'); }
    else if (worst) { bg.addColorStop(0, `rgba(${60 + 40 * Math.sin(t * 4)},0,0,1)`); bg.addColorStop(1, '#000'); }
    else { bg.addColorStop(0, '#3a070c'); bg.addColorStop(1, '#070203'); }
    ctx.globalAlpha = 0.94 * a; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    // 悪いできごと：揺れ
    ctx.save();
    if (kind === 'bad') { const sk = (worst ? 10 : 6) * u * Math.max(0, 1 - Math.abs(t - 0.55) / 0.5); ctx.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk); }
    // 光線（レア・超レア・運しだい）
    const rays = kind !== 'bad' && (rar === 'rare' || rar === 'super');
    if (rays) {
      const n = rar === 'super' ? 18 : 14;
      for (let k = 0; k < n; k++) {
        const ang = t * 0.35 + (k / n) * TAU, w = 0.09;
        ctx.fillStyle = rar === 'super' ? `rgba(255,${200 + 40 * Math.sin(k)},80,${0.18 * a})` : `hsla(${(k * 360) / n + t * 90},90%,65%,${0.2 * a})`;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, Math.max(W, H), ang - w, ang + w); ctx.closePath(); ctx.fill();
      }
    }
    // 超レア：はじめに白く光る
    if (rar === 'super' && kind === 'good') { const fl = clamp(1 - Math.abs(t - 0.55) / 0.25); if (fl > 0) { ctx.fillStyle = `rgba(255,255,240,${0.8 * fl})`; ctx.fillRect(-20, -20, W + 40, H + 40); } }
    // 粒：good は下から上るきらきら、super は紙ふぶき、luck は回る「？」、bad は落ちる灰
    if (R.parts.length < (rar === 'super' ? 90 : 40) && t < 4.5) {
      for (let k = 0; k < 3; k++) {
        if (kind === 'good') R.parts.push(rar === 'super'
          ? { x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 60 * u, vy: (80 + Math.random() * 120) * u, rot: Math.random() * 6, h: Math.random() * 360, type: 'confetti' }
          : { x: Math.random() * W, y: H + 10, vx: 0, vy: -(40 + Math.random() * 80) * u, type: 'spark', h: 190 + Math.random() * 40 });
        else if (kind === 'luck') R.parts.push({ ang: Math.random() * TAU, rr: (60 + Math.random() * 140) * u, sp: 0.6 + Math.random(), type: 'q' });
        else R.parts.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 20 * u, vy: (30 + Math.random() * 60) * u, type: 'ash' });
      }
    }
    for (const p of R.parts) {
      if (p.type === 'q') { p.ang += p.sp / 60; const x = cx + Math.cos(p.ang) * p.rr, y = cy + Math.sin(p.ang) * p.rr * 0.7; ctx.fillStyle = `rgba(210,160,255,${0.55 * a})`; ctx.font = `${Math.round(14 * u)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'; ctx.fillText('?', x, y); continue; }
      p.x += p.vx / 60; p.y += p.vy / 60;
      if (p.type === 'confetti') { p.rot += 0.1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = `hsl(${p.h},90%,62%)`; ctx.fillRect(-3 * u, -1.5 * u, 6 * u, 3 * u); ctx.restore(); }
      else if (p.type === 'spark') { ctx.fillStyle = `hsla(${p.h},100%,75%,0.8)`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * u, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = worst ? 'rgba(255,40,40,0.5)' : 'rgba(120,110,110,0.5)'; ctx.fillRect(p.x, p.y, 2 * u, 2 * u); }
    }
    // 紋章のうしろの輪（運しだいは、コインのように回ってから止まる）
    const R0 = 58 * u;
    ctx.save(); ctx.translate(cx, cy);
    if (kind === 'luck') { const spin = clamp(t / 1.3); ctx.scale(Math.cos((1 - ease(spin)) * 14) || 0.02, 1); }
    const ring = kind === 'good' ? (rar === 'super' ? '#ffd84a' : rar === 'rare' ? `hsl(${t * 120 % 360},90%,65%)` : '#7fe9ff') : kind === 'luck' ? '#c890ff' : '#ff3b4a';
    ctx.strokeStyle = ring; ctx.lineWidth = 3 * u; ctx.shadowColor = ring; ctx.shadowBlur = 18 * u;
    ctx.beginPath(); ctx.arc(0, 0, R0 * (0.6 + 0.4 * ease(clamp(t / 0.6))), 0, TAU); ctx.stroke();
    ctx.restore();
    // 悪いできごと：紋章のまわりにひびが走る
    if (kind === 'bad') {
      const k = clamp((t - 0.45) / 0.4);
      ctx.strokeStyle = worst ? 'rgba(255,40,40,0.9)' : 'rgba(255,90,90,0.7)'; ctx.lineWidth = 1.6 * u;
      for (let c = 0; c < (worst ? 9 : 6); c++) {
        let x = cx, y = cy, ang = (c / (worst ? 9 : 6)) * TAU + 0.3;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * R0, y + Math.sin(ang) * R0);
        for (let s = 1; s <= 5 * k; s++) { ang += Math.sin(c * 7 + s * 3) * 0.4; ctx.lineTo(x + Math.cos(ang) * (R0 + s * 22 * u), y + Math.sin(ang) * (R0 + s * 22 * u)); }
        ctx.stroke();
      }
    }
    ctx.restore();
    // 最悪のできごと：ときどき横にノイズの帯
    if (worst && Math.random() < 0.25) { const y = Math.random() * H, h = (4 + Math.random() * 16) * u; ctx.fillStyle = `rgba(255,${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0.18)`; ctx.fillRect(0, y, W, h); }
  }

  function stop() {
    cancelAnimationFrame(raf);
    run = null;
    root.classList.remove('show');
  }
  return { play, comets, stop };
}
