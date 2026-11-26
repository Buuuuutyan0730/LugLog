// できごとの画面（フェーズクリアのあと、カード選びの代わりに出る）
//   できごとごとに、背景の絵・始まりの動き・中身の遊び方を1つずつ作る（使い回しの型にはしない）
//   共通なのは、外枠（背景のキャンバス・上のコメットの数・ボタンの見た目）だけ
import { EVENT_BY_ID, KIND_LABEL, RAR_LABEL, drawComet, COMET_HUES } from './events.js?v=20261126180136';
import { playSound } from './audio.js?v=20261126180136';
import { CURSE_BY_ID } from './talents.js?v=20261126180136';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u) => 1 - (1 - clamp(u)) ** 3;
const back = (u) => { u = clamp(u); const c = 1.7; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RAR_COL = { normal: '#9fb0ff', rare: '#4cf08a', super: '#c7a6ff', mythic: 'rainbow' };
const PRICE = { normal: 3, rare: 5, super: 8, mythic: 12 };
const cometIcon = (n) => `<i class="evu-ci" data-n="${n}"></i>`;

export function createEventUI(stage, hud) {
  const root = document.createElement('div');
  root.className = 'evu';
  root.innerHTML = `<canvas class="evu-bg"></canvas>
    <div class="evu-head"><span class="evu-tag"></span><b class="evu-title"></b></div>
    <div class="evu-wallet"><canvas width="48" height="48"></canvas><b>0</b></div>
    <div class="evu-body"></div>
    <div class="evu-toast"></div>`;
  stage.appendChild(root);
  const cv = root.querySelector('.evu-bg'), c = cv.getContext('2d');
  const body = root.querySelector('.evu-body'), toastEl = root.querySelector('.evu-toast');
  const wallet = root.querySelector('.evu-wallet'), wc = wallet.querySelector('canvas').getContext('2d');
  let cur = null, raf = 0;

  function frame(now) {
    if (!cur) return;
    const t = Math.max(0, (now - cur.t0) / 1000), W = cv.width, H = cv.height, u = W / 360;
    c.clearRect(0, 0, W, H);
    if (cur.draw) cur.draw(c, t, W, H, u);
    // 上のコメットの数（増え減りは数字が転がるように）
    const s = cur.s, want = s.comets;
    if (cur.shown !== want) { cur.shown += Math.sign(want - cur.shown) * Math.max(1, Math.round(Math.abs(want - cur.shown) * 0.2)); wallet.querySelector('b').textContent = cur.shown; }
    wc.clearRect(0, 0, 48, 48); drawComet(wc, 24, 24, 15, COMET_HUES[Math.floor(t / 1.5) % 5], t);
    // 文中のコメットの小さな絵
    for (const el of root.querySelectorAll('canvas.evu-cim')) { const x = el.getContext('2d'); x.clearRect(0, 0, 32, 32); drawComet(x, 16, 16, 10, Number(el.dataset.h), t + Number(el.dataset.h)); }
    raf = requestAnimationFrame(frame);
  }

  // できごとを開く。終わったら onDone()
  function open(s, api, id, onDone) {
    close();
    const ev = EVENT_BY_ID[id];
    root.classList.add('show');
    root.dataset.kind = ev.kind; root.dataset.ev = id;
    const r = root.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    root.querySelector('.evu-tag').textContent = KIND_LABEL[ev.kind] + (RAR_LABEL[ev.rar] ? `・${RAR_LABEL[ev.rar]}` : '');
    root.querySelector('.evu-title').textContent = ev.name;
    body.innerHTML = '';
    cur = { s, api, ev, t0: performance.now(), shown: s.comets, draw: null, onDone };
    wallet.querySelector('b').textContent = s.comets;
    raf = requestAnimationFrame(frame);
    const ctx = makeCtx(cur);
    (SCENES[id] || SCENES.stall)(ctx);
  }
  function close() { cancelAnimationFrame(raf); cur = null; root.classList.remove('show'); body.innerHTML = ''; }

  // 各できごとに渡す道具
  function makeCtx(C) {
    const ctx = {
      s: C.s, api: C.api, body, root,
      // 背景の絵（毎フレーム呼ばれる）
      draw(fn) { C.draw = fn; },
      time: () => (performance.now() - C.t0) / 1000,
      rect(el) { if (!el || !el.isConnected) return null; const a = el.getBoundingClientRect(), b = root.getBoundingClientRect(), k = cv.width / Math.max(1, b.width); return { x: (a.left - b.left) * k, y: (a.top - b.top) * k, w: a.width * k, h: a.height * k }; },
      sfx: (id, o) => playSound(id, o),
      html(h) { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; },
      btn(label, cls, fn) { const b = document.createElement('button'); b.className = `btn evu-btn ${cls || ''}`; b.innerHTML = `<span>${label}</span>`; b.addEventListener('click', () => { if (!b.disabled) fn(b); }); return b; },
      // カード1枚（できごとの中で使う、ふつうと同じ見た目）
      card(ch) { const { cls, html } = hud.cardOf(C.s, ch); const b = document.createElement('div'); b.className = `${cls} evu-card`; b.innerHTML = html; return b; },
      fit(node) { hud.fitLines(node); hud.snapIcons(node); },
      cometImg: (h = 48) => `<canvas class="evu-cim" width="32" height="32" data-h="${h}"></canvas>`,
      toast(text, cls = '') { toastEl.className = `evu-toast ${cls}`; toastEl.innerHTML = text; void toastEl.offsetWidth; toastEl.classList.add('in'); },
      done() { const cb = C.onDone; close(); if (cb) cb(); },
      wait,
    };
    return ctx;
  }

  return { open, close, get active() { return !!cur; } };
}

// ================================================================
//  背景の部品
// ================================================================
function nightSky(c, W, H, t, top = '#05071a', bottom = '#0b1236', stars = 60, seed = 1) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bottom);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < stars; i++) {
    const x = ((i * 97.3 + seed * 31) % 1) * W || ((i * 0.6180339 + seed * 0.13) % 1) * W, y = ((i * 0.7548776 + seed * 0.29) % 1) * H * 0.6;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i));
    c.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * tw})`; c.fillRect(x, y, 1.6, 1.6);
  }
}
// 提灯：ゆれて、ぽっと灯る
function lantern(c, x, y, r, t, lit, i) {
  const sway = Math.sin(t * 1.6 + i) * 0.08;
  c.save(); c.translate(x, y); c.rotate(sway);
  c.strokeStyle = '#2a1a10'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -r * 1.6); c.lineTo(0, -r * 0.9); c.stroke();
  if (lit > 0) { const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 3.2); g.addColorStop(0, `rgba(255,140,60,${0.45 * lit})`); g.addColorStop(1, 'rgba(255,100,40,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 3.2, 0, TAU); c.fill(); }
  c.fillStyle = lit > 0 ? `rgb(${200 + 55 * lit},${60 + 50 * lit},${40})` : '#4a1a14';
  c.beginPath(); c.ellipse(0, 0, r * 0.8, r, 0, 0, TAU); c.fill();
  c.strokeStyle = `rgba(0,0,0,0.35)`; c.lineWidth = 1;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(0, k * r * 0.32, r * 0.8 * Math.cos(Math.asin(clamp(Math.abs(k) * 0.32, 0, 0.99))), r * 0.06, 0, 0, TAU); c.stroke(); }
  c.fillStyle = '#1a0e08'; c.fillRect(-r * 0.45, -r * 1.08, r * 0.9, r * 0.18); c.fillRect(-r * 0.45, r * 0.9, r * 0.9, r * 0.18);
  if (lit > 0.5) { c.fillStyle = `rgba(40,10,0,${0.7 * lit})`; c.font = `${Math.round(r * 0.9)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('祭', 0, 0); }
  c.restore();
}
function firefly(c, W, H, t, n, col = '255,220,120') {
  for (let i = 0; i < n; i++) {
    const x = (Math.sin(t * 0.3 + i * 1.7) * 0.5 + 0.5) * W, y = H * (0.3 + 0.6 * ((i * 0.37 + t * 0.03) % 1));
    const a = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2 + i * 2.3));
    c.fillStyle = `rgba(${col},${a})`; c.beginPath(); c.arc(x, H - y + H * 0.3, 1.8, 0, TAU); c.fill();
  }
}

// ================================================================
//  できごと
// ================================================================
const SCENES = {
  // ---------------- 屋台：夜祭り。提灯が順に灯り、のれんの下に3枚。コメットで好きなだけ買える ----------------
  stall(x) {
    x.sfx('ev_stall');
    const L = 7;
    x.draw((c, t, W, H, u) => {
      nightSky(c, W, H, t, '#0a0616', '#1c0c1e', 50, 3);
      // 遠くの屋台の明かり
      for (let i = 0; i < 6; i++) { const g = c.createRadialGradient(W * (i / 5), H * 0.62, 0, W * (i / 5), H * 0.62, 60 * u); g.addColorStop(0, 'rgba(255,120,40,0.18)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
      // 提灯の列（左から順に灯る）
      c.strokeStyle = '#2a1a10'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(0, H * 0.06); c.quadraticCurveTo(W / 2, H * 0.12, W, H * 0.06); c.stroke();
      for (let i = 0; i < L; i++) { const px = W * (i + 0.5) / L, py = H * 0.06 + Math.sin(Math.PI * (i + 0.5) / L) * H * 0.045; lantern(c, px, py + 26 * u, 13 * u, t, clamp((t - 0.15 - i * 0.12) / 0.25), i); }
      // 屋台の屋根とのれん
      const top = H * 0.2;
      c.fillStyle = '#3a1f12'; c.fillRect(W * 0.06, top, W * 0.88, 14 * u);
      for (let i = 0; i < 6; i++) { const nx = W * 0.08 + i * W * 0.14; c.fillStyle = i % 2 ? '#a3181e' : '#f3ead8'; const wav = Math.sin(t * 2 + i) * 2 * u; c.fillRect(nx, top + 14 * u, W * 0.13, 30 * u + wav); }
      c.fillStyle = '#1b0f08'; c.font = `${Math.round(16 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('屋　台', W / 2, top + 30 * u);
      // 台
      c.fillStyle = '#5a3216'; c.fillRect(W * 0.04, H * 0.9, W * 0.92, H * 0.1);
      firefly(c, W, H, t, 14);
    });
    const choices = x.api.roll({ count: 3, floor: 'rare', noCurse: true });
    const wrap = x.html('<div class="evu-stall"></div>');
    const note = x.html(`<div class="evu-note">気になるカードを、コメットで買える（何枚でも）</div>`);
    x.body.append(note, wrap);
    choices.forEach((ch, i) => {
      const price = PRICE[ch.rarity] || 5;
      const row = x.html(`<div class="evu-shelf" style="animation-delay:${0.9 + i * 0.15}s"></div>`);
      const card = x.card(ch);
      const tag = x.html(`<button class="evu-price"><span class="evu-ptop">${x.cometImg(COMET_HUES[i])}<b>${price}</b></span><small>買う</small></button>`);
      const sync = () => { const ok = x.s.comets >= price; tag.classList.toggle('cant', !ok && !row.classList.contains('sold')); };
      tag.addEventListener('click', () => {
        if (row.classList.contains('sold')) return;
        if (x.s.comets < price) { tag.classList.remove('shake'); void tag.offsetWidth; tag.classList.add('shake'); x.sfx('ev_coin', { pitch: 0.6 }); x.toast('コメットが足りない…', 'bad'); return; }
        x.api.addComets(-price); x.api.give(ch); x.sfx('ev_buy');
        row.classList.add('sold'); tag.innerHTML = '<b class="evu-sold">売り切れ</b>';
        x.toast('お買い上げ！');
        wrap.querySelectorAll('.evu-price').forEach((b) => b._sync && b._sync());
      });
      tag._sync = sync; sync();
      row.append(card, tag); wrap.appendChild(row);
    });
    x.fit(wrap);
    const go = x.btn('店を出る', 'btn-sub', () => x.done());
    x.body.appendChild(x.html('<div class="evu-foot"></div>')).appendChild(go);
  },

  // ---------------- ミニガチャ：カプセルの機械。最初の1回はタダ。レバーを回すとカプセルが転がり出て、割れる ----------------
  minigacha(x) {
    x.sfx('ev_crank');
    // ガラスの玉の下半分に、カプセルを山に積む（レバーを回すと、ゆれて跳ねる）
    const caps = [];
    [5, 5, 4, 3].forEach((n, row) => { for (let i = 0; i < n; i++) caps.push({ x: 0.5 + (i - (n - 1) / 2) * 0.17, y: 0.84 - row * 0.15, h: [200, 48, 352, 140, 285, 20][(i * 3 + row) % 6], r: ((i * 1.7 + row) % 2) - 1, jy: 0, jv: 0 }); });
    let crank = 0, drop = null, shake = 0;
    const st = { free: 1 };
    x.draw((c, t, W, H, u) => {
      const g = c.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, H * 0.7); g.addColorStop(0, '#2a1436'); g.addColorStop(1, '#07040f'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 光の点（遊園地っぽく）
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, on = (Math.floor(t * 6) + i) % 3 === 0; c.fillStyle = on ? '#ffd84a' : '#5a4420'; c.beginPath(); c.arc(W / 2 + Math.cos(a) * 128 * u, H * 0.3 + Math.sin(a) * 118 * u, 3 * u, 0, TAU); c.fill(); }
      const cx = W / 2, cy = H * 0.27, R = 78 * u;
      const sx = shake > 0 ? (Math.random() - 0.5) * shake * u : 0;
      c.save(); c.translate(sx, 0);
      // ガラスの玉の中のカプセル（はねる）
      c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
      c.fillStyle = 'rgba(120,180,255,0.08)'; c.fillRect(cx - R, cy - R, R * 2, R * 2);
      for (const p of caps) {
        if (shake > 4 && Math.random() < 0.25) p.jv = -(0.6 + Math.random() * 0.8);
        p.jv += 3 / 60; p.jy = Math.min(0, p.jy + p.jv / 60); if (p.jy === 0) p.jv = 0;
        const px = cx - R + p.x * R * 2, py = cy - R + (p.y + p.jy) * R * 2;
        capsule(c, px, py, 13 * u, p.h, p.r + Math.sin(t * 0.7 + p.x * 9) * 0.05 + p.jy * 3);
      }
      c.restore();
      c.strokeStyle = 'rgba(200,230,255,0.7)'; c.lineWidth = 3 * u; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.ellipse(cx - R * 0.4, cy - R * 0.45, R * 0.25, R * 0.12, -0.6, 0, TAU); c.fill();
      // 本体
      c.fillStyle = '#d8283a'; c.fillRect(cx - R * 0.95, cy + R * 0.85, R * 1.9, R * 1.05);
      c.strokeStyle = '#7a0f18'; c.lineWidth = 3 * u; c.strokeRect(cx - R * 0.95, cy + R * 0.85, R * 1.9, R * 1.05);
      c.fillStyle = '#fff'; c.font = `${Math.round(13 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.fillText('ミニガチャ', cx, cy + R * 1.08);
      // レバー（回る）
      c.save(); c.translate(cx + R * 0.45, cy + R * 1.45); c.rotate(crank);
      c.fillStyle = '#f3f3f3'; c.beginPath(); c.arc(0, 0, 14 * u, 0, TAU); c.fill(); c.fillStyle = '#999'; c.fillRect(-3 * u, -14 * u, 6 * u, 28 * u); c.restore();
      // 出口
      c.fillStyle = '#300'; c.beginPath(); c.arc(cx - R * 0.45, cy + R * 1.5, 13 * u, 0, TAU); c.fill();
      c.restore();
      if (shake > 0) shake = Math.max(0, shake - 0.4);
      // 出てきたカプセル：転がって、ゆれて、割れる
      if (drop) {
        const k = (performance.now() - drop.t0) / 1000;
        const ox = cx - R * 0.45, oy = cy + R * 1.5, tx = cx, ty = H * 0.62;
        const p = ease(k / 0.7), px = ox + (tx - ox) * p, py = oy + (ty - oy) * p - Math.sin(p * Math.PI) * 50 * u;
        const wob = k > 0.7 && k < 1.5 ? Math.sin(k * 30) * 0.25 * clamp((k - 0.7) / 0.3) : 0;
        const opened = k > 1.5 ? clamp((k - 1.5) / 0.25) : 0;
        if (opened < 1) capsule(c, px, py, 26 * u, drop.h, k * 8 * (1 - p) + wob, opened);
        if (opened > 0) {
          // 割れた光
          const col = drop.col;
          for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + k; c.strokeStyle = col === 'rainbow' ? `hsla(${i * 22 + k * 200},90%,65%,${0.8 * (1 - opened * 0.5)})` : col; c.globalAlpha = 0.8 - opened * 0.4; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(tx + Math.cos(a) * 20 * u, ty + Math.sin(a) * 20 * u); c.lineTo(tx + Math.cos(a) * (40 + 90 * opened) * u, ty + Math.sin(a) * (40 + 90 * opened) * u); c.stroke(); }
          c.globalAlpha = 1;
        }
      }
    });
    const res = x.html('<div class="evu-gres"></div>');
    const note = x.html('<div class="evu-note">最初の1回はタダ。あとは コメット3個で1回</div>');
    const bar = x.html('<div class="evu-foot evu-gbar"></div>');
    const RAR = ['normal', 'rare', 'super', 'mythic'];
    let busy = false;
    const pull = async (times) => {
      if (busy) return;
      const cost = st.free > 0 ? 0 : times === 5 ? 12 : 3 * times;
      if (x.s.comets < cost) { x.toast('コメットが足りない…', 'bad'); x.sfx('ev_coin', { pitch: 0.6 }); return; }
      busy = true; bar.classList.add('busy');
      if (st.free > 0) { st.free = 0; } else x.api.addComets(-cost);
      if (cost) x.sfx('ev_coin');
      for (let k = 0; k < times; k++) {
        const ch = x.api.roll({ count: 1, noCurse: true })[0];
        if (!ch) break;
        res.innerHTML = '';
        // レバー：ぐるっと回す・機械がゆれる
        x.sfx('ev_crank'); shake = 8;
        for (let f = 0; f < 20; f++) { crank += 0.16; await wait(16); }
        const h = { normal: 210, rare: 140, super: 275, mythic: 48 }[ch.rarity];
        drop = { t0: performance.now(), h, col: RAR_COL[ch.rarity] };
        await wait(1500);
        x.sfx('ev_capsule', { pitch: 1 + RAR.indexOf(ch.rarity) * 0.12 });
        if (ch.rarity === 'mythic') x.sfx('gssr'); else if (ch.rarity === 'super') x.sfx('gsr');
        await wait(260);
        const card = x.card(ch); card.classList.add('evu-pop');
        x.api.give(ch);
        res.appendChild(card); x.fit(res);
        await wait(times > 1 ? 900 : 500);
        drop = null;
      }
      busy = false; bar.classList.remove('busy'); sync();
    };
    const b1 = x.btn(`1回　${'<i class="evu-cost">タダ</i>'}`, '', () => pull(1));
    const b5 = x.btn('5回　<i class="evu-cost">12</i>', 'btn-sub', () => pull(5));
    const go = x.btn('やめる', 'btn-sub', () => x.done());
    const sync = () => { b1.querySelector('.evu-cost').textContent = st.free ? 'タダ' : '3'; b1.disabled = !st.free && x.s.comets < 3; b5.disabled = st.free > 0 || x.s.comets < 12; b5.classList.toggle('dim', b5.disabled); b1.classList.toggle('dim', b1.disabled); };
    sync();
    bar.append(b1, b5, go);
    x.body.append(x.html('<div class="evu-spacer"></div>'), res, note, bar);
  },

  // ---------------- 泉：月夜の森の泉。光の玉が3つ浮かび、1つを選ぶと泉に溶けて効く ----------------
  spring(x) {
    x.sfx('ev_spring');
    const orbs = [
      { key: 'hp', name: '命の水', sub: '最大HP +15%', col: [255, 110, 140] },
      { key: 'heal', name: '癒しの水', sub: 'HPを全回復', col: [110, 255, 170] },
      { key: 'comet', name: '星の水', sub: 'コメット +6', col: [140, 200, 255] },
    ];
    let chosen = -1, dive = 0, splash = 0;
    const rip = [];
    x.draw((c, t, W, H, u) => {
      nightSky(c, W, H, t, '#020611', '#04121f', 70, 7);
      // 月
      const mx = W * 0.8, my = H * 0.13;
      const mg = c.createRadialGradient(mx, my, 0, mx, my, 90 * u); mg.addColorStop(0, 'rgba(255,250,220,0.35)'); mg.addColorStop(1, 'rgba(255,250,220,0)');
      c.fillStyle = mg; c.beginPath(); c.arc(mx, my, 90 * u, 0, TAU); c.fill();
      c.fillStyle = '#fffbe6'; c.beginPath(); c.arc(mx, my, 24 * u, 0, TAU); c.fill();
      c.fillStyle = 'rgba(200,190,150,0.35)'; for (const [dx, dy, r] of [[-7, -5, 5], [6, 4, 4], [-2, 9, 3]]) { c.beginPath(); c.arc(mx + dx * u, my + dy * u, r * u, 0, TAU); c.fill(); }
      // 森：奥（青い）と手前（黒い）の針葉樹。泉の両側をかこむ
      const tree = (bx, by, h, col) => { c.fillStyle = col; for (let k = 0; k < 3; k++) { const w = h * (0.34 - k * 0.07), y0 = by - h * (0.32 * k), y1 = y0 - h * 0.5; c.beginPath(); c.moveTo(bx - w, y0); c.lineTo(bx, y1); c.lineTo(bx + w, y0); c.fill(); } c.fillRect(bx - h * 0.03, by, h * 0.06, h * 0.12); };
      for (let i = 0; i < 12; i++) tree((i / 11) * W + Math.sin(i * 3.1) * 10 * u, H * 0.52, H * (0.2 + 0.05 * Math.sin(i * 1.7)), '#0a1a2e');
      c.fillStyle = '#0a1a2e'; c.fillRect(0, H * 0.52, W, H * 0.1);
      for (let i = 0; i < 7; i++) { const side = i < 4 ? i / 3 * 0.28 : 0.72 + (i - 4) / 2 * 0.28; tree(side * W, H * 0.62, H * (0.3 + 0.06 * Math.sin(i * 2.3)), '#02070d'); }
      c.fillStyle = '#02070d'; c.fillRect(0, H * 0.6, W, H * 0.4);
      // 草の縁（ゆれる）
      c.strokeStyle = '#0b2a22'; c.lineWidth = 1.5 * u;
      for (let i = 0; i < 70; i++) { const gx = (i / 69) * W, gy = H * 0.6 + Math.sin(i * 5.3) * 4 * u, sw = Math.sin(t * 1.5 + i) * 3 * u; c.beginPath(); c.moveTo(gx, gy + 6 * u); c.quadraticCurveTo(gx, gy, gx + sw, gy - 10 * u); c.stroke(); }
      // 泉
      const px = W / 2, py = H * 0.68, pr = W * 0.42;
      const pg = c.createRadialGradient(px, py, 0, px, py, pr); pg.addColorStop(0, 'rgba(120,230,255,0.55)'); pg.addColorStop(1, 'rgba(20,80,140,0.35)');
      c.fillStyle = pg; c.beginPath(); c.ellipse(px, py, pr, pr * 0.28, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(180,240,255,0.5)'; c.lineWidth = 1.5 * u; c.stroke();
      // 月の映り
      c.fillStyle = 'rgba(255,250,220,0.35)'; c.beginPath(); c.ellipse(px + pr * 0.4, py, 18 * u, 4 * u, 0, 0, TAU); c.fill();
      // 波紋
      if (Math.random() < 0.03) rip.push({ x: px + (Math.random() - 0.5) * pr, y: py + (Math.random() - 0.5) * pr * 0.2, k: 0 });
      for (const r0 of rip) { r0.k += 1 / 60; c.strokeStyle = `rgba(200,250,255,${0.5 * (1 - r0.k)})`; c.lineWidth = 1.2 * u; c.beginPath(); c.ellipse(r0.x, r0.y, r0.k * 50 * u, r0.k * 14 * u, 0, 0, TAU); c.stroke(); }
      while (rip.length && rip[0].k > 1) rip.shift();
      // 立ちのぼる光の粒
      for (let i = 0; i < 26; i++) { const k = (t * 0.25 + i * 0.137) % 1, ax = px + Math.sin(i * 2.7) * pr * 0.8, ay = py - k * H * 0.5; c.fillStyle = `rgba(180,250,255,${0.6 * (1 - k)})`; c.beginPath(); c.arc(ax + Math.sin(t + i) * 6 * u, ay, 1.6 * u, 0, TAU); c.fill(); }
      // 浮かぶ光の玉
      orbs.forEach((o, i) => {
        let ox = W * (0.22 + i * 0.28), oy = H * 0.42 + Math.sin(t * 1.6 + i * 2) * 8 * u, sc = 1;
        if (chosen === i) { const k = clamp(dive); ox += (px - ox) * ease(k); oy += (py - oy) * k * k; sc = 1 - k * 0.6; }
        else if (chosen >= 0) sc = 1 - clamp(dive) ;
        if (sc <= 0.02) return;
        const [r, g, b] = o.col, rr = 22 * u * sc * (1 + 0.06 * Math.sin(t * 3 + i));
        const og = c.createRadialGradient(ox, oy, 0, ox, oy, rr * 2.6); og.addColorStop(0, `rgba(${r},${g},${b},0.9)`); og.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`); og.addColorStop(1, `rgba(${r},${g},${b},0)`);
        c.fillStyle = og; c.beginPath(); c.arc(ox, oy, rr * 2.6, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(ox, oy, rr * 0.45, 0, TAU); c.fill();
      });
      if (chosen >= 0) dive += 1 / 60 / 0.8;
      // しぶき
      if (splash > 0) {
        const k = 1 - splash, [r, g, b] = orbs[chosen].col;
        for (let i = 0; i < 18; i++) { const a = -Math.PI * (0.1 + 0.8 * (i / 17)); c.fillStyle = `rgba(${r},${g},${b},${1 - k})`; c.beginPath(); c.arc(px + Math.cos(a) * k * 90 * u, py + Math.sin(a) * k * 120 * u + k * k * 80 * u, 3 * u, 0, TAU); c.fill(); }
        c.strokeStyle = `rgba(${r},${g},${b},${1 - k})`; c.lineWidth = 3 * u; c.beginPath(); c.ellipse(px, py, k * pr, k * pr * 0.28, 0, 0, TAU); c.stroke();
        splash -= 1 / 60 / 1.2;
      }
    });
    const note = x.html('<div class="evu-note">泉の光を、1つだけ受けとれる</div>');
    const row = x.html('<div class="evu-orbs"></div>');
    orbs.forEach((o, i) => {
      const b = x.html(`<button class="evu-orb" style="--oc:rgb(${o.col.join(',')})"><b>${o.name}</b><small>${o.sub}</small></button>`);
      b.addEventListener('click', async () => {
        if (chosen >= 0) return;
        chosen = i; row.classList.add('chosen'); b.classList.add('on');
        x.sfx('ev_spring', { pitch: 1.2 });
        await wait(800);
        splash = 1; x.sfx('ev_capsule', { pitch: 0.7 });
        if (o.key === 'hp') x.api.hpUp(0.15);
        if (o.key === 'heal') x.api.heal(1);
        if (o.key === 'comet') x.api.addComets(6);
        x.toast(`${o.name}：${o.sub}`);
        await wait(900);
        foot.appendChild(x.btn('すすむ', '', () => x.done()));
      });
      row.appendChild(b);
    });
    const foot = x.html('<div class="evu-foot"></div>');
    x.body.append(x.html('<div class="evu-spacer"></div>'), note, row, foot);
  },

  // ---------------- 呪いの祭壇：石の祭壇に紫の炎。呪いを受ければ、伏せた2枚のカードが開く ----------------
  altar(x) {
    x.sfx('ev_altar');
    const curse = x.api.pickCurse();
    const rewards = x.api.roll({ count: 2, floor: 'super', noCurse: true });
    let accepted = 0, cardEl = null;
    x.draw((c, t, W, H, u) => {
      if (!accepted || !cardEl._r) cardEl && (cardEl._r = x.rect(cardEl));
      const cr = cardEl && cardEl._r, ccx = cr ? cr.x + cr.w / 2 : W / 2, ccy = cr ? cr.y + cr.h / 2 : H * 0.36;
      const g = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.8); g.addColorStop(0, '#1d0a2a'); g.addColorStop(1, '#040108'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 回る呪文の輪
      c.save(); c.translate(ccx, ccy); c.rotate(t * 0.2);
      c.strokeStyle = `rgba(190,90,255,${0.35 + 0.15 * Math.sin(t * 2)})`; c.lineWidth = 1.5 * u;
      c.beginPath(); c.arc(0, 0, 120 * u, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, 100 * u, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(210,140,255,0.7)'; c.font = `${Math.round(12 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const glyph = '呪縛贄禍怨冥魔契';
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.save(); c.rotate(a); c.fillText(glyph[i % glyph.length], 0, -110 * u); c.restore(); }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU * 2; c.beginPath(); c.moveTo(Math.cos(a - Math.PI / 2) * 100 * u, Math.sin(a - Math.PI / 2) * 100 * u); const b = ((i + 1) / 5) * TAU * 2; c.lineTo(Math.cos(b - Math.PI / 2) * 100 * u, Math.sin(b - Math.PI / 2) * 100 * u); c.stroke(); }
      c.restore();
      // 祭壇
      const ax = ccx, ay = cr ? cr.y + cr.h + 16 * u : H * 0.5, half = cr ? cr.w / 2 + 16 * u : 150 * u;
      c.fillStyle = '#1c1a22'; c.fillRect(ax - half - 12 * u, ay - 30 * u, (half + 12 * u) * 2, 30 * u); c.fillStyle = '#2a2632'; c.fillRect(ax - half - 22 * u, ay, (half + 22 * u) * 2, 12 * u);
      c.strokeStyle = '#4a3a5a'; c.lineWidth = 1.5 * u; c.strokeRect(ax - half - 12 * u, ay - 30 * u, (half + 12 * u) * 2, 30 * u);
      c.fillStyle = 'rgba(150,90,200,0.5)'; c.font = `${Math.round(10 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('― 贄を捧げよ ―', ax, ay - 15 * u);
      // ろうそくと紫の炎
      for (const [sx, hh] of [[-1, 70], [1, 70], [-0.86, 44], [0.86, 44]]) {
        const cx = ax + sx * half, cy = ay - 30 * u - hh * u;
        c.fillStyle = '#ddd2c0'; c.fillRect(cx - 5 * u, cy, 10 * u, hh * u);
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(cx - 5 * u, cy, 3 * u, hh * u);
        const f = 1 + 0.15 * Math.sin(t * 13 + sx) + (accepted ? 0.8 : 0);
        const fg = c.createRadialGradient(cx, cy - 30 * u, 0, cx, cy - 30 * u, 16 * u * f); fg.addColorStop(0, 'rgba(255,220,255,0.95)'); fg.addColorStop(0.4, 'rgba(180,70,255,0.8)'); fg.addColorStop(1, 'rgba(120,20,200,0)');
        c.fillStyle = fg; c.beginPath(); c.ellipse(cx, cy - 30 * u, 7 * u * f, 14 * u * f, 0, 0, TAU); c.fill();
      }
      // 受けたとき：紫の煙が本体（下）へ吸いこまれる
      if (accepted) {
        const k = (performance.now() - accepted) / 1000;
        for (let i = 0; i < 40; i++) { const p = clamp(k * 0.8 - i * 0.012); if (p <= 0 || p >= 1) continue; const a = i * 2.4; c.fillStyle = `rgba(170,60,255,${0.5 * (1 - p)})`; c.beginPath(); c.arc(ccx + Math.cos(a) * 80 * u * (1 - p), ccy + (H - ccy) * p + Math.sin(a) * 30 * u, (10 - 6 * p) * u, 0, TAU); c.fill(); }
      }
    });
    const curseCard = x.card({ id: curse.id, kind: 'curse', rarity: 'super' }); curseCard.classList.add('evu-cursed'); cardEl = curseCard;
    const rw = x.html('<div class="evu-rewards"></div>');
    rewards.forEach((ch) => { const back = x.html('<div class="evu-facedown"><span>？</span></div>'); back._ch = ch; rw.appendChild(back); });
    const note = x.html('<div class="evu-note">この呪いを受ければ、伏せた2枚が手に入る</div>');
    const foot = x.html('<div class="evu-foot"></div>');
    const yes = x.btn('呪いを受ける', 'evu-danger', async () => {
      yes.disabled = no.disabled = true; foot.classList.add('busy');
      accepted = performance.now();
      x.sfx('ev_curse'); curseCard.classList.add('absorb');
      x.api.curse(curse.id);
      await wait(1100);
      for (const back of rw.children) {
        const card = x.card(back._ch); card.classList.add('evu-flip');
        x.api.give(back._ch); back.replaceWith(card); x.fit(rw);
        x.sfx(back._ch.rarity === 'mythic' ? 'gssr' : 'gsr');
        await wait(500);
      }
      x.toast(`呪い「${CURSE_BY_ID[curse.id].name}」と引きかえに、2枚を手に入れた`);
      foot.innerHTML = ''; foot.appendChild(x.btn('すすむ', '', () => x.done()));
    });
    const no = x.btn('立ち去る', 'btn-sub', () => x.done());
    foot.append(yes, no);
    x.body.append(x.html('<div class="evu-spacer s"></div>'), curseCard, note, rw, foot);
    x.fit(x.body);
  },

  // ---------------- 盗っ人：屋根の上を、ほおかむりの影が走り抜け、コメットが風呂敷へ吸いこまれる ----------------
  thief(x) {
    x.sfx('ev_thief');
    const before = x.s.comets, n = x.api.stealHalf();
    const flying = Array.from({ length: Math.min(n, 24) }, (_, i) => ({ d: 0.25 + i * 0.035, h: COMET_HUES[i % 5] }));
    x.draw((c, t, W, H, u) => {
      nightSky(c, W, H, t, '#04040c', '#101424', 60, 9);
      // 満月
      const mx = W * 0.5, my = H * 0.27;
      const mg = c.createRadialGradient(mx, my, 0, mx, my, 120 * u); mg.addColorStop(0, 'rgba(255,240,190,0.3)'); mg.addColorStop(1, 'rgba(255,240,190,0)'); c.fillStyle = mg; c.beginPath(); c.arc(mx, my, 120 * u, 0, TAU); c.fill();
      c.fillStyle = '#fff6d8'; c.beginPath(); c.arc(mx, my, 62 * u, 0, TAU); c.fill();
      c.fillStyle = 'rgba(210,190,140,0.35)'; for (const [dx, dy, r] of [[-20, -14, 12], [18, 10, 9], [-6, 26, 7], [26, -22, 6]]) { c.beginPath(); c.arc(mx + dx * u, my + dy * u, r * u, 0, TAU); c.fill(); }
      // 雲が流れる
      c.fillStyle = 'rgba(20,24,44,0.85)'; for (let i = 0; i < 3; i++) { const cx = ((t * 12 * u + i * W * 0.45) % (W + 200 * u)) - 100 * u, cy = H * (0.16 + i * 0.09); c.beginPath(); c.ellipse(cx, cy, 70 * u, 9 * u, 0, 0, TAU); c.ellipse(cx + 30 * u, cy - 6 * u, 40 * u, 8 * u, 0, 0, TAU); c.fill(); }
      // 屋根の列
      c.fillStyle = '#05060c';
      for (let i = 0; i < 5; i++) { const rx = i * W * 0.25 - 20 * u, ry = H * (0.5 + (i % 2) * 0.04); c.beginPath(); c.moveTo(rx, ry + 30 * u); c.lineTo(rx + W * 0.14, ry); c.lineTo(rx + W * 0.3, ry + 30 * u); c.lineTo(rx + W * 0.3, H); c.lineTo(rx, H); c.fill(); }
      // 盗っ人：左から右へ駆け抜ける（月の前を横切る）
      // 屋根を駆けて、月の前を大きく跳び、向こうの屋根へ
      const k = clamp((t - 0.2) / 2.0), tx = -50 * u + (W + 100 * u) * k;
      const jump = clamp((k - 0.28) / 0.44), ty = H * 0.47 - (jump > 0 && jump < 1 ? Math.sin(jump * Math.PI) * H * 0.2 : Math.abs(Math.sin(k * 30)) * 8 * u);
      thiefFig(c, tx, ty, u * 1.5, t, jump > 0 && jump < 1);
      // コメットが盗っ人の風呂敷へ吸いこまれる
      for (const f of flying) {
        const p = clamp((t - f.d) / 0.6); if (p <= 0 || p >= 1) continue;
        const sx = W / 2 + Math.sin(f.d * 40) * 60 * u, sy = H * 0.8;
        drawComet(c, sx + (tx - 18 * u - sx) * ease(p), sy + (ty - 40 * u - sy) * ease(p) - Math.sin(p * Math.PI) * 60 * u, 7 * u, f.h, t * 4, p * 6);
      }
      // 走ったあとの煙
      for (let i = 0; i < 8; i++) { const p = k - i * 0.03; if (p < 0 || p > 1 || (p > 0.28 && p < 0.72)) continue; const sx = -50 * u + (W + 100 * u) * p; c.fillStyle = `rgba(160,160,180,${0.25 * (1 - i / 8)})`; c.beginPath(); c.arc(sx - 20 * u, H * 0.49, (6 + i * 2) * u, 0, TAU); c.fill(); }
    });
    x.body.append(x.html('<div class="evu-spacer"></div>'));
    (async () => {
      await wait(400);
      x.sfx('ev_coin'); await wait(500); x.sfx('ev_coin', { pitch: 0.85 }); await wait(500); x.sfx('ev_coin', { pitch: 0.7 });
      await wait(400);
      x.body.append(x.html(`<div class="evu-big bad">コメットを <b>${n}</b> 個<br>盗まれた！</div>`), x.html(`<div class="evu-note">${before} → ${before - n}</div>`));
      const f = x.html('<div class="evu-foot"></div>'); f.appendChild(x.btn('くやしい…', 'btn-sub', () => x.done())); x.body.appendChild(f);
    })();
  },

  // ---------------- 待ち伏せ：暗い茂みに、赤い目が次々と開く。大きな2つの影が立ち上がる ----------------
  ambush(x) {
    x.api.next('ambush', 2);
    const eyes = Array.from({ length: 22 }, (_, i) => ({ x: Math.random(), y: 0.55 + Math.random() * 0.4, d: 0.3 + Math.random() * 1.6, s: 0.6 + Math.random() * 0.8, b: Math.random() * 6 }));
    setTimeout(() => x.sfx('ev_ambush'), 1300);
    x.draw((c, t, W, H, u) => {
      c.fillStyle = '#030104'; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.7); vg.addColorStop(0, 'rgba(70,0,10,0.4)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      // 大きな2つの影（中ボス）：下からゆっくり立ち上がる
      const rise = ease((t - 1.2) / 1.2);
      for (const [sx, ph] of [[0.3, 0], [0.7, 1.3]]) {
        const bx = W * sx, by = H * 0.78 - rise * H * 0.3 + Math.sin(t * 1.5 + ph) * 3 * u, br = 62 * u;
        c.save(); c.shadowColor = `rgba(255,30,40,${0.9 * rise})`; c.shadowBlur = 26 * u;
        c.fillStyle = '#14030a'; c.beginPath();
        for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU - Math.PI / 2, rr = br * (i % 2 ? 0.82 : 1.08) * (1 + 0.04 * Math.sin(t * 3 + i)); c.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr); }
        c.closePath(); c.fill(); c.restore();
        c.strokeStyle = `rgba(255,60,60,${0.7 * rise})`; c.lineWidth = 2 * u; c.stroke();
        if (rise > 0.6) { const eo = clamp((t - 2.0) / 0.2); for (const ex of [-0.35, 0.35]) { c.fillStyle = `rgba(255,30,40,${eo})`; c.shadowColor = '#ff1a2a'; c.shadowBlur = 16 * u; c.beginPath(); c.ellipse(bx + ex * br, by - br * 0.15, 8 * u, 4 * u * eo, ex * 0.6, 0, TAU); c.fill(); } c.shadowBlur = 0; }
      }
      // 茂み
      c.fillStyle = '#060a06';
      for (let i = 0; i < 14; i++) { const bx = (i / 13) * W, by = H * (0.62 + 0.06 * Math.sin(i * 1.9)); c.beginPath(); c.arc(bx, by, 50 * u, Math.PI, 0); c.fill(); }
      c.fillRect(0, H * 0.62, W, H * 0.4);
      // 茂みの中の赤い目（順に開いて、まばたきする）
      for (const e of eyes) {
        if (t < e.d) continue;
        const blink = (t + e.b) % 3.2 < 0.12 ? 0.1 : 1, o = clamp((t - e.d) / 0.2) * blink;
        const ex = e.x * W, ey = e.y * H, sz = 4 * u * e.s;
        c.fillStyle = `rgba(255,40,40,${0.85 * o})`;
        c.beginPath(); c.ellipse(ex - sz * 1.4, ey, sz, sz * 0.55 * o, -0.2, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(ex + sz * 1.4, ey, sz, sz * 0.55 * o, 0.2, 0, TAU); c.fill();
      }
      // 画面のふちが赤く脈打つ
      const pul = 0.25 + 0.15 * Math.sin(t * 4);
      const eg = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); eg.addColorStop(0, 'rgba(120,0,0,0)'); eg.addColorStop(1, `rgba(120,0,10,${pul})`); c.fillStyle = eg; c.fillRect(0, 0, W, H);
    });
    x.body.append(x.html('<div class="evu-spacer"></div>'));
    (async () => {
      await wait(2300);
      x.body.append(x.html('<div class="evu-big bad">待ち伏せだ！</div>'), x.html('<div class="evu-note">次のフェーズ、中ボスが2体待ちかまえている</div>'));
      const f = x.html('<div class="evu-foot"></div>'); f.appendChild(x.btn('受けて立つ', 'evu-danger', () => x.done())); x.body.appendChild(f);
    })();
  },
};

// カプセル（上が色つき、下が白。open：割れて上下に開く）
function capsule(c, x, y, r, hue, rot = 0, open = 0) {
  c.save(); c.translate(x, y); c.rotate(rot);
  const gap = open * r * 0.8;
  c.fillStyle = `hsl(${hue},85%,58%)`; c.beginPath(); c.arc(0, -gap, r, Math.PI, 0); c.closePath(); c.fill();
  c.fillStyle = '#f4f4f8'; c.beginPath(); c.arc(0, gap, r, 0, Math.PI); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-r, -gap); c.lineTo(r, -gap); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-r * 0.35, -r * 0.45 - gap, r * 0.28, r * 0.14, -0.5, 0, TAU); c.fill();
  if (!open) { c.strokeStyle = 'rgba(20,10,30,0.55)'; c.lineWidth = Math.max(1, r * 0.1); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
  c.restore();
}
// 盗っ人：ほおかむりの影が、風呂敷をかついで走る
function thiefFig(c, x, y, u, t, air = false) {
  const leg = air ? 0.9 : Math.sin(t * 22) * 0.7;
  c.save(); c.translate(x, y); c.fillStyle = '#000';
  c.strokeStyle = '#000'; c.lineWidth = 5 * u; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(leg) * 14 * u, 22 * u); c.moveTo(0, 0); c.lineTo(-Math.sin(leg) * 14 * u, 22 * u); c.stroke();
  c.beginPath(); c.ellipse(0, -14 * u, 9 * u, 16 * u, 0.25, 0, TAU); c.fill();
  c.beginPath(); c.arc(4 * u, -34 * u, 8 * u, 0, TAU); c.fill();
  // ほおかむり（白い唐草）と、風呂敷
  c.fillStyle = '#1f7a3a'; c.beginPath(); c.arc(-12 * u, -26 * u, 13 * u, 0, TAU); c.fill();
  c.strokeStyle = '#d8f0dc'; c.lineWidth = 1.2 * u; for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(-12 * u + (k - 1) * 6 * u, -26 * u, 3 * u, 0, Math.PI * 1.5); c.stroke(); }
  c.fillStyle = '#fff'; c.fillRect(5 * u, -36 * u, 5 * u, 2 * u);
  c.restore();
}
