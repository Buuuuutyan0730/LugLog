// できごとの画面（フェーズクリアのあと、カード選びの代わりに出る）
//   できごとごとに、背景の絵・始まりの動き・中身の遊び方を1つずつ作る（使い回しの型にはしない）
//   共通なのは、外枠（背景のキャンバス・上のコメットの数・ボタンの見た目）だけ
import { EVENT_BY_ID, KIND_LABEL, RAR_LABEL, drawComet, COMET_HUES } from './events.js?v=20261127034938';
import { playSound } from './audio.js?v=20261127034938';
import { CURSE_BY_ID } from './talents.js?v=20261127034938';
import { SKILL_BY_ID, SKILL_MAX } from './skilldefs.js?v=20261127034938';
import { rarityOfLevel } from './ui.js?v=20261127034938';

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (u) => 1 - (1 - clamp(u)) ** 3;
const back = (u) => { u = clamp(u); const c = 1.7; return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2; };
// 待つ：できごとを閉じたり切り替えたりしたら、待っている続きは二度と動かない（前の画面の文字や音が、次の画面に出ないように）
let GEN = 0;
const wait = (ms) => { const g = GEN; return new Promise((r) => setTimeout(() => { if (g === GEN) r(); }, ms)); };
const RAR_COL = { normal: '#9fb0ff', rare: '#4cf08a', super: '#c7a6ff', mythic: 'rainbow' };
const PRICE = { normal: 3, rare: 5, super: 8, mythic: 12 };
const cometIcon = (n) => `<i class="evu-ci" data-n="${n}"></i>`;
// 文字を「見た目の真ん中」に置く（フォントによって、middle だと上下左右にずれるため、字の形の大きさを測って合わせる）
function textPos(c, s, x, y) {
  const al = c.textAlign; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  const m = c.measureText(s), L = m.actualBoundingBoxLeft || 0, R = m.actualBoundingBoxRight || m.width, A = m.actualBoundingBoxAscent || 0, D = m.actualBoundingBoxDescent || 0;
  const gx = al === 'right' || al === 'end' ? x - R : al === 'left' || al === 'start' ? x + L : x - (R - L) / 2;
  return [al, gx, y + (A - D) / 2];
}
// 「ここをさわる」の目印：上下にはねる矢印と、ひとこと
function tapHint(c, x, y, u, t, label = 'タップ') {
  const b = Math.abs(Math.sin(t * 4)) * 6 * u;
  c.save(); c.globalAlpha = 0.95;
  c.fillStyle = '#fff'; c.strokeStyle = '#10142a'; c.lineWidth = 3 * u; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x, y - b); c.lineTo(x - 9 * u, y - 12 * u - b); c.lineTo(x + 9 * u, y - 12 * u - b); c.closePath(); c.stroke(); c.fill();
  c.font = `${Math.round(12 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center';
  c.strokeText !== undefined && strokeC(c, label, x, y - 22 * u - b); fillC(c, label, x, y - 22 * u - b);
  c.restore();
}
function fillC(c, s, x, y) { const [al, gx, gy] = textPos(c, s, x, y); c.fillText(s, gx, gy); c.textAlign = al; }
function strokeC(c, s, x, y) { const [al, gx, gy] = textPos(c, s, x, y); c.strokeText(s, gx, gy); c.textAlign = al; }

export function createEventUI(stage, hud) {
  const root = document.createElement('div');
  root.className = 'evu';
  root.innerHTML = `<canvas class="evu-bg"></canvas>
    <div class="evu-head"><b class="evu-title"></b></div>
    <div class="evu-wallet"><canvas width="48" height="48"></canvas><b>0</b></div>
    <div class="evu-body"></div>
    <div class="evu-foot"></div>
    <div class="evu-toast"></div>`;
  stage.appendChild(root);
  const cv = root.querySelector('.evu-bg'), c = cv.getContext('2d');
  let body = root.querySelector('.evu-body'), footEl = root.querySelector('.evu-foot'); const toastEl = root.querySelector('.evu-toast');
  const wallet = root.querySelector('.evu-wallet'), wc = wallet.querySelector('canvas').getContext('2d');
  let cur = null, raf = 0;
  // 絵（キャンバス）を直接さわる：宝箱・コイン・レバーなど。座標はキャンバスの画素
  const toCv = (e) => { const b = cv.getBoundingClientRect(), k = cv.width / Math.max(1, b.width); return [(e.clientX - b.left) * k, (e.clientY - b.top) * k]; };
  let dragging = null;
  cv.addEventListener('pointerdown', (e) => { if (!cur) return; const [px, py] = toCv(e); if (cur.drag && cur.drag.down && cur.drag.down(px, py)) { dragging = cur.drag; cv.setPointerCapture(e.pointerId); return; } if (cur.tap) cur.tap(px, py); });
  cv.addEventListener('pointermove', (e) => { if (!cur) return; const [px, py] = toCv(e); if (dragging) { dragging.move && dragging.move(px, py); return; } cv.style.cursor = cur.hot && cur.hot(px, py) ? 'pointer' : ''; });
  const endDrag = (e) => { if (!dragging) return; const [px, py] = toCv(e); const d = dragging; dragging = null; d.up && d.up(px, py); };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  function frame(now) {
    if (!cur) return;
    const t = Math.max(0, (now - cur.t0) / 1000), W = cv.width, H = cv.height, u = W / 360;
    c.clearRect(0, 0, W, H);
    if (cur.draw) cur.draw(c, t, W, H, u);
    // 画面の光（一瞬の閃光）と、ゆれ
    if (cur.flash) { const k = (now - cur.flash.t0) / 1000 / cur.flash.d; if (k >= 1) cur.flash = null; else { c.fillStyle = cur.flash.col; c.globalAlpha = (1 - k) * cur.flash.a; c.fillRect(0, 0, W, H); c.globalAlpha = 1; } }
    if (cur.shake) { const k = (now - cur.shake.t0) / 1000 / cur.shake.d; if (k >= 1) { cur.shake = null; root.style.transform = ''; } else { const m = cur.shake.px * (1 - k); root.style.transform = `translate(${(Math.random() - 0.5) * m}px,${(Math.random() - 0.5) * m}px)`; } }
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
    root.querySelector('.evu-title').textContent = ev.name;
    // 本文とボタンの入れ物は、毎回新しくする（前のできごとの続きが、古い入れ物に書いても見えない）
    GEN++;
    const nb = body.cloneNode(false); body.replaceWith(nb); body = nb;
    const nf = footEl.cloneNode(false); footEl.replaceWith(nf); footEl = nf;
    toastEl.className = 'evu-toast'; toastEl.innerHTML = '';
    cv.style.cursor = ''; dragging = null;
    cur = { s, api, ev, t0: performance.now(), shown: s.comets, draw: null, onDone, body, foot: footEl };
    wallet.querySelector('b').textContent = s.comets;
    raf = requestAnimationFrame(frame);
    const ctx = makeCtx(cur);
    (SCENES[id] || SCENES.stall)(ctx);
  }
  function close() { GEN++; if (cur) cur.dead = true; cancelAnimationFrame(raf); cur = null; toastEl.className = 'evu-toast'; toastEl.innerHTML = ''; root.classList.remove('show'); root.style.transform = ''; root.classList.remove('tapall'); body.innerHTML = ''; footEl.innerHTML = ''; }

  // 各できごとに渡す道具
  function makeCtx(C) {
    const live = () => !C.dead;
    const ctx = {
      s: C.s, api: C.api, body, root,
      get dead() { return !!C.dead; },
      // 背景の絵（毎フレーム呼ばれる）
      draw(fn) { C.draw = fn; },
      time: () => (performance.now() - C.t0) / 1000,
      rect(el) { if (!el || !el.isConnected) return null; const a = el.getBoundingClientRect(), b = root.getBoundingClientRect(), k = cv.width / Math.max(1, b.width); return { x: (a.left - b.left) * k, y: (a.top - b.top) * k, w: a.width * k, h: a.height * k }; },
      sfx: (id, o) => { if (live()) playSound(id, o); },
      html(h) { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; },
      btn(label, cls, fn) { const b = document.createElement('button'); b.className = `btn evu-btn ${cls || ''}`; b.innerHTML = `<span>${label}</span>`; b.addEventListener('click', () => { if (!b.disabled) fn(b); }); return b; },
      // カード1枚（できごとの中で使う、ふつうと同じ見た目）
      card(ch) { const { cls, html } = hud.cardOf(C.s, ch); const b = document.createElement('div'); b.className = `${cls} evu-card`; b.innerHTML = html; return b; },
      fit(node) { hud.fitLines(node); hud.snapIcons(node); },
      cometImg: (h = 48) => `<canvas class="evu-cim" width="32" height="32" data-h="${h}"></canvas>`,
      toast(text, cls = '') { if (!live()) return; toastEl.className = `evu-toast ${cls}`; toastEl.innerHTML = text; void toastEl.offsetWidth; toastEl.classList.add('in'); },
      done() { if (!live()) return; const cb = C.onDone; close(); if (cb) cb(); },
      // 別のできごとへつなぐ（おみくじの大凶 → 大凶）
      goto(id) { if (!live()) return; const { s, api, onDone } = C; open(s, api, id, onDone); },
      flash(col = '#fff', d = 0.4, a = 1) { if (!live()) return; C.flash = { col, d, a, t0: performance.now() }; },
      shake(px = 14, d = 0.4) { if (!live()) return; C.shake = { px, d, t0: performance.now() }; },
      skillName: (id) => (SKILL_BY_ID[id] ? SKILL_BY_ID[id].name : id),
      // 下のボタン：どのできごとも同じ場所・同じ2種類（戻る＝やめる／OK＝進む・受ける）
      foot(...btns) { const f = C.foot; f.innerHTML = ''; if (live()) f.append(...btns); return { remove() { f.innerHTML = ''; } }; },
      ok(fn) { return ctx.btn('OK', 'evu-ok', fn); },
      back(fn) { return ctx.btn('戻る', 'btn-sub evu-back', fn || (() => ctx.done())); },
      // 絵を直接さわる（tap：押したとき、hot：指が乗ると押せる形に、drag：引っぱる）
      tap(fn, hot) { C.tap = fn; C.hot = hot || null; },
      // 画面のどこをさわっても発動（呪いを受ける・挑む など）。下に「画面をタップで〜」を出す
      tapAnywhere(label, fn) { const el = ctx.html(`<div class="evu-prompt">画面をタップで <b>${label}</b></div>`); C.body.appendChild(el); root.classList.add('tapall'); let used = false; ctx.tap(() => { if (used) return; used = true; el.remove(); root.classList.remove('tapall'); C.tap = null; C.hot = null; cv.style.cursor = ''; fn(); }, () => !used); return el; },
      // 下の空き：説明の一行（ボタンの上）
      // 結果（大きな文字＋ひとこと）を、上の空きの決まった高さに出す（ボタンの上ではなく）
      result(big, sub = '', { top = 22, cls = '', color = '' } = {}) { const el = ctx.html(`<div class="evu-result ${cls}" style="top:${top}%"><div class="evu-big ${cls}"${color ? ` style="color:${color}"` : ''}>${big}</div>${sub ? `<div class="evu-note">${sub}</div>` : ''}</div>`); C.body.appendChild(el); return el; },
      hint(text) { const el = ctx.html(`<div class="evu-hint">${text}</div>`); C.body.appendChild(el); return el; },
      drag(o) { C.drag = o; },
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
  if (lit > 0.5) { c.fillStyle = `rgba(40,10,0,${0.7 * lit})`; c.font = `${Math.round(r * 0.9)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, '祭', 0, 0); }
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
      // 屋台の屋根とのれん：商品（カードの棚）のすぐ上に合わせて描く（画面の高さが変わってもずれない）
      const wr = x.rect(stallWrap), top = wr ? wr.y - 54 * u : H * 0.2;
      c.fillStyle = '#3a1f12'; c.fillRect(W * 0.06, top, W * 0.88, 14 * u);
      for (let i = 0; i < 6; i++) { const nx = W * 0.08 + i * W * 0.14; c.fillStyle = i % 2 ? '#a3181e' : '#f3ead8'; const wav = Math.sin(t * 2 + i) * 2 * u; c.fillRect(nx, top + 14 * u, W * 0.13, 30 * u + wav); }
      c.fillStyle = '#1b0f08'; c.font = `${Math.round(16 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      fillC(c, '屋　台', W / 2, top + 30 * u);
      // 台
      c.fillStyle = '#5a3216'; c.fillRect(W * 0.04, H * 0.9, W * 0.92, H * 0.1);
      firefly(c, W, H, t, 14);
    });
    const choices = x.api.roll({ count: 3, floor: 'rare', noCurse: true });
    const wrap = x.html('<div class="evu-stall"></div>');
    const stallWrap = wrap;
    x.body.append(x.html('<div class="evu-spacer s"></div>'), wrap);
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
        x.toast('お買い上げ！'); x._bought && x._bought();
        wrap.querySelectorAll('.evu-price').forEach((b) => b._sync && b._sync());
      });
      tag._sync = sync; sync();
      row.append(card, tag); wrap.appendChild(row);
    });
    x.fit(wrap);
    const sh = x.hint('値札をタップで購入（何枚でも）');
    x.foot(x.back());
    x._bought = () => { sh.textContent = 'ほかの値札も買える'; };
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
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, on = (Math.floor(t * 6) + i) % 3 === 0; c.fillStyle = on ? '#ffd84a' : '#5a4420'; c.beginPath(); c.arc(W / 2 + Math.cos(a) * 118 * u, H * 0.27 + Math.sin(a) * 108 * u, 3 * u, 0, TAU); c.fill(); }
      const cx = W / 2, cy = H * 0.24, R = 70 * u;
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

      // レバー（回る）
      c.save(); c.translate(cx + R * 0.45, cy + R * 1.45); c.rotate(crank);
      c.fillStyle = '#f3f3f3'; c.beginPath(); c.arc(0, 0, 14 * u, 0, TAU); c.fill(); c.fillStyle = '#999'; c.fillRect(-3 * u, -14 * u, 6 * u, 28 * u); c.restore();
      // 出口
      c.fillStyle = '#300'; c.beginPath(); c.arc(cx, cy + R * 1.72, 12 * u, 0, TAU); c.fill();
      c.restore();
      x._crank = [cx + R * 0.45, cy + R * 1.45, 34 * u];
      if (!busy) tapHint(c, cx + R * 0.45, cy + R * 1.45 - 20 * u, u, t, 'まわす');
      if (shake > 0) shake = Math.max(0, shake - 0.4);
      // 出てきたカプセル：転がって、ゆれて、割れる
      if (drop) {
        const k = (performance.now() - drop.t0) / 1000;
        const ox = cx, oy = cy + R * 1.72, tx = cx, ty = H * 0.6;
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
    const note = x.html(`<div class="evu-sheet"><div class="evu-sheet-h">料金表</div><div class="evu-sheet-r"><span>1回目</span><b>無料</b></div><div class="evu-sheet-r"><span>2回目から</span><b>${x.cometImg(200)} 3 ／ 1回</b></div><div class="evu-sheet-f">レバーをタップで1回まわす</div></div>`);
    const RAR = ['normal', 'rare', 'super', 'mythic'];
    let busy = false;
    const pull = async (times) => {
      if (busy) return;
      if (!caps.length) { x.toast('カプセルが売り切れ…', 'bad'); return; }
      const cost = st.free > 0 ? 0 : 3 * times;
      if (x.s.comets < cost) { x.toast('コメットが足りない…', 'bad'); x.sfx('ev_coin', { pitch: 0.6 }); return; }
      busy = true;
      if (st.free > 0) { st.free = 0; } else x.api.addComets(-cost);
      if (cost) x.sfx('ev_coin');
      for (let k = 0; k < times; k++) {
        const ch = x.api.roll({ count: 1, noCurse: true })[0];
        if (!ch) break;
        res.innerHTML = '';
        // レバー：ぐるっと回す・機械がゆれる。いちばん上のカプセルが1つ減る
        x.sfx('ev_crank'); shake = 8; caps.pop();
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
      busy = false; x.foot(x.ok(() => x.done()));
    };
    const onCrank = (px, py) => { const k = x._crank; return k && Math.hypot(px - k[0], py - k[1]) < k[2]; };
    x.tap((px, py) => { if (onCrank(px, py)) pull(1); }, onCrank);
    x.foot(x.back());
    x.body.append(x.html('<div class="evu-spacer"></div>'), res, note);
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
        chosen = i; row.classList.add('chosen'); b.classList.add('on'); note.remove();
        x.sfx('ev_spring', { pitch: 1.2 });
        await wait(800);
        splash = 1; x.sfx('ev_capsule', { pitch: 0.7 });
        if (o.key === 'hp') x.api.hpUp(0.15);
        if (o.key === 'heal') x.api.heal(1);
        if (o.key === 'comet') x.api.addComets(6);
        row.remove(); x.result(o.name, o.sub, { top: 14, color: `rgb(${o.col.join(',')})` });
        await wait(900);
        x.foot(x.ok(() => x.done()));
      });
      row.appendChild(b);
    });
    x.body.append(x.html('<div class="evu-spacer"></div>'), note, row);
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
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; c.save(); c.rotate(a); fillC(c, glyph[i % glyph.length], 0, -110 * u); c.restore(); }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU * 2; c.beginPath(); c.moveTo(Math.cos(a - Math.PI / 2) * 100 * u, Math.sin(a - Math.PI / 2) * 100 * u); const b = ((i + 1) / 5) * TAU * 2; c.lineTo(Math.cos(b - Math.PI / 2) * 100 * u, Math.sin(b - Math.PI / 2) * 100 * u); c.stroke(); }
      c.restore();
      // 祭壇
      const ax = ccx, ay = cr ? cr.y + cr.h + 16 * u : H * 0.5, half = cr ? cr.w / 2 + 16 * u : 150 * u;
      c.fillStyle = '#1c1a22'; c.fillRect(ax - half - 12 * u, ay - 30 * u, (half + 12 * u) * 2, 30 * u); c.fillStyle = '#2a2632'; c.fillRect(ax - half - 22 * u, ay, (half + 22 * u) * 2, 12 * u);
      c.strokeStyle = '#4a3a5a'; c.lineWidth = 1.5 * u; c.strokeRect(ax - half - 12 * u, ay - 30 * u, (half + 12 * u) * 2, 30 * u);
      c.fillStyle = 'rgba(150,90,200,0.5)'; c.font = `${Math.round(10 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, '― 贄を捧げよ ―', ax, ay - 15 * u);
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
    const yes = async () => {
      x.foot();
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
      x.foot(x.ok(() => x.done()));
    };
    x.foot(x.back());
    x.body.append(x.html('<div class="evu-spacer s"></div>'), curseCard, note, rw);
    x.tapAnywhere('呪いを受ける', yes);
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
      x.foot(x.ok(() => x.done()));
    })();
  },

  // ---------------- 待ち伏せ：暗い茂みに、赤い目が次々と開く。大きな2つの影が立ち上がる ----------------
  ambush(x) {
    const N = 2 + Math.floor(Math.random() * 3);   // 待ちかまえる中ボスの数（2〜4体）
    x.api.next('ambush', N);
    const spots = Array.from({ length: N }, (_, i) => [(i + 0.5) / N, i * 1.3]);
    const eyes = Array.from({ length: 22 }, (_, i) => ({ x: Math.random(), y: 0.55 + Math.random() * 0.4, d: 0.3 + Math.random() * 1.6, s: 0.6 + Math.random() * 0.8, b: Math.random() * 6 }));
    wait(1300).then(() => x.sfx('ev_ambush'));
    x.draw((c, t, W, H, u) => {
      c.fillStyle = '#030104'; c.fillRect(0, 0, W, H);
      const vg = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.7); vg.addColorStop(0, 'rgba(70,0,10,0.4)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
      // 大きな2つの影（中ボス）：下からゆっくり立ち上がる
      const rise = ease((t - 1.2) / 1.2);
      for (const [sx, ph] of spots) {
        const bx = W * sx, by = H * 0.78 - rise * H * 0.3 + Math.sin(t * 1.5 + ph) * 3 * u, br = (N > 3 ? 44 : N > 2 ? 52 : 62) * u;
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
      x.body.append(x.html('<div class="evu-big bad">待ち伏せだ！</div>'), x.html(`<div class="evu-note">次のフェーズ、中ボスが <b>${N}体</b> 待ちかまえている</div>`));
      x.foot(x.ok(() => x.done()));
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

// ================================================================
//  背景の部品（2）
// ================================================================
// 宝箱（lid：ふたの開き 0〜1、mimic：中から歯と目と舌）
function bigChest(c, x, y, s, lid, mimic, t, glow = 0) {
  c.save(); c.translate(x, y);
  if (glow > 0) { const g = c.createRadialGradient(0, -s * 0.3, 0, 0, -s * 0.3, s * 1.6); g.addColorStop(0, `rgba(255,220,120,${0.5 * glow})`); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, -s * 0.3, s * 1.6, 0, TAU); c.fill(); }
  // 影
  c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(0, s * 0.42, s * 0.75, s * 0.12, 0, 0, TAU); c.fill();
  // 箱
  c.fillStyle = '#7a4318'; c.fillRect(-s * 0.62, -s * 0.1, s * 1.24, s * 0.5);
  c.fillStyle = '#5a2e0e'; for (let k = -1; k <= 1; k++) c.fillRect(-s * 0.62, -s * 0.1 + (k + 1) * s * 0.17, s * 1.24, s * 0.02);
  c.fillStyle = '#e8b830'; c.fillRect(-s * 0.62, -s * 0.1, s * 0.1, s * 0.5); c.fillRect(s * 0.52, -s * 0.1, s * 0.1, s * 0.5);
  // 中（開いたとき）
  if (lid > 0.05) {
    c.fillStyle = mimic ? '#3a0008' : '#2a1404'; c.fillRect(-s * 0.56, -s * 0.16, s * 1.12, s * 0.1);
    if (mimic) {
      // 舌と目
      c.fillStyle = '#e8507a'; c.beginPath(); c.ellipse(0, -s * 0.1 + Math.sin(t * 9) * s * 0.03, s * 0.22, s * 0.1 * lid, 0, 0, Math.PI); c.fill();
      for (const ex of [-0.25, 0.25]) { c.fillStyle = '#ffec3a'; c.shadowColor = '#ffec3a'; c.shadowBlur = 10; c.beginPath(); c.ellipse(ex * s, -s * 0.28 - lid * s * 0.08, s * 0.08, s * 0.06 * lid, 0, 0, TAU); c.fill(); c.shadowBlur = 0; c.fillStyle = '#000'; c.fillRect(ex * s - s * 0.012, -s * 0.33 - lid * s * 0.08, s * 0.024, s * 0.1 * lid); }
    } else {
      const g = c.createLinearGradient(0, -s * 0.9, 0, -s * 0.1); g.addColorStop(0, 'rgba(255,230,140,0)'); g.addColorStop(1, `rgba(255,230,140,${0.7 * lid})`); c.fillStyle = g; c.beginPath(); c.moveTo(-s * 0.56, -s * 0.12); c.lineTo(-s * 0.8, -s * 1.1); c.lineTo(s * 0.8, -s * 1.1); c.lineTo(s * 0.56, -s * 0.12); c.fill();
    }
  }
  // ふた（奥へ倒れる）
  c.save(); c.translate(0, -s * 0.1); c.scale(1, 1 - lid * 1.6);
  c.fillStyle = '#8a4e1e'; c.beginPath(); c.moveTo(-s * 0.62, 0); c.lineTo(-s * 0.62, -s * 0.22); c.quadraticCurveTo(0, -s * 0.5, s * 0.62, -s * 0.22); c.lineTo(s * 0.62, 0); c.fill();
  c.fillStyle = '#e8b830'; c.fillRect(-s * 0.62, -s * 0.22, s * 0.1, s * 0.22); c.fillRect(s * 0.52, -s * 0.22, s * 0.1, s * 0.22);
  if (mimic && lid > 0.05) { c.fillStyle = '#fff'; for (let k = 0; k < 7; k++) { const tx = -s * 0.5 + k * s * 0.166; c.beginPath(); c.moveTo(tx, 0); c.lineTo(tx + s * 0.083, s * 0.1); c.lineTo(tx + s * 0.166, 0); c.fill(); } }
  c.restore();
  if (mimic && lid > 0.05) { c.fillStyle = '#fff'; for (let k = 0; k < 7; k++) { const tx = -s * 0.5 + k * s * 0.166; c.beginPath(); c.moveTo(tx, -s * 0.1); c.lineTo(tx + s * 0.083, -s * 0.2); c.lineTo(tx + s * 0.166, -s * 0.1); c.fill(); } }
  // 錠
  if (lid < 0.05) { c.fillStyle = '#ffd84a'; c.fillRect(-s * 0.07, -s * 0.16, s * 0.14, s * 0.16); c.fillStyle = '#3a2000'; c.fillRect(-s * 0.015, -s * 0.11, s * 0.03, s * 0.06); }
  c.restore();
}
// お札（ofuda）：白い紙に赤い文字
function ofuda(c, x, y, s, rot, ch, a = 1) {
  c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
  c.fillStyle = '#f6efd8'; c.fillRect(-s * 0.22, -s * 0.6, s * 0.44, s * 1.2);
  c.strokeStyle = '#b81818'; c.lineWidth = s * 0.03; c.strokeRect(-s * 0.18, -s * 0.55, s * 0.36, s * 1.1);
  c.fillStyle = '#b81818'; c.font = `${Math.round(s * 0.32)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, ch, 0, -s * 0.18);
  c.strokeStyle = '#b81818'; c.lineWidth = s * 0.02; c.beginPath(); for (let k = 0; k < 5; k++) { c.moveTo(-s * 0.1, s * (0.12 + k * 0.08)); c.lineTo(s * 0.1, s * (0.16 + k * 0.08)); } c.stroke();
  c.restore();
}
// 雷（ギザギザの線）
function bolt(c, x, y, len, u, seed) {
  c.save(); c.strokeStyle = '#fff'; c.shadowColor = '#ff4a4a'; c.shadowBlur = 20 * u; c.lineWidth = 3 * u;
  c.beginPath(); c.moveTo(x, y); let px = x, py = y;
  for (let k = 1; k <= 8; k++) { px = x + Math.sin(seed * 7 + k * 3.1) * 26 * u; py = y + (len * k) / 8; c.lineTo(px, py); }
  c.stroke(); c.restore();
}
// サイコロの目
function die(c, x, y, s, v, rot) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.fillStyle = '#fbf6ea'; c.beginPath(); c.roundRect(-s / 2, -s / 2, s, s, s * 0.18); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = s * 0.04; c.stroke();
  const P = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v];
  c.fillStyle = v === 1 ? '#d01818' : '#1a1a1a';
  for (const [px, py] of P) { c.beginPath(); c.arc(px * s * 0.26, py * s * 0.26, s * (v === 1 ? 0.14 : 0.085), 0, TAU); c.fill(); }
  c.restore();
}
// 金色の光の筋（回る）
function rays(c, x, y, R, t, n, col, a) {
  c.save(); c.translate(x, y); c.rotate(t * 0.25);
  for (let i = 0; i < n; i++) { c.rotate(TAU / n); c.fillStyle = `rgba(${col},${a * (i % 2 ? 0.5 : 1)})`; c.beginPath(); c.moveTo(0, 0); c.lineTo(R, -R * 0.09); c.lineTo(R, R * 0.09); c.fill(); }
  c.restore();
}
const skillPlate = (x, id, lv, extra = '') => x.html(`<div class="evu-skplate ${extra}"><b>${x.skillName(id)}</b><small>Lv${lv}</small></div>`);
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

Object.assign(SCENES, {
  // ---------------- 封印：古いお堂。スキルの名札にお札が飛んできて貼りつき、鎖が巻きつく ----------------
  seal(x) {
    const owned = x.api.ownedSkills();
    const pick = pickOne(owned);
    x.api.next('seal', pick.id);
    let stuck = 0;
    x.draw((c, t, W, H, u) => {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c0610'); g.addColorStop(1, '#1e0a0e'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // お堂の柱と、しめ縄
      c.fillStyle = '#2a0c0c'; c.fillRect(W * 0.06, 0, 18 * u, H); c.fillRect(W * 0.94 - 18 * u, 0, 18 * u, H);
      c.strokeStyle = '#c8b070'; c.lineWidth = 6 * u; c.beginPath(); c.moveTo(0, H * 0.2); c.quadraticCurveTo(W / 2, H * 0.27, W, H * 0.2); c.stroke();
      for (let i = 1; i < 6; i++) { const sx = (i / 6) * W, sy = H * 0.2 + Math.sin((i / 6) * Math.PI) * H * 0.07; c.fillStyle = '#f2ecd8'; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 6 * u, sy + 10 * u); c.lineTo(sx - 2 * u, sy + 16 * u); c.lineTo(sx + 6 * u, sy + 26 * u); c.lineTo(sx, sy + 26 * u); c.lineTo(sx - 8 * u, sy + 16 * u); c.lineTo(sx, sy + 10 * u); c.fill(); }
      // ただよう、お札たち
      for (let i = 0; i < 9; i++) { const k = (t * 0.06 + i / 9) % 1; ofuda(c, W * ((i * 0.37) % 1), H * (1.05 - k * 1.1), 34 * u, Math.sin(t + i) * 0.4, '封', 0.25); }
      // 貼りつく瞬間の赤い光
      if (stuck) { const k = (performance.now() - stuck) / 1000; if (k < 1.2) { const r = k * 200 * u; c.strokeStyle = `rgba(255,60,60,${1 - k / 1.2})`; c.lineWidth = 4 * u; c.beginPath(); c.arc(W / 2, H * 0.47, r, 0, TAU); c.stroke(); } }
    });
    const plate = skillPlate(x, pick.id, pick.lv, 'evu-sealplate');
    const tag = x.html('<div class="evu-ofuda"><span>封</span></div>');
    plate.appendChild(tag);
    x.body.append(x.html('<div class="evu-spacer"></div>'), plate);
    (async () => {
      await wait(900); tag.classList.add('in'); await wait(330); x.sfx('ev_seal'); x.shake(10, 0.3); stuck = performance.now(); plate.classList.add('hit');
      await wait(500); plate.classList.add('chained'); x.sfx('ev_chain');
      await wait(700);
      x.body.append(x.html(`<div class="evu-note">次のフェーズの間、<b>${x.skillName(pick.id)}</b> が使えない</div>`), x.html('<div class="evu-spacer"></div>'));
      x.foot(x.ok(() => x.done()));
    })();
  },

  // ---------------- 大凶：雷が落ち、真っ赤な「大凶」のくじ。盗っ人・封印・待ち伏せが、立て続けに来る ----------------
  kyo(x) {
    const owned = x.api.ownedSkills();
    const sealId = owned.length ? pickOne(owned).id : null;
    let stage = 0, bolts = [];
    const strike = () => { x.sfx('ev_thunder'); x.flash('#fff', 0.35); x.shake(22, 0.6); bolts.push({ t0: performance.now(), x: 0.2 + Math.random() * 0.6, seed: Math.random() * 9 }); };
    x.draw((c, t, W, H, u) => {
      c.fillStyle = '#060003'; c.fillRect(0, 0, W, H);
      // 赤黒い雲が渦を巻く
      for (let i = 0; i < 7; i++) { const a = t * 0.15 + i; c.fillStyle = `rgba(${60 + i * 8},0,${10 + i * 2},0.35)`; c.beginPath(); c.ellipse(W / 2 + Math.cos(a) * 90 * u, H * 0.12 + Math.sin(a * 1.3) * 20 * u, 140 * u, 30 * u, 0, 0, TAU); c.fill(); }
      for (const b of bolts) { const k = (performance.now() - b.t0) / 1000; if (k < 0.25) bolt(c, b.x * W, 0, H * 0.55, u, b.seed); }
      // 大凶のくじ：上から垂れ下がって開く
      const un = ease((t - 0.5) / 0.8), cx = W / 2, top = H * 0.2, len = H * 0.34 * un;
      if (un > 0) {
        c.save(); c.translate(cx, top); c.rotate(Math.sin(t * 1.3) * 0.03);
        c.fillStyle = '#f4ead0'; c.fillRect(-36 * u, 0, 72 * u, len);
        c.strokeStyle = '#a00'; c.lineWidth = 2 * u; c.strokeRect(-30 * u, 6 * u, 60 * u, len - 12 * u);
        c.fillStyle = '#c00000'; c.font = `${Math.round(46 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (un > 0.6) { c.globalAlpha = clamp((un - 0.6) / 0.4); fillC(c, '大', 0, len * 0.33); fillC(c, '凶', 0, len * 0.68); c.globalAlpha = 1; }
        c.fillStyle = '#3a1a10'; c.fillRect(-40 * u, -6 * u, 80 * u, 8 * u); c.fillRect(-40 * u, len - 2 * u, 80 * u, 8 * u);
        c.restore();
      }
      // 不幸が来るたびの印：盗っ人の影・お札・赤い目
      if (stage >= 1) { const k = clamp((t - x._t1) / 1.4); thiefFig(c, -40 * u + (W + 80 * u) * k, H * 0.7 - Math.abs(Math.sin(k * 20)) * 8 * u, u * 1.1, t); }
      if (stage >= 2) { const k = ease((t - x._t2) / 0.4); ofuda(c, W * 0.85, H * 0.62 - (1 - k) * H * 0.4, 40 * u, 0.2 + (1 - k) * 3, '封'); }
      if (stage >= 3) for (let i = 0; i < 14; i++) { const ex = W * ((i * 0.618) % 1), ey = H * (0.78 + ((i * 0.37) % 1) * 0.18), o = clamp((t - x._t3 - i * 0.04) / 0.2); c.fillStyle = `rgba(255,30,30,${o})`; c.beginPath(); c.ellipse(ex - 6 * u, ey, 4 * u, 2.4 * u, -0.2, 0, TAU); c.ellipse(ex + 6 * u, ey, 4 * u, 2.4 * u, 0.2, 0, TAU); c.fill(); }
      // 赤いふち
      const eg = c.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75); eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, `rgba(150,0,0,${0.35 + 0.15 * Math.sin(t * 5)})`); c.fillStyle = eg; c.fillRect(0, 0, W, H);
    });
    const list = x.html('<div class="evu-woes"></div>');
    x.body.append(x.html('<div class="evu-spacer s"></div>'), x.html('<div class="evu-spacer"></div>'), list);
    const woe = (head, text) => { const d = x.html(`<div class="evu-woe"><b>${head}</b><span>${text}</span></div>`); list.appendChild(d); };
    (async () => {
      strike(); await wait(450); x.sfx('ev_kyo');
      await wait(1100); strike();
      await wait(600);
      x._t1 = x.time(); stage = 1; x.sfx('ev_thief');
      const n = x.api.stealHalf(); woe('盗っ人', n ? `コメットを ${n} 個 盗まれた` : '盗むものがなくて、舌打ちして去った'); if (n) x.sfx('ev_coin', { pitch: 0.7 });
      await wait(1100); strike();
      x._t2 = x.time(); stage = 2;
      if (sealId) { x.api.next('seal', sealId); woe('封印', `次のフェーズ、${x.skillName(sealId)} が使えない`); } else woe('封印', 'お札が飛んできた…が、封じるものがなかった');
      await wait(300); x.sfx('ev_seal');
      await wait(1100); strike();
      x._t3 = x.time(); stage = 3; const nA = 2 + Math.floor(Math.random() * 3); x.api.next('ambush', nA); x.sfx('ev_ambush');
      woe('待ち伏せ', `次のフェーズ、中ボスが${nA}体`);
      await wait(900);
      x.foot(x.ok(() => x.done()));
    })();
  },

  // ---------------- 宝箱えらび：たいまつの部屋に3つの宝箱。1つはミミック ----------------
  chests(x) {
    const kinds = ['card', 'comet', 'mimic'].sort(() => Math.random() - 0.5);
    const st = kinds.map(() => ({ lid: 0, open: 0 }));
    let picked = -1;
    const xs = [0.2, 0.5, 0.8];
    x.draw((c, t, W, H, u) => {
      c.fillStyle = '#0c0a10'; c.fillRect(0, 0, W, H);
      // 石の壁
      for (let r = 0; r < 14; r++) for (let k = 0; k < 8; k++) { const bx = k * W / 7 - (r % 2) * W / 14, by = r * 26 * u; c.fillStyle = `rgb(${26 + ((r * 7 + k * 3) % 9)},${24 + ((r * 5 + k) % 7)},${32 + ((r + k * 5) % 8)})`; c.fillRect(bx + 1, by + 1, W / 7 - 2, 24 * u); }
      // たいまつ
      for (const tx of [0.08, 0.92]) { const fx = W * tx, fy = H * 0.3, fl = 1 + 0.2 * Math.sin(t * 17 + tx * 9); const g = c.createRadialGradient(fx, fy, 0, fx, fy, 120 * u); g.addColorStop(0, 'rgba(255,160,60,0.35)'); g.addColorStop(1, 'rgba(255,120,40,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#3a2410'; c.fillRect(fx - 3 * u, fy, 6 * u, 30 * u); c.fillStyle = '#ffb040'; c.beginPath(); c.ellipse(fx, fy - 6 * u * fl, 6 * u, 12 * u * fl, 0, 0, TAU); c.fill(); c.fillStyle = '#fff2b0'; c.beginPath(); c.ellipse(fx, fy - 3 * u, 3 * u, 6 * u, 0, 0, TAU); c.fill(); }
      // 床
      const baseY = H * 0.5;
      c.fillStyle = '#16121a'; c.fillRect(0, baseY - 20 * u, W, H);
      x._geo = { baseY, s: 70 * u, W };
      kinds.forEach((k, i) => {
        const S = st[i], mim = k === 'mimic' && S.open;
        const hover = picked < 0 ? Math.sin(t * 2 + i) * 3 * u : 0;
        const jit = mim ? Math.sin(t * 40) * 2 * u : 0;
        bigChest(c, W * xs[i] + jit, baseY + hover, 70 * u, mim ? 0.7 + 0.25 * Math.sin(t * 8) : S.lid, mim, t, picked === i && k !== 'mimic' ? 1 : 0);
        // 中身の札（開いたあと）
        if (S.shown) { const lab = k === 'card' ? 'レアカード' : k === 'comet' ? 'コメット×8' : 'ミミック'; c.fillStyle = k === 'mimic' ? '#a01020' : k === 'card' ? '#5a3ab0' : '#1a6ab0'; c.beginPath(); c.roundRect(W * xs[i] - 46 * u, baseY + 46 * u, 92 * u, 24 * u, 6 * u); c.fill(); c.fillStyle = '#fff'; c.font = `${Math.round(13 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; fillC(c, lab, W * xs[i], baseY + 58 * u); }
      });
      if (picked < 0) {
        for (let i = 0; i < 3; i++) tapHint(c, W * xs[i], baseY - 46 * u, u, t + i * 0.35, '');
        c.fillStyle = '#fff'; c.strokeStyle = '#10142a'; c.lineWidth = 3 * u; c.font = `${Math.round(15 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; strokeC(c, 'ひとつ選んで 開ける', W / 2, baseY - 82 * u); fillC(c, 'ひとつ選んで 開ける', W / 2, baseY - 82 * u);
      }
    });
    const hit = (px, py) => { const g = x._geo; if (!g || picked >= 0) return -1; for (let i = 0; i < 3; i++) if (Math.abs(px - g.W * xs[i]) < g.s * 0.7 && py > g.baseY - g.s * 0.6 && py < g.baseY + g.s * 0.5) return i; return -1; };
    x.tap((px, py) => { const i = hit(px, py); if (i >= 0) choose(i); }, (px, py) => hit(px, py) >= 0);
    const note = x.html('<div class="evu-note">3つのうち1つは、ミミック</div>');
    x.body.append(x.html('<div class="evu-spacer"></div>'), note);
    x.foot(x.back());
    const reveal = (i) => { st[i].shown = 1; };
    const openLid = async (i) => { for (let f = 0; f <= 12; f++) { st[i].lid = f / 12; await wait(16); } };
    async function choose(i) {
      if (picked >= 0) return; picked = i; x.foot();
      x.sfx('ev_chest');
      const k = kinds[i];
      for (let f = 0; f < 18; f++) { st[i].lid = f % 2 ? 0.04 : 0; await wait(30); }   // ガタガタ…
      if (k === 'mimic') { st[i].open = 1; st[i].lid = 0.8; x.sfx('ev_bite'); x.flash('#ff1a2a', 0.5, 0.7); x.shake(20, 0.6); x.api.next('mimic', 1); }
      else { await openLid(i); }
      reveal(i);
      note.remove();
      let card = null;
      if (k === 'card') { const ch = x.api.roll({ count: 1, floor: 'super', noCurse: true })[0]; if (ch) { card = x.card(ch); card.classList.add('evu-pop'); x.api.give(ch); x.sfx(ch.rarity === 'mythic' ? 'gssr' : 'gsr'); } }
      if (k === 'comet') { x.api.addComets(8); x.sfx('ev_win'); }
      if (k === 'mimic') x.result('ミミックだ！', '次のフェーズ、ミミックがコメットを奪いに来る', { top: 6, cls: 'bad' });
      else x.result(k === 'card' ? '当たり！' : 'コメット <b>+8</b>', '', { top: 8 });
      if (card) { x.body.appendChild(card); x.fit(x.body); }
      await wait(800);
      // 残りの箱も開けて、何が入っていたか見せる
      for (let j = 0; j < 3; j++) if (j !== i) { if (kinds[j] === 'mimic') { st[j].open = 1; st[j].lid = 0.8; } else openLid(j); reveal(j); await wait(250); }
      x.foot(x.ok(() => x.done()));
    }
  },

  // ---------------- ふしぎな薬：棚に3本の小びん。どれかを飲む。何が起きるかは飲んでから ----------------
  potion(x) {
    const cols = [[255, 90, 140], [90, 230, 140], [120, 150, 255]];
    const GOOD = [
      { name: '剛力の薬', sub: '次のフェーズ、攻撃力 1.5倍', mod: { atk: 1.5 } },
      { name: '疾風の薬', sub: '次のフェーズ、動きが 1.35倍速い', mod: { spd: 1.35 } },
      { name: '鉄壁の薬', sub: '次のフェーズ、受けるダメージ半分', mod: { hurt: 0.5 } },
      { name: '万能薬', sub: 'HPが全回復し、最大HP +5%', now: (a) => { a.hpUp(0.05); a.heal(1); } },
    ];
    const BAD = [
      { name: 'しびれ薬', sub: '次のフェーズ、動きが 0.7倍に', mod: { spd: 0.7 } },
      { name: '脱力の薬', sub: '次のフェーズ、攻撃力 0.7倍', mod: { atk: 0.7 } },
      { name: '毒薬', sub: 'HPが 30% 減った', now: (a) => a.hurt(0.3) },
    ];
    let drunk = -1, tint = 0;
    x.draw((c, t, W, H, u) => {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#120a1a'); g.addColorStop(1, '#0a0610'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 魔法使いの部屋：本棚とぼんやりした光
      for (let i = 0; i < 26; i++) { const bx = (i * 0.0385) * W, bh = (40 + ((i * 37) % 30)) * u; c.fillStyle = `hsl(${(i * 47) % 360},30%,${18 + (i % 3) * 4}%)`; c.fillRect(bx, H * 0.28 - bh, W * 0.034, bh); }
      c.fillStyle = '#2a1a10'; c.fillRect(0, H * 0.28, W, 8 * u); c.fillRect(0, H * 0.58, W, 10 * u);
      // 小びん3本
      cols.forEach(([r, gg, b], i) => {
        let bx = W * (0.25 + i * 0.25), by = H * 0.58, rot = 0, lift = 0;
        if (drunk === i) { const k = clamp((performance.now() - x._d0) / 1000 / 0.6); lift = ease(k) * 80 * u; rot = ease(k) * 2.2; }
        else if (drunk >= 0) { c.globalAlpha = 0.35; }
        c.save(); c.translate(bx, by - lift); c.rotate(rot);
        const lvl = drunk === i ? clamp(1 - (performance.now() - x._d0) / 1000 / 1.4) : 1;
        // びん
        c.fillStyle = 'rgba(220,230,255,0.15)'; c.beginPath(); c.arc(0, -26 * u, 24 * u, 0, TAU); c.fill(); c.fillRect(-7 * u, -66 * u, 14 * u, 22 * u);
        c.save(); c.beginPath(); c.arc(0, -26 * u, 22 * u, 0, TAU); c.clip(); c.fillStyle = `rgb(${r},${gg},${b})`; c.fillRect(-24 * u, -26 * u + 22 * u - 44 * u * lvl * 0.8, 48 * u, 60 * u); c.restore();
        // 泡
        for (let k = 0; k < 4; k++) { const p = (t * 0.8 + k * 0.25 + i * 0.1) % 1; c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(Math.sin(k * 3 + t) * 8 * u, -10 * u - p * 30 * u * lvl, 2 * u, 0, TAU); c.fill(); }
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(0, -26 * u, 24 * u, 0, TAU); c.stroke();
        c.fillStyle = '#7a4a20'; c.fillRect(-8 * u, -72 * u, 16 * u, 8 * u);
        c.fillStyle = '#f0e6c8'; c.fillRect(-14 * u, -34 * u, 28 * u, 14 * u); c.fillStyle = '#5a3a20'; c.font = `${Math.round(10 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, '？', 0, -27 * u);
        c.restore(); c.globalAlpha = 1;
        // 上る湯気
        if (drunk < 0) for (let k = 0; k < 3; k++) { const p = (t * 0.4 + k / 3 + i * 0.2) % 1; c.fillStyle = `rgba(${r},${gg},${b},${0.3 * (1 - p)})`; c.beginPath(); c.arc(bx + Math.sin(t * 2 + k + i) * 8 * u, by - 76 * u - p * 60 * u, (4 + p * 8) * u, 0, TAU); c.fill(); }
      });
      x._geo = { W, u, by: H * 0.58 };
      if (drunk < 0) { c.font = `${Math.round(13 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; cols.forEach(([r, gg, b], i) => { c.fillStyle = `rgb(${r},${gg},${b})`; fillC(c, ['赤', '緑', '青'][i] + 'の小びん', W * (0.25 + i * 0.25), H * 0.58 + 26 * u); }); for (let i = 0; i < 3; i++) tapHint(c, W * (0.25 + i * 0.25), H * 0.58 - 92 * u, u, t + i * 0.35, '');
        c.fillStyle = '#fff'; c.strokeStyle = '#10142a'; c.lineWidth = 3 * u; c.font = `${Math.round(15 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; strokeC(c, '1本えらんで 飲む', W / 2, H * 0.58 - 126 * u); fillC(c, '1本えらんで 飲む', W / 2, H * 0.58 - 126 * u); }
      // 飲んだあと：画面がその色に染まり、泡がのぼる
      if (tint > 0) { const [r, gg, b] = cols[drunk]; c.fillStyle = `rgba(${r},${gg},${b},${0.25 * tint})`; c.fillRect(0, 0, W, H); for (let k = 0; k < 30; k++) { const p = (t * 0.5 + k * 0.033) % 1; c.fillStyle = `rgba(${r},${gg},${b},${0.6 * (1 - p) * tint})`; c.beginPath(); c.arc(W * ((k * 0.618) % 1), H * (1 - p), (3 + (k % 4)) * u, 0, TAU); c.fill(); } }
    });
    const note = x.html('<div class="evu-note">何が起きるかは、飲んでからのお楽しみ</div>');
    const hitB = (px, py) => { const g = x._geo; if (!g || drunk >= 0) return -1; for (let i = 0; i < 3; i++) if (Math.abs(px - g.W * (0.25 + i * 0.25)) < 34 * g.u && py > g.by - 80 * g.u && py < g.by + 10 * g.u) return i; return -1; };
    x.tap((px, py) => { const i = hitB(px, py); if (i >= 0) drink(i); }, (px, py) => hitB(px, py) >= 0);
    x.body.append(x.html('<div class="evu-spacer"></div>'), note);
    x.foot(x.back());
    async function drink(i) {
      if (drunk >= 0) return; drunk = i; x._d0 = performance.now(); x.foot();
      await wait(500); x.sfx('ev_potion');
      await wait(900);
      const good = Math.random() < 0.55, r = pickOne(good ? GOOD : BAD);
      for (let k = 0; k <= 20; k++) { tint = k / 20; await wait(16); }
      if (r.mod) x.api.next('potion', { ...r.mod, name: r.name, sub: r.sub });
      if (r.now) r.now(x.api);
      x.sfx(good ? 'ev_win' : 'ev_lose'); if (!good) x.shake(10, 0.4);
      note.remove();
      x.result(r.name, r.sub, { top: 12, cls: good ? '' : 'bad' });
      x.foot(x.ok(() => x.done()));
    }
  },

  // ---------------- 運命のコイン：金貨を指ではじく。くるくる回って落ちる。表か、裏か ----------------
  coin(x) {
    let fl = null;   // { t0, res }
    x.draw((c, t, W, H, u) => {
      const g = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.7); g.addColorStop(0, '#1c2a3a'); g.addColorStop(1, '#04070c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 緑のラシャのテーブル
      c.fillStyle = '#0c3a24'; c.beginPath(); c.ellipse(W / 2, H * 0.72, W * 0.6, H * 0.14, 0, 0, TAU); c.fill(); c.strokeStyle = '#5a3a14'; c.lineWidth = 8 * u; c.stroke();
      let cy = H * 0.5, spin = t * 0.8, face = 1;
      if (fl) {
        const k = (performance.now() - fl.t0) / 1000;
        const air = 1.3, h = H * 0.38;
        if (k < air) { const p = k / air; cy = H * 0.62 - Math.sin(p * Math.PI) * h; spin = k * 22; }
        else { const b = k - air; cy = H * 0.62 - Math.abs(Math.sin(b * 12)) * 20 * u * Math.max(0, 1 - b * 2); spin = fl.res ? 0 : Math.PI; spin += b < 0.5 ? Math.sin(b * 30) * 0.3 * (1 - b * 2) : 0; }
        if (k > air) face = fl.res ? 1 : -1;
      } else cy = H * 0.5 + Math.sin(t * 2) * 6 * u;
      const sx = Math.cos(spin); face = sx >= 0 ? 1 : -1;
      // 影
      c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.ellipse(W / 2, H * 0.68, 50 * u * (1 - (H * 0.62 - cy) / (H * 0.6)), 8 * u, 0, 0, TAU); c.fill();
      // 金貨（横から見るとつぶれる）
      const R = 58 * u;
      c.save(); c.translate(W / 2, cy); c.scale(Math.max(0.06, Math.abs(sx)), 1);
      const cg = c.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R); cg.addColorStop(0, face > 0 ? '#fff6b0' : '#d8d8e0'); cg.addColorStop(1, face > 0 ? '#c88a10' : '#5a5a6a');
      c.fillStyle = cg; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.strokeStyle = face > 0 ? '#8a5a00' : '#33333f'; c.lineWidth = 4 * u; c.beginPath(); c.arc(0, 0, R * 0.82, 0, TAU); c.stroke();
      c.fillStyle = face > 0 ? '#8a5a00' : '#2a2a34'; c.font = `${Math.round(44 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, face > 0 ? '表' : '裏', 0, 0);
      c.restore();
      // きらり
      x._geo = { x: W / 2, y: cy, r: R * 1.2 };
      if (!fl) tapHint(c, W / 2, cy - R - 10 * u, u, t, 'はじく');
      if (!fl) { const k = (t % 2.4) / 2.4; if (k < 0.15) { c.fillStyle = `rgba(255,255,255,${1 - k / 0.15})`; c.save(); c.translate(W / 2 + R * 0.5, cy - R * 0.5); c.rotate(Math.PI / 4); c.fillRect(-12 * u, -2 * u, 24 * u, 4 * u); c.fillRect(-2 * u, -12 * u, 4 * u, 24 * u); c.restore(); } }
    });
    const note = x.html(`<div class="evu-sheet">
      <div class="evu-sheet-h">結果</div>
      <div class="evu-sheet-r"><span>表</span><b>レアなカードを 1枚</b></div>
      <div class="evu-sheet-r bad"><span>裏</span><b>HPが 半分に</b></div>
      <div class="evu-sheet-f">コインをタップして はじく</div>
    </div>`);
    x.body.append(x.html('<div class="evu-spacer"></div>'), note);
    const onCoin = (px, py) => { const g = x._geo; return !fl && g && Math.hypot(px - g.x, py - g.y) < g.r; };
    x.tap((px, py) => { if (onCoin(px, py)) flip(); }, onCoin);
    x.foot(x.back());
    const flip = async () => {
      x.foot(); const res = Math.random() < 0.5; fl = { t0: performance.now(), res }; x.sfx('ev_flip');
      await wait(1300); x.sfx('ev_coin', { pitch: 1.4 }); await wait(500);
      note.remove();
      if (res) {
        x.sfx('ev_win'); x.flash('#ffe9a0', 0.4, 0.6);
        const ch = x.api.roll({ count: 1, floor: 'super', noCurse: true })[0];
        x.result('表！', 'レアなカードを手に入れた', { top: 18 });
        if (ch) { const card = x.card(ch); card.classList.add('evu-pop'); x.api.give(ch); x.body.appendChild(card); x.fit(x.body); }
      } else {
        x.sfx('ev_lose'); x.flash('#ff1a2a', 0.5, 0.6); x.shake(16, 0.5); x.api.hurt(0.5);
        x.result('裏…', 'HPが半分になった', { top: 18, cls: 'bad' });
      }
      x.foot(x.ok(() => x.done()));
    };
  },

  // ---------------- 丁半ばくち：畳の上、つぼを振って伏せる。丁（偶数）か半（奇数）か ----------------
  dice(x) {
    let bowl = { y: 0, shake: 0, up: 1 }, dv = [3, 4], bet = 0, side = null, busy = false;
    x.draw((c, t, W, H, u) => {
      // 畳
      c.fillStyle = '#4a5a2a'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(0,0,0,${0.06 + (i % 3) * 0.02})`; c.fillRect(0, (i / 60) * H, W, 1.2 * u); }
      c.fillStyle = '#1a2410'; c.fillRect(0, H * 0.33, W, 6 * u); c.fillRect(W * 0.5 - 3 * u, H * 0.33, 6 * u, H);
      // 行灯の明かり
      const lg = c.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, H * 0.55); lg.addColorStop(0, 'rgba(255,200,120,0.25)'); lg.addColorStop(1, 'rgba(0,0,0,0.55)'); c.fillStyle = lg; c.fillRect(0, 0, W, H);
      // 白い布（盆ござ）
      c.fillStyle = '#e8e2cc'; c.fillRect(W * 0.12, H * 0.38, W * 0.76, H * 0.22);
      const cx = W / 2, cy = H * 0.5;
      // サイコロ（つぼが上がっている時だけ見える）
      if (bowl.up > 0.3) { die(c, cx - 22 * u, cy + 4 * u, 30 * u, dv[0], 0.2); die(c, cx + 22 * u, cy, 30 * u, dv[1], -0.3); }
      // つぼ（竹で編んだ茶色の器）
      const by = cy - bowl.up * 110 * u + (bowl.shake ? Math.sin(t * 50) * 6 * u : 0), bx = cx + (bowl.shake ? Math.cos(t * 43) * 14 * u : 0);
      c.save(); c.translate(bx, by);
      c.fillStyle = '#6a3a14'; c.beginPath(); c.moveTo(-46 * u, 20 * u); c.quadraticCurveTo(-50 * u, -40 * u, 0, -44 * u); c.quadraticCurveTo(50 * u, -40 * u, 46 * u, 20 * u); c.fill();
      c.strokeStyle = '#3a1e08'; c.lineWidth = 1.5 * u; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(-46 * u + k * 3 * u, 20 * u - k * 11 * u); c.quadraticCurveTo(0, 30 * u - k * 13 * u, 46 * u - k * 3 * u, 20 * u - k * 11 * u); c.stroke(); }
      c.fillStyle = '#2a1404'; c.fillRect(-48 * u, 16 * u, 96 * u, 6 * u);
      c.restore();
      // 丁・半の文字（布の両側）
      // 丁・半の札（さわって賭ける）
      x._geo = { cy, W, u };
      for (const [k, fx] of [['丁', 0.22], ['半', 0.78]]) {
        const on = side === k, can = !busy && bet > 0;
        c.fillStyle = on ? '#c01818' : can ? '#fbf6ea' : 'rgba(251,246,234,0.5)'; c.strokeStyle = '#3a2410'; c.lineWidth = 3 * u;
        c.beginPath(); c.roundRect(W * fx - 26 * u, cy - 30 * u, 52 * u, 60 * u, 6 * u); c.fill(); c.stroke();
        c.fillStyle = on ? '#fff' : '#8a1010'; c.font = `${Math.round(34 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; fillC(c, k, W * fx, cy);
        if (can && !side) tapHint(c, W * fx, cy - 36 * u, u, t + (fx > 0.5 ? 0.4 : 0), k === '丁' ? '偶数' : '奇数');
      }
    });
    const hitS = (px, py) => { const g = x._geo; if (!g || busy || !bet) return null; for (const [k, fx] of [['丁', 0.22], ['半', 0.78]]) if (Math.abs(px - g.W * fx) < 34 * g.u && Math.abs(py - g.cy) < 40 * g.u) return k; return null; };
    x.tap((px, py) => { const k = hitS(px, py); if (k) roll(k); }, (px, py) => !!hitS(px, py));
    const info = x.html(`<div class="evu-sheet evu-dicesheet">
      <div class="evu-sheet-h">賭け方</div>
      <div class="evu-sheet-r"><span>① 賭けるコメット</span><span class="evu-bets"></span></div>
      <div class="evu-sheet-r"><span>② 布の札をタップ</span><b>丁＝偶数 ／ 半＝奇数</b></div>
      <div class="evu-sheet-r"><span>当たり</span><b>賭けた分の 2倍 が戻る</b></div>
      <div class="evu-sheet-r bad"><span>はずれ</span><b>賭けた分はなくなる</b></div>
    </div>`);
    const bets = info.querySelector('.evu-bets');
    const res = x.html('<div class="evu-dres"></div>');
    [2, 5, 10].forEach((n) => { const b = x.html(`<button class="evu-chip" data-n="${n}">${x.cometImg(COMET_HUES[n % 5])}<b>${n}</b></button>`); b.addEventListener('click', () => { if (busy) return; bet = n; sync(); }); bets.appendChild(b); });
    const sync = () => { bets.querySelectorAll('.evu-chip').forEach((b) => { const n = Number(b.dataset.n); b.classList.toggle('on', n === bet); b.disabled = x.s.comets < n; }); if (bet > x.s.comets) bet = 0; };
    x.body.append(x.html('<div class="evu-spacer"></div>'), res, info);
    x.foot(x.back());
    sync();
    async function roll(sd) {
      if (busy || !bet) return; busy = true; side = sd; sync(); res.innerHTML = ''; x.foot();
      x.api.addComets(-bet); x.sfx('ev_coin');
      // つぼを下ろして、振る
      for (let k = 0; k <= 10; k++) { bowl.up = 1 - k / 10; await wait(16); }
      bowl.shake = 1; x.sfx('ev_dice'); await wait(700); bowl.shake = 0;
      dv = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      x.sfx('ev_bowl'); x.shake(8, 0.2);
      res.innerHTML = '<div class="evu-call">勝負！</div>';
      await wait(900);
      for (let k = 0; k <= 12; k++) { bowl.up = k / 12; await wait(16); }
      const sum = dv[0] + dv[1], out = sum % 2 === 0 ? '丁' : '半', win = out === sd;
      if (win) { x.api.addComets(bet * 2); x.sfx('ev_win'); } else x.sfx('ev_lose');
      res.innerHTML = `<div class="evu-call ${win ? 'win' : 'lose'}">${dv[0]}・${dv[1]}の${out}！　${win ? `コメット +${bet}` : `コメット −${bet}`}</div>`;
      busy = false; side = null; sync(); x.foot(x.ok(() => x.done()));
    }
  },

  // ---------------- 腕試し：道場。掛け軸の前に大きな影。銅鑼を鳴らして挑む ----------------
  trial(x) {
    const T = 25, R = 12;
    let rung = 0;
    x.draw((c, t, W, H, u) => {
      // 板の壁と床
      c.fillStyle = '#3a2412'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#422a16' : '#3a2412'; c.fillRect((i / 12) * W, 0, W / 12, H * 0.62); }
      c.fillStyle = '#5a3a1c'; c.fillRect(0, H * 0.62, W, H); for (let i = 0; i < 8; i++) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, H * 0.62 + i * 24 * u, W, 1.5 * u); }
      // 掛け軸
      const sy = H * 0.2, sh = H * 0.22;
      c.fillStyle = '#e8dcbc'; c.fillRect(W * 0.78 - 26 * u, sy, 52 * u, sh); c.fillStyle = '#2a1a10'; c.fillRect(W * 0.78 - 31 * u, sy - 5 * u, 62 * u, 6 * u); c.fillRect(W * 0.78 - 31 * u, sy + sh, 62 * u, 6 * u);
      c.fillStyle = '#1a1010'; c.font = `${Math.round(24 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; for (let i = 0; i < 3; i++) fillC(c, '心技体'[i], W * 0.78, sy + sh * (0.2 + i * 0.3));
      // 大きな影（中ボス）：呼吸するように揺れる
      const by = H * 0.5, br = 72 * u * (1 + 0.03 * Math.sin(t * 2));
      c.save(); c.shadowColor = rung ? 'rgba(255,200,60,0.8)' : 'rgba(255,255,255,0.15)'; c.shadowBlur = 30 * u; c.fillStyle = '#0a0606';
      c.beginPath(); for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, rr = br * (i % 2 ? 0.86 : 1); c.lineTo(W / 2 + Math.cos(a) * rr, by + Math.sin(a) * rr * 0.9); } c.fill(); c.restore();
      for (const ex of [-0.3, 0.3]) { c.fillStyle = rung ? '#ffd84a' : '#f0f0f0'; c.beginPath(); c.ellipse(W / 2 + ex * br, by - br * 0.15, 9 * u, 5 * u, ex, 0, TAU); c.fill(); }
      // 銅鑼（左）
      const gx = W * 0.2, gy = H * 0.3, gs = rung ? Math.sin((performance.now() - rung) / 30) * 3 * u * Math.max(0, 1 - (performance.now() - rung) / 1500) : 0;
      c.strokeStyle = '#2a1a0a'; c.lineWidth = 4 * u; c.strokeRect(gx - 34 * u, gy - 40 * u, 68 * u, 90 * u);
      const gg = c.createRadialGradient(gx - 8 * u, gy - 8 * u, 0, gx, gy, 28 * u); gg.addColorStop(0, '#ffe08a'); gg.addColorStop(1, '#a8660e'); c.fillStyle = gg; c.beginPath(); c.arc(gx + gs, gy, 28 * u, 0, TAU); c.fill();
      if (rung) { const k = (performance.now() - rung) / 1000; for (let i = 0; i < 3; i++) { const r = (k * 1.4 - i * 0.15) * 160 * u; if (r > 0) { c.strokeStyle = `rgba(255,220,120,${Math.max(0, 0.6 - k * 0.4)})`; c.lineWidth = 2 * u; c.beginPath(); c.arc(gx, gy, r, 0, TAU); c.stroke(); } } }
    });
    const note = x.html(`<div class="evu-note">次のフェーズのはじめに、強い中ボスが出る。<br><b>${T}秒</b>以内に倒せば コメット <b>+${R}</b></div>`);
    x.body.append(x.html('<div class="evu-spacer"></div>'), note);
    x.foot(x.back());
    x.tapAnywhere('銅鑼を鳴らして 挑む', async () => {
      x.foot(); rung = performance.now(); x.sfx('ev_gong'); x.shake(8, 0.5); x.api.next('trial', 1);
      note.remove(); x.body.appendChild(x.html('<div class="evu-big">いざ、勝負！</div>'));
      await wait(1400); x.done();
    });
  },

  // ---------------- 宝の山：岩の洞窟の奥、光る金貨の山。宝石・王冠・宝箱がうもれ、金貨がこぼれ落ちる ----------------
  hoard(x) {
    x.sfx('ev_gold');
    // 山の金貨（奥から手前へ、少しずつ重なる）。毎回同じ形にするため、決まった並びで作る
    const pile = [];
    for (let row = 0; row < 11; row++) { const n = 6 + row * 2; for (let i = 0; i < n; i++) { const fx = (i + 0.5) / n, sp = 0.1 + row * 0.038; pile.push({ fx: 0.5 + (fx - 0.5) * sp * 2, row, tone: (i * 7 + row * 3) % 5, tilt: ((i * 13 + row * 5) % 7 - 3) * 0.12 }); } }
    const gems = [[0.36, 4, '#ff3a5a'], [0.62, 6, '#3ad0ff'], [0.47, 8, '#5aff8a'], [0.7, 9, '#c06aff'], [0.28, 9, '#ffd84a']];
    const falls = Array.from({ length: 10 }, (_, i) => ({ d: i * 0.37, side: i % 2 ? 1 : -1, s: 0.8 + (i % 3) * 0.2 }));
    x.draw((c, t, W, H, u) => {
      const cx = W / 2, top = H * 0.3, base = H * 0.66;
      // 洞窟の奥：金色の照り返し
      c.fillStyle = '#0b0805'; c.fillRect(0, 0, W, H);
      const g = c.createRadialGradient(cx, base - 40 * u, 0, cx, base - 40 * u, W * 0.75); g.addColorStop(0, 'rgba(255,196,80,0.55)'); g.addColorStop(0.45, 'rgba(150,90,20,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 岩の天井と壁（でこぼこの縁、照り返しで縁が金色）
      const rock = (pts, col, edge) => { c.fillStyle = col; c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px * W, py * H) : c.moveTo(px * W, py * H))); c.closePath(); c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 2 * u; c.stroke(); } };
      rock([[0, 0], [1, 0], [1, 0.62], [0.93, 0.5], [0.95, 0.36], [0.86, 0.24], [0.74, 0.19], [0.6, 0.15], [0.44, 0.16], [0.3, 0.2], [0.17, 0.26], [0.08, 0.38], [0.06, 0.52], [0, 0.6]], '#1c140c', 'rgba(255,190,90,0.35)');
      rock([[0, 0], [1, 0], [1, 0.4], [0.9, 0.18], [0.7, 0.1], [0.5, 0.08], [0.3, 0.1], [0.12, 0.18], [0, 0.42]], '#120c07');
      // つらら（上から垂れる岩）
      for (const [fx, len] of [[0.22, 0.05], [0.37, 0.035], [0.55, 0.045], [0.68, 0.03], [0.8, 0.05]]) { c.fillStyle = '#1c140c'; c.beginPath(); c.moveTo(W * fx - 9 * u, H * 0.17); c.lineTo(W * fx, H * (0.17 + len)); c.lineTo(W * fx + 9 * u, H * 0.17); c.fill(); }
      // 床
      c.fillStyle = '#16100a'; c.fillRect(0, base, W, H - base);
      // 金貨の山：奥の段から描く。下の段ほど広く、明るい
      c.fillStyle = '#6a4206'; c.beginPath(); c.moveTo(W * 0.04, base + 10 * u); c.quadraticCurveTo(cx, top - 30 * u, W * 0.96, base + 10 * u); c.fill();
      const TONE = ['#ffd84a', '#ffe680', '#f0b820', '#ffcc30', '#fff0a8'];
      for (const p of pile) {
        const ry = top + (p.row / 10) * (base - top), half = Math.abs(p.fx - 0.5) * 2;
        const py = ry + half * half * (base - top) * 0.55 * (1 - p.row / 14);
        if (py > base + 6 * u) continue;
        const px = p.fx * W, r = (7 + p.row * 0.4) * u;
        c.fillStyle = '#8a5a08'; c.beginPath(); c.ellipse(px, py + 1.5 * u, r, r * 0.48, p.tilt, 0, TAU); c.fill();
        c.fillStyle = TONE[p.tone]; c.beginPath(); c.ellipse(px, py, r, r * 0.45, p.tilt, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(140,90,0,0.5)'; c.lineWidth = 1 * u; c.beginPath(); c.ellipse(px, py, r * 0.62, r * 0.27, p.tilt, 0, TAU); c.stroke();
      }
      // 宝石
      for (const [fx, row, col] of gems) { const px = W * fx, py = top + (row / 10) * (base - top) + 4 * u, r = 8 * u; c.fillStyle = col; c.beginPath(); c.moveTo(px, py - r); c.lineTo(px + r * 0.8, py - r * 0.2); c.lineTo(px, py + r); c.lineTo(px - r * 0.8, py - r * 0.2); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.moveTo(px - r * 0.3, py - r * 0.5); c.lineTo(px, py - r * 0.85); c.lineTo(px + r * 0.1, py - r * 0.3); c.fill(); }
      // 王冠（いただき）
      const kx = cx, ky = top - 6 * u + Math.sin(t * 1.5) * 1.5 * u;
      c.fillStyle = '#ffd84a'; c.strokeStyle = '#8a5a00'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(kx - 22 * u, ky + 10 * u); c.lineTo(kx - 24 * u, ky - 10 * u); c.lineTo(kx - 12 * u, ky); c.lineTo(kx, ky - 16 * u); c.lineTo(kx + 12 * u, ky); c.lineTo(kx + 24 * u, ky - 10 * u); c.lineTo(kx + 22 * u, ky + 10 * u); c.closePath(); c.fill(); c.stroke();
      for (const [dx, col] of [[-12, '#ff3a5a'], [0, '#3ad0ff'], [12, '#5aff8a']]) { c.fillStyle = col; c.beginPath(); c.arc(kx + dx * u, ky + 4 * u, 2.6 * u, 0, TAU); c.fill(); }
      // うもれた宝箱（左右）と、立てかけた剣
      bigChest(c, W * 0.2, base + 4 * u, 44 * u, 1, false, t, 0.7);
      bigChest(c, W * 0.8, base + 6 * u, 38 * u, 0, false, t, 0.3);
      c.save(); c.translate(W * 0.66, top + 40 * u); c.rotate(0.35); c.fillStyle = '#d8dce8'; c.fillRect(-2.5 * u, -46 * u, 5 * u, 46 * u); c.fillStyle = '#8a5a00'; c.fillRect(-10 * u, 0, 20 * u, 4 * u); c.fillRect(-2 * u, 4 * u, 4 * u, 12 * u); c.restore();
      // 山からこぼれ落ちる金貨（ころころ転がる）
      for (const f of falls) {
        const k = ((t * 0.45 * f.s + f.d) % 1.4); if (k > 1) continue;
        const sx = cx + f.side * (10 + k * W * 0.4), sy = top + 8 * u + (base - top) * (k * k * 0.9) - Math.abs(Math.sin(k * 14)) * 8 * u * (1 - k);
        const sq = Math.abs(Math.cos(t * 8 + f.d * 9));
        c.fillStyle = '#ffd84a'; c.beginPath(); c.ellipse(sx, sy, 6 * u * Math.max(0.2, sq), 6 * u, 0, 0, TAU); c.fill();
      }
      // きらめき（十字の光）
      for (let i = 0; i < 12; i++) { const o = Math.max(0, Math.sin(t * 2.6 + i * 1.9)); if (o < 0.3) continue; const px = W * (0.18 + ((i * 0.37) % 1) * 0.64), py = top + ((i * 0.53) % 1) * (base - top) * 0.9; const L = 9 * u * o; c.fillStyle = `rgba(255,255,240,${o})`; c.beginPath(); c.moveTo(px, py - L); c.lineTo(px + L * 0.18, py); c.lineTo(px, py + L); c.lineTo(px - L * 0.18, py); c.fill(); c.beginPath(); c.moveTo(px - L, py); c.lineTo(px, py + L * 0.18); c.lineTo(px + L, py); c.lineTo(px, py - L * 0.18); c.fill(); }
    });
    x.body.append(x.html('<div class="evu-spacer"></div>'), x.html('<div class="evu-note gold">次のフェーズ、宝箱と金色の敵があふれ出す<br><small>宝箱を壊すと コメット ／ 金色の敵は かけら5倍</small></div>'));
    x.foot(x.ok(() => { x.api.next('hoard', 1); x.done(); }));
  },

  // ---------------- 黄金の時間：まぶしい白、回る金の光、すべてが金色に ----------------
  golden(x) {
    x.flash('#fff', 0.9, 1); x.sfx('ev_gold'); x.sfx('gssr');
    x.api.next('golden', 1);
    x.draw((c, t, W, H, u) => {
      const g = c.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.8); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.4, '#e0a020'); g.addColorStop(1, '#4a2a00'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      rays(c, W / 2, H * 0.42, H, t, 24, '255,250,210', 0.35);
      rays(c, W / 2, H * 0.42, H, -t * 0.7, 12, '255,255,255', 0.18);
      // 金のつぶが舞う
      for (let i = 0; i < 50; i++) { const p = (t * 0.2 + i * 0.02) % 1, px = W * ((i * 0.618) % 1) + Math.sin(t + i) * 20 * u, py = H * (1 - p); const o = Math.sin(p * Math.PI); c.fillStyle = `rgba(255,255,220,${o})`; c.save(); c.translate(px, py); c.rotate(t * 2 + i); c.fillRect(-3 * u, -1 * u, 6 * u, 2 * u); c.fillRect(-1 * u, -3 * u, 2 * u, 6 * u); c.restore(); }
      // 金の太陽
      const R = 54 * u * (1 + 0.04 * Math.sin(t * 3)); c.fillStyle = '#fffbe0'; c.beginPath(); c.arc(W / 2, H * 0.42, R, 0, TAU); c.fill();
      c.fillStyle = '#c88000'; c.font = `${Math.round(48 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, '金', W / 2, H * 0.42);
    });
    x.body.append(x.html('<div class="evu-spacer"></div>'), x.html('<div class="evu-spacer s"></div>'), x.html('<div class="evu-note gold">次のフェーズ、敵がすべて金色に。<br>倒すと かけら 5倍！</div>'));
    x.foot(x.ok(() => x.done()));
  },

  // ---------------- 流れ星：笹に短冊。願いを書いた1枚に、星が落ちる → そのスキルが最大に ----------------
  shooting(x) {
    x.sfx('ev_star');
    const list = x.api.ownedSkills().filter((k) => !k.evo).slice(0, 5);
    let hit = null, wrap = null;
    x.draw((c, t, W, H, u) => {
      nightSky(c, W, H, t, '#01020c', '#0a1438', 120, 4);
      // 天の川
      c.save(); c.translate(W / 2, H * 0.24); c.rotate(-0.5); const mw = c.createLinearGradient(0, -40 * u, 0, 40 * u); mw.addColorStop(0, 'rgba(160,180,255,0)'); mw.addColorStop(0.5, 'rgba(180,200,255,0.18)'); mw.addColorStop(1, 'rgba(160,180,255,0)'); c.fillStyle = mw; c.fillRect(-W, -40 * u, W * 2, 80 * u); c.restore();
      // 流れ星（いくつも）
      for (let i = 0; i < 4; i++) { const k = ((t * 0.5 + i * 0.27) % 1.6); if (k > 1) continue; const sx = W * (1.1 - k * 1.2) + i * 30 * u, sy = H * (0.02 + k * 0.3) + i * 20 * u; const g = c.createLinearGradient(sx, sy, sx + 80 * u, sy - 26 * u); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.strokeStyle = g; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 80 * u, sy - 26 * u); c.stroke(); }
      // 笹：左に太い竹。短冊の少し上に、横へのびる枝（風でゆれる）
      const wr = x.rect(wrap), by = wr ? wr.y - 16 * u : H * 0.4, sway = Math.sin(t * 1.3) * 3 * u;
      c.strokeStyle = '#1e4a24'; c.lineWidth = 9 * u; c.beginPath(); c.moveTo(W * 0.06, H); c.lineTo(W * 0.06, by - 60 * u); c.stroke();
      c.strokeStyle = '#123018'; c.lineWidth = 2 * u; for (let k = 0; k < 8; k++) { const ny = H - k * 60 * u; c.beginPath(); c.moveTo(W * 0.06 - 5 * u, ny); c.lineTo(W * 0.06 + 5 * u, ny); c.stroke(); }
      c.strokeStyle = '#2a6a30'; c.lineWidth = 4 * u; c.beginPath(); c.moveTo(W * 0.06, by + 6 * u); c.quadraticCurveTo(W * 0.5, by - 6 * u + sway, W * 0.96, by + sway * 1.6); c.stroke();
      c.fillStyle = '#2f7a36'; for (let i = 0; i < 12; i++) { const lx = W * (0.1 + i * 0.075), ly = by - 2 * u + sway * (i / 12); c.save(); c.translate(lx, ly); c.rotate((i % 2 ? 0.5 : -0.4) + Math.sin(t * 2 + i) * 0.15); c.beginPath(); c.ellipse(12 * u, 0, 14 * u, 3.4 * u, 0, 0, TAU); c.fill(); c.restore(); }
      // 短冊をつるす糸
      if (wrap) for (const el of wrap.children) { const r = x.rect(el); if (!r) continue; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(r.x + r.w / 2, by); c.lineTo(r.x + r.w / 2, r.y + 2 * u); c.stroke(); }
      // 願いがかなう星：短冊へ落ちる
      if (hit) { const k = clamp((performance.now() - hit.t0) / 700); const r = x.rect(hit.el); if (r) { const ex = r.x + r.w / 2, ey = r.y + r.h * 0.3, sx = W * 1.1, sy = -40 * u; const px = sx + (ex - sx) * ease(k), py = sy + (ey - sy) * ease(k); c.strokeStyle = 'rgba(255,240,180,0.8)'; c.lineWidth = 4 * u; c.beginPath(); c.moveTo(px, py); c.lineTo(px + 120 * u * (1 - k * 0.5), py - 60 * u * (1 - k * 0.5)); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, 7 * u, 0, TAU); c.fill(); if (k >= 1) { const q = (performance.now() - hit.t0 - 700) / 1000; if (q < 1) { rays(c, ex, ey, 160 * u * q, t, 16, '255,240,170', 1 - q); } } } }
    });
    const note = x.html('<div class="evu-note">願いを1つ。短冊をタップすると、そのスキルが一気に最大レベルへ</div>');
    wrap = x.html('<div class="evu-tanzaku"></div>');
    list.forEach((k, i) => {
      const max = k.lv >= SKILL_MAX, rar = rarityOfLevel(k.lv, SKILL_MAX);
      // スキルのカードを、縦長の短冊にしたもの（上に絵、名前は縦書き、下にレベル）
      const srcCard = x.card({ id: k.id, kind: 'skill', rarity: rar }), icon = srcCard.querySelector('.card-icon');
      const tc = [...srcCard.classList].find((c) => c.startsWith('tc-')) || 'tc-ghost';
      const b = x.html(`<button class="evu-tzc r-${rar} ${tc}" style="animation-delay:${0.4 + i * 0.12}s, ${i * 0.37}s"><span class="evu-tzc-ic"></span><b>${x.skillName(k.id)}</b><small>Lv${k.lv}<br>↓<br>${max ? '進化' : 'MAX'}</small></button>`);
      if (icon) { icon.querySelector('.card-rarity')?.remove(); b.querySelector('.evu-tzc-ic').appendChild(icon); }
      b.addEventListener('click', async () => {
        if (hit) return; hit = { el: b, t0: performance.now() }; wrap.classList.add('chosen'); b.classList.add('on'); note.remove();
        x.sfx('ev_star', { pitch: 1.2 });
        await wait(700); x.sfx('ev_wish'); x.flash('#fff6c8', 0.5, 0.7); x.api.maxSkill(k.id);
        b.querySelector('small').innerHTML = max ? '進化<br>した！' : 'Lv<br>MAX！';
        await wait(800); x.foot(x.ok(() => x.done()));
      });
      wrap.appendChild(b);
    });
    x.body.append(x.html('<div class="evu-spacer"></div>'), wrap, x.html('<div class="evu-spacer s"></div>'), note);
    x.fit(wrap);
  },

  // ---------------- 七福神：金の波に宝船。最高のカード3枚から、好きな1枚 ----------------
  fortune(x) {
    x.flash('#fff', 1.0, 1); x.sfx('ev_fortune'); wait(300).then(() => x.sfx('gssr'));
    const ch3 = x.api.roll({ count: 3, floor: 'mythic', noCurse: true });
    x.draw((c, t, W, H, u) => {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a0a3a'); g.addColorStop(0.5, '#a83a10'); g.addColorStop(1, '#f0b030'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      rays(c, W / 2, H * 0.3, H, t, 28, '255,240,180', 0.16);
      // 虹の輪
      for (let i = 0; i < 7; i++) { c.strokeStyle = `hsla(${i * 50 + t * 40},90%,65%,0.35)`; c.lineWidth = 6 * u; c.beginPath(); c.arc(W / 2, H * 0.36, (110 + i * 7) * u, Math.PI, 0); c.stroke(); }
      // 宝船
      const by = H * 0.26 + Math.sin(t * 1.4) * 5 * u, bx = W / 2, rk = Math.sin(t * 1.4) * 0.04;
      c.save(); c.translate(bx, by); c.rotate(rk);
      c.fillStyle = '#a8180e'; c.fillRect(-4 * u, -90 * u, 8 * u, 90 * u);
      c.fillStyle = '#fff4d8'; c.beginPath(); c.moveTo(-58 * u, -86 * u); c.quadraticCurveTo(0, -96 * u + Math.sin(t * 2) * 4 * u, 58 * u, -86 * u); c.lineTo(52 * u, -18 * u); c.quadraticCurveTo(0, -24 * u, -52 * u, -18 * u); c.fill();
      c.fillStyle = '#c01818'; c.font = `${Math.round(38 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, '宝', 0, -52 * u);
      c.fillStyle = '#6a2a0a'; c.beginPath(); c.moveTo(-90 * u, 0); c.lineTo(90 * u, 0); c.quadraticCurveTo(80 * u, 30 * u, 50 * u, 32 * u); c.lineTo(-50 * u, 32 * u); c.quadraticCurveTo(-80 * u, 30 * u, -90 * u, 0); c.fill();
      c.fillStyle = '#ffd84a'; c.fillRect(-90 * u, -4 * u, 180 * u, 6 * u);
      for (let i = 0; i < 7; i++) { c.fillStyle = `hsl(${i * 51},80%,60%)`; c.beginPath(); c.arc(-60 * u + i * 20 * u, -8 * u, 7 * u, 0, TAU); c.fill(); }
      c.restore();
      // 金の波
      for (let r = 0; r < 4; r++) { c.fillStyle = `rgba(${255 - r * 20},${200 - r * 30},${80 - r * 10},${0.9})`; c.beginPath(); c.moveTo(0, H); for (let i = 0; i <= 24; i++) { const wx = (i / 24) * W, wy = H * (0.36 + r * 0.035) + Math.sin(i * 0.9 + t * (1.5 - r * 0.2) + r) * 6 * u; c.lineTo(wx, wy); } c.lineTo(W, H); c.fill(); }
      // 金のつぶ
      for (let i = 0; i < 30; i++) { const p = (t * 0.3 + i * 0.033) % 1; c.fillStyle = `rgba(255,250,200,${Math.sin(p * Math.PI)})`; c.beginPath(); c.arc(W * ((i * 0.618) % 1), H * (0.6 - p * 0.6), 2 * u, 0, TAU); c.fill(); }
    });
    const wrap = x.html('<div class="evu-pick3"></div>');
    let done = false;
    ch3.forEach((ch, i) => {
      const card = x.card(ch); card.classList.add('evu-pickcard'); card.style.animationDelay = `${0.8 + i * 0.18}s`;
      card.addEventListener('click', async () => {
        if (done) return; done = true; wrap.classList.add('chosen'); card.classList.add('on');
        x.api.give(ch); x.sfx('pickBig'); x.flash('#fff6c8', 0.5, 0.6);
        await wait(700); x.foot(x.ok(() => x.done()));
      });
      wrap.appendChild(card);
    });
    const fnote = x.html('<div class="evu-note gold">福の神から、好きな1枚を</div>');
    x.body.append(x.html('<div class="evu-spacer"></div>'), fnote, wrap);
    x.fit(wrap);
  },
});

// 迷子の分身（大きく描く）
function palFig(c, x, y, r, t, happy, wet) {
  c.save(); c.translate(x, y);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.4); g.addColorStop(0, `rgba(200,240,255,${happy ? 0.55 : 0.25})`); g.addColorStop(1, 'rgba(200,240,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.4, 0, TAU); c.fill();
  c.fillStyle = happy ? '#f4fbff' : '#c8d4e4'; c.beginPath(); c.arc(0, -r * 0.2, r, Math.PI, 0);
  for (let k = 0; k <= 6; k++) c.lineTo(r - (k * r * 2) / 6, r * 0.75 + (k % 2 ? -r * 0.25 : 0) + Math.sin(t * 6 + k) * r * 0.05);
  c.closePath(); c.fill();
  c.fillStyle = '#1a2040';
  if (happy) { c.lineWidth = r * 0.12; c.strokeStyle = '#1a2040'; for (const ex of [-0.38, 0.38]) { c.beginPath(); c.arc(ex * r, -r * 0.15, r * 0.14, Math.PI, 0); c.stroke(); } c.fillStyle = 'rgba(255,140,160,0.6)'; c.beginPath(); c.arc(-r * 0.6, r * 0.1, r * 0.13, 0, TAU); c.arc(r * 0.6, r * 0.1, r * 0.13, 0, TAU); c.fill(); }
  else { for (const ex of [-0.38, 0.38]) c.fillRect(ex * r - r * 0.09, -r * 0.3, r * 0.18, r * 0.3); c.strokeStyle = '#1a2040'; c.lineWidth = r * 0.06; c.beginPath(); c.arc(0, r * 0.25, r * 0.16, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
  if (wet) { const k = (t % 1.6) / 1.6; c.fillStyle = `rgba(140,200,255,${1 - k})`; c.beginPath(); c.ellipse(r * 0.38, -r * 0.0 + k * r * 0.8, r * 0.07, r * 0.12, 0, 0, TAU); c.fill(); }
  c.restore();
}
// 正体をあらわした分身：黒く大きく、赤い目と牙
function foeFig(c, x, y, r, t) {
  c.save(); c.translate(x, y);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 2.2); g.addColorStop(0, 'rgba(255,30,40,0.45)'); g.addColorStop(1, 'rgba(255,30,40,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.2, 0, TAU); c.fill();
  c.fillStyle = '#12020a'; c.beginPath(); c.arc(0, -r * 0.2, r, Math.PI, 0);
  for (let k = 0; k <= 8; k++) c.lineTo(r - (k * r * 2) / 8, r * 0.8 + (k % 2 ? -r * 0.35 : 0) + Math.sin(t * 9 + k) * r * 0.08);
  c.closePath(); c.fill(); c.strokeStyle = 'rgba(255,60,60,0.8)'; c.lineWidth = r * 0.05; c.stroke();
  c.fillStyle = '#ff2030'; c.shadowColor = '#ff2030'; c.shadowBlur = r * 0.4;
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.15, -r * 0.3); c.lineTo(s * r * 0.6, -r * 0.45); c.lineTo(s * r * 0.5, -r * 0.18); c.closePath(); c.fill(); }
  c.shadowBlur = 0; c.fillStyle = '#fff';
  for (let k = 0; k < 6; k++) { const tx = -r * 0.45 + k * r * 0.18; c.beginPath(); c.moveTo(tx, r * 0.05); c.lineTo(tx + r * 0.09, r * 0.28); c.lineTo(tx + r * 0.18, r * 0.05); c.fill(); }
  c.restore();
}
// スロットの絵柄
const SLOT = [
  { k: '7', col: '#ff3a4a' }, { k: '星', col: '#4ad8ff' }, { k: '桜', col: '#ff9ad0' }, { k: '鈴', col: '#ffd84a' }, { k: '骨', col: '#d8d8e8' },
];
function slotSym(c, x, y, s, i) {
  const S = SLOT[i]; c.save(); c.translate(x, y);
  if (S.k === '7') {
    // 7 は字ではなく、ドットで描く（フォントで位置がずれないように）
    const P = ['111111', '111111', '000011', '000110', '001100', '001100', '011000', '011000'], q = s * 0.085, w = 6 * q, h = 8 * q;
    for (const [col, off] of [['#1a0a10', q * 0.6], [S.col, 0]]) { c.fillStyle = col; P.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '1') c.fillRect(-w / 2 + rx * q + off, -h / 2 + ry * q + off, q + 0.5, q + 0.5); })); }
  } else if (S.k === '星') { drawComet(c, 0, 0, s * 0.36, 200, 0); }
  else if (S.k === '骨') { c.fillStyle = S.col; c.beginPath(); c.arc(0, -s * 0.05, s * 0.3, 0, TAU); c.fill(); c.fillRect(-s * 0.18, s * 0.12, s * 0.36, s * 0.16); c.fillStyle = '#1a1a24'; c.beginPath(); c.arc(-s * 0.12, -s * 0.06, s * 0.08, 0, TAU); c.arc(s * 0.12, -s * 0.06, s * 0.08, 0, TAU); c.fill(); }
  else { c.fillStyle = S.col; c.strokeStyle = '#1a0a10'; c.lineWidth = s * 0.08; c.font = `${Math.round(s * 0.7)}px ${S.k === '7' ? "'Press Start 2P', monospace" : 'DotGothic16, sans-serif'}`; c.textAlign = 'center'; c.textBaseline = 'middle'; strokeC(c, S.k, 0, s * 0.04); fillC(c, S.k, 0, s * 0.04); }
  c.restore();
}
// ルーレットのます
const WHEEL = [
  { name: '大当たり', col: '#ffd84a', ink: '#5a3a00', sub: '最高のカードを1枚' },
  { name: 'はずれ', col: '#3a3f5a', ink: '#c8cce8', sub: '何も起きない' },
  { name: 'レア', col: '#8a6aff', ink: '#fff', sub: 'レアなカードを1枚' },
  { name: '呪い', col: '#4a0a5a', ink: '#e8a8ff', sub: '呪いを1つ受ける' },
  { name: 'コメット', col: '#3aa8ff', ink: '#fff', sub: 'コメット +10' },
  { name: '半減', col: '#a01020', ink: '#fff', sub: 'コメットが半分に' },
  { name: '回復', col: '#3ad87a', ink: '#0a3a1a', sub: 'HPが全回復' },
  { name: '痛い', col: '#d0501a', ink: '#fff', sub: 'HPが30%減る' },
];

Object.assign(SCENES, {
  // ---------------- 迷子の分身：雨の夜道、街灯の下でふるえる小さな分身 ----------------
  stray(x) {
    let joined = 0, foe = 0;   // foe：運わるく、襲いかかってきた（その時刻）
    const drops = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6 }));
    x.draw((c, t, W, H, u) => {
      c.fillStyle = '#060a14'; c.fillRect(0, 0, W, H);
      // 遠くの家の窓
      for (let i = 0; i < 10; i++) { const wx = W * ((i * 0.37) % 1), wy = H * (0.25 + ((i * 0.53) % 1) * 0.2); c.fillStyle = `rgba(255,200,120,${0.25 + 0.1 * Math.sin(t + i)})`; c.fillRect(wx, wy, 10 * u, 12 * u); }
      c.fillStyle = '#0c1220'; c.fillRect(0, H * 0.66, W, H);
      // 街灯と光の輪
      const lx = W * 0.62, ly = H * 0.2;
      c.fillStyle = '#1a1e2a'; c.fillRect(lx - 3 * u, ly, 6 * u, H * 0.48);
      c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(lx, ly, 8 * u, 0, TAU); c.fill();
      const lg = c.createLinearGradient(0, ly, 0, H * 0.7); lg.addColorStop(0, 'rgba(255,230,160,0.35)'); lg.addColorStop(1, 'rgba(255,230,160,0.05)'); c.fillStyle = lg; c.beginPath(); c.moveTo(lx - 6 * u, ly); c.lineTo(lx + 6 * u, ly); c.lineTo(lx + 90 * u, H * 0.7); c.lineTo(lx - 90 * u, H * 0.7); c.fill();
      c.fillStyle = 'rgba(255,230,160,0.15)'; c.beginPath(); c.ellipse(lx, H * 0.7, 90 * u, 14 * u, 0, 0, TAU); c.fill();
      // 雨（連れていくと止む）
      const rain = foe ? 1.6 : joined ? clamp(1 - (performance.now() - joined) / 1500) : 1;
      if (foe) { const k = (performance.now() - foe) / 1000; c.fillStyle = `rgba(120,0,10,${Math.min(0.45, k * 0.6) + 0.08 * Math.sin(t * 6)})`; c.fillRect(0, 0, W, H); }
      c.strokeStyle = `rgba(160,190,230,${0.5 * rain})`; c.lineWidth = 1.2 * u;
      for (const d of drops) { d.y += d.v / 60; if (d.y > 1) { d.y = 0; d.x = Math.random(); } c.beginPath(); c.moveTo(d.x * W, d.y * H); c.lineTo(d.x * W - 4 * u, d.y * H + 14 * u); c.stroke(); }
      // 分身
      let px = lx, py = H * 0.62 + Math.sin(t * 3) * 3 * u, happy = false;
      if (!joined) px += Math.sin(t * 25) * 1.2 * u;   // ふるえる
      else { const k = (performance.now() - joined) / 1000; happy = true; py -= Math.abs(Math.sin(k * 7)) * 26 * u * Math.max(0, 1 - k * 0.4); px = lx + (W * 0.5 - lx) * ease(k / 1.2); }
      if (foe) { const k = (performance.now() - foe) / 1000; foeFig(c, lx + Math.sin(t * 30) * 2 * u, H * 0.6 - ease(k / 0.5) * 30 * u, (34 + ease(k / 0.5) * 34) * u, t); }
      else palFig(c, px, py, 34 * u, t, happy, !joined);
      // ハート
      if (joined && !foe) { const k = (performance.now() - joined) / 1000; for (let i = 0; i < 6; i++) { const p = clamp(k * 0.8 - i * 0.12); if (p <= 0 || p >= 1) continue; const hx = px + Math.sin(i * 2 + p * 4) * 40 * u, hy = py - 40 * u - p * 120 * u; c.fillStyle = `rgba(255,120,160,${1 - p})`; c.font = `${Math.round(18 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; fillC(c, '♥', hx, hy); } }
    });
    const lv = x.s.pal ? x.s.pal.lv : 0;
    const note = x.html(`<div class="evu-note">ひとりぼっちの分身が、こっちを見ている…<br><small>${lv ? '今の相棒と合わさって、強くなるかも' : '本体のまわりを回って、たたかってくれるかも'}</small></div>`);
    x.body.append(x.html('<div class="evu-spacer"></div>'), note);
    x.foot(x.back());
    x.tapAnywhere('連れていく', async () => {
      x.foot(); note.remove();
      // 運がわるいと（3割）、正体をあらわして襲いかかってくる
      if (Math.random() < 0.3) {
        foe = performance.now(); x.sfx('ev_bite'); x.sfx('ev_ambush'); x.flash('#ff1a2a', 0.6, 0.8); x.shake(24, 0.7);
        x.api.next('strayFoe', 1);
        x.result('襲いかかってきた！', '次のフェーズ、正体をあらわした分身が襲ってくる', { top: 6, cls: 'bad' });
        await wait(1000); x.foot(x.ok(() => x.done())); return;
      }
      joined = performance.now(); x.sfx('born'); x.sfx('ev_win');
      const n = x.api.addPal();
      x.result(n > 1 ? '相棒が強くなった！' : '仲間になった！', n > 1 ? `相棒 Lv${n}` : '本体のまわりを回って、たたかってくれる', { top: 8 });
      await wait(1000); x.foot(x.ok(() => x.done()));
    });
  },

  // ---------------- 闇市：路地裏の紫のネオン。フードの商人。最高のカードは、高い ----------------
  blackmarket(x) {
    x.sfx('ev_altar', { pitch: 1.4 });
    const P = { super: 10, mythic: 18 };
    const items = x.api.roll({ count: 2, floor: 'mythic', noCurse: true }).map((ch) => ({ ch, price: P.mythic }));
    const evoable = x.api.ownedSkills().filter((k) => k.lv >= SKILL_MAX && !k.evo);
    const kiwami = evoable.length ? pickOne(evoable) : null;
    if (!kiwami) { const c3 = x.api.roll({ count: 1, floor: 'super', top: 'super', noCurse: true })[0]; if (c3) items.push({ ch: c3, price: P.super }); }
    x.draw((c, t, W, H, u) => {
      c.fillStyle = '#07040c'; c.fillRect(0, 0, W, H);
      // 路地の壁
      c.fillStyle = '#120c1a'; c.fillRect(0, 0, W * 0.14, H); c.fillRect(W * 0.86, 0, W * 0.14, H);
      // ネオンの看板「闇」（ときどきチカチカ）
      const on = (Math.floor(t * 7) % 23) !== 0;
      // 縦長のネオン看板（右の壁）
      const nx = W * 0.9, ny = H * 0.04;
      c.save(); c.shadowColor = '#c040ff'; c.shadowBlur = on ? 24 * u : 0; c.strokeStyle = on ? '#e8a8ff' : '#4a2a5a'; c.lineWidth = 2.5 * u; c.strokeRect(nx - 17 * u, ny, 34 * u, 92 * u);
      c.fillStyle = on ? '#f4d8ff' : '#4a2a5a'; c.font = `${Math.round(24 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, '闇', nx, ny + 26 * u); fillC(c, '市', nx, ny + 64 * u); c.restore();
      // 商人：フードの影と光る目（せりふのすぐ上）
      const nr = x.rect(bnote), mx = W / 2, my = nr ? nr.y - 30 * u : H * 0.3;
      c.fillStyle = '#05030a'; c.beginPath(); c.moveTo(mx - 60 * u, my + 70 * u); c.quadraticCurveTo(mx - 50 * u, my - 40 * u, mx, my - 50 * u); c.quadraticCurveTo(mx + 50 * u, my - 40 * u, mx + 60 * u, my + 70 * u); c.fill();
      const bl = (t % 3.5) < 0.12 ? 0.1 : 1;
      c.fillStyle = '#ffcc33'; c.shadowColor = '#ffcc33'; c.shadowBlur = 12 * u; for (const ex of [-12, 12]) { c.beginPath(); c.ellipse(mx + ex * u, my, 5 * u, 2.5 * u * bl, 0, 0, TAU); c.fill(); } c.shadowBlur = 0;
      // にやり
      c.strokeStyle = '#ffcc33'; c.lineWidth = 1.5 * u; c.beginPath(); c.arc(mx, my + 12 * u, 10 * u, 0.2, Math.PI - 0.2); c.stroke();
      // 煙
      for (let i = 0; i < 12; i++) { const p = (t * 0.15 + i / 12) % 1; c.fillStyle = `rgba(150,90,200,${0.12 * (1 - p)})`; c.beginPath(); c.arc(W * (0.2 + (i % 4) * 0.2) + Math.sin(t + i) * 20 * u, H * (0.9 - p * 0.8), (20 + p * 40) * u, 0, TAU); c.fill(); }
    });
    const bnote = x.html('<div class="evu-note evu-say">「ヒッヒ…いい品だよ。高いがね」</div>');
    x.body.append(x.html('<div class="evu-spacer m"></div>'), bnote);
    const wrap = x.html('<div class="evu-stall evu-black"></div>');
    const buy = (row, tag, price, fn) => {
      tag.addEventListener('click', () => {
        if (row.classList.contains('sold')) return;
        if (x.s.comets < price) { tag.classList.remove('shake'); void tag.offsetWidth; tag.classList.add('shake'); x.sfx('ev_coin', { pitch: 0.6 }); x.toast('「金が足りないなら、帰りな」', 'bad'); return; }
        x.api.addComets(-price); fn(); x.sfx('ev_buy'); x.sfx('gsr');
        row.classList.add('sold'); tag.innerHTML = '<b class="evu-sold">売約</b>'; x.toast('「毎度あり…ヒッヒ」'); x.foot(x.ok(() => x.done()));
        wrap.querySelectorAll('.evu-price').forEach((b) => b._sync && b._sync());
      });
      tag._sync = () => tag.classList.toggle('cant', x.s.comets < price && !row.classList.contains('sold')); tag._sync();
    };
    items.forEach((it, i) => {
      const row = x.html(`<div class="evu-shelf" style="animation-delay:${0.6 + i * 0.15}s"></div>`);
      const tag = x.html(`<button class="evu-price"><span class="evu-ptop">${x.cometImg(285)}<b>${it.price}</b></span><small>買う</small></button>`);
      row.append(x.card(it.ch), tag); wrap.appendChild(row);
      buy(row, tag, it.price, () => x.api.give(it.ch));
    });
    if (kiwami) {
      const row = x.html(`<div class="evu-shelf" style="animation-delay:${0.6 + items.length * 0.15}s"></div>`);
      const scroll = x.html(`<div class="evu-kiwami"><span class="kiwami">極</span><div><b>極みの秘伝書</b><small>${x.skillName(kiwami.id)} を、いますぐ進化させる</small></div></div>`);
      const tag = x.html(`<button class="evu-price"><span class="evu-ptop">${x.cometImg(48)}<b>30</b></span><small>買う</small></button>`);
      row.append(scroll, tag); wrap.appendChild(row);
      buy(row, tag, 30, () => x.api.maxSkill(kiwami.id));
    }
    x.body.appendChild(wrap); x.fit(wrap);
    // 立ち去るボタンは、せりふの横に（品が多くて下に入りきらないため）
    x.foot(x.back());
  },

  // ---------------- スロット：ネオンの台。レバーを引くと3つのリールが回り、順に止まる ----------------
  slot(x) {
    x.sfx('ev_coin', { pitch: 1.5 });
    const reels = [0, 1, 2].map(() => ({ pos: Math.random() * 5, v: 0, stop: null }));
    let lever = 0, lights = 0, free = 1, busy = false, pulling = null;
    let chance = 0, reach = 0, jack = null;   // 熱い演出：チャンス予告・リーチ・大当たり（始まった時刻）
    const sparks = [];
    x.draw((c, t, W, H, u) => {
      const now = performance.now();
      const g = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.8); g.addColorStop(0, '#2a0a2a'); g.addColorStop(1, '#05020a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 大当たり：台の後ろに虹の光が回る
      if (jack) { const k = (now - jack.t0) / 1000; if (k < 3.2) { const a = Math.min(1, k * 3) * Math.min(1, (3.2 - k) * 2); for (let i = 0; i < 18; i++) { c.save(); c.translate(W / 2, H * 0.33); c.rotate(t * 0.6 + (i / 18) * TAU); c.fillStyle = `hsla(${i * 20 + t * 120},95%,62%,${(jack.big ? 0.45 : 0.28) * a})`; c.beginPath(); c.moveTo(0, 0); c.lineTo(H, -H * 0.08); c.lineTo(H, H * 0.08); c.fill(); c.restore(); } } }
      // リーチ：まわりが暗くなり、赤い光が脈打つ
      if (reach) { const k = (now - reach) / 1000; c.fillStyle = `rgba(0,0,0,${Math.min(0.55, k * 1.5)})`; c.fillRect(0, 0, W, H); const p = 0.5 + 0.5 * Math.sin(t * 12); const eg = c.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.7); eg.addColorStop(0, 'rgba(255,0,40,0)'); eg.addColorStop(1, `rgba(255,0,40,${0.35 * p})`); c.fillStyle = eg; c.fillRect(0, 0, W, H); }
      // 台とレバーをまとめて、画面の真ん中に置く
      const bw = W * 0.66, bh = H * 0.33, bx = (W - bw) / 2, by = H * 0.17;   // 台そのものを真ん中に（レバーは右にはみ出す）
      c.fillStyle = '#b01828'; c.beginPath(); c.roundRect(bx, by, bw, bh, 16 * u); c.fill(); c.strokeStyle = '#ffd84a'; c.lineWidth = 4 * u; c.stroke();
      // まわりの電球（当たると速く光る）
      const sp = reach || lights > 0 ? 18 : chance ? 12 : 4, nb = 13;
      // リーチ・チャンスの間は、台のふちが虹色・赤に点滅する
      if (reach || chance) { c.strokeStyle = reach ? (Math.floor(t * 10) % 2 ? '#ff2040' : '#ffd84a') : `hsl(${t * 400 % 360},95%,60%)`; c.lineWidth = 8 * u; c.beginPath(); c.roundRect(bx - 4 * u, by - 4 * u, bw + 8 * u, bh + 8 * u, 18 * u); c.stroke(); }
      for (let i = 0; i < nb; i++) for (const yy of [by + 8 * u, by + bh - 8 * u]) { const px = bx + 14 * u + (i / (nb - 1)) * (bw - 28 * u); const on = (Math.floor(t * sp) + i + (yy > by + 20 * u ? 1 : 0)) % 3 === 0; c.fillStyle = on ? '#fff6a0' : '#6a4a10'; c.beginPath(); c.arc(px, yy, 3.5 * u, 0, TAU); c.fill(); }
      c.fillStyle = '#ffd84a'; c.font = `${Math.round(18 * u)}px 'Press Start 2P', monospace`; c.textAlign = 'center'; fillC(c, 'LUCKY', bx + bw / 2, by + 30 * u);
      // リールの窓（3つを台の中央にそろえる）
      const gap = bw * 0.03, rw = (bw - 28 * u - gap * 2) / 3, rh = bh * 0.56, ry = by + bh * 0.3, rx0 = bx + 14 * u;
      reels.forEach((r, i) => {
        const rx = rx0 + i * (rw + gap);
        if (r.v > 0) { r.pos += r.v / 60; if (r.stop != null && r.pos >= r.stop) { r.pos = r.stop; r.v = 0; r.stop = null; r.bounce = performance.now(); x.sfx('ev_bowl', { pitch: 2.2 }); } }
        c.save(); c.beginPath(); c.rect(rx, ry, rw, rh); c.clip();
        c.fillStyle = '#fbf6ea'; c.fillRect(rx, ry, rw, rh);
        const cell = rh / 1.6, bo = r.bounce ? Math.sin(clamp((performance.now() - r.bounce) / 200) * Math.PI) * 6 * u : 0;
        for (let k = -1; k <= 2; k++) { const idx = ((Math.floor(r.pos) + k) % 5 + 5) % 5, off = (r.pos % 1) * cell; slotSym(c, rx + rw / 2, ry + rh / 2 + (k * cell) - off + bo, Math.min(cell, rw) * 0.9, idx); }
        if (r.v > 0) { c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(rx, ry, rw, rh); }
        const sh = c.createLinearGradient(0, ry, 0, ry + rh); sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = sh; c.fillRect(rx, ry, rw, rh);
        c.restore(); c.strokeStyle = '#1a0a10'; c.lineWidth = 3 * u; c.strokeRect(rx, ry, rw, rh);
        // リーチ中、最後のリールを光らせる
        if (reach && i === 2 && r.v > 0) { c.strokeStyle = `rgba(255,${200 + 55 * Math.sin(t * 20)},80,0.95)`; c.lineWidth = 5 * u; c.strokeRect(rx - 3 * u, ry - 3 * u, rw + 6 * u, rh + 6 * u); }
      });
      // 文字の演出：チャンス!? ／ リーチ！ ／ 大当たり
      const big = (txt, y, col, sc) => { c.save(); c.translate(W / 2, y); c.scale(sc, sc); c.font = `${Math.round(30 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.lineWidth = 8 * u; c.strokeStyle = '#1a0010'; strokeC(c, txt, 0, 0); c.fillStyle = col; fillC(c, txt, 0, 0); c.restore(); };
      if (chance) { const k = (now - chance) / 1000; if (k < 1.1) big('チャンス!?', by + bh + 30 * u, `hsl(${t * 500 % 360},95%,65%)`, 0.8 + back(k / 0.3) * 0.3); }
      if (reach) { const k = (now - reach) / 1000; big('リーチ！', by + bh + 30 * u, Math.floor(t * 8) % 2 ? '#ff3050' : '#ffe14a', 1 + 0.08 * Math.sin(t * 14) + (k < 0.25 ? (0.25 - k) * 3 : 0)); }
      if (jack) { const k = (now - jack.t0) / 1000; if (k < 3.2) big(jack.big ? '大当たり！！' : 'そろった！', by + bh + 30 * u, jack.big ? `hsl(${t * 600 % 360},95%,65%)` : '#ffe14a', back(k / 0.35) * (1 + 0.05 * Math.sin(t * 10))); }
      // 当たりの火花（コメットが飛び散る）
      for (const sp2 of sparks) { sp2.x += sp2.vx; sp2.y += sp2.vy; sp2.vy += 0.25 * u; sp2.life -= 1 / 60; if (sp2.life > 0) drawComet(c, sp2.x, sp2.y, 6 * u, sp2.h, t * 5, sp2.life * 6); }
      while (sparks.length && sparks[0].life <= 0) sparks.shift();
      if (jack && jack.burst) { jack.burst = false; for (let i = 0; i < (jack.big ? 70 : 36); i++) { const a = Math.random() * TAU, v = (4 + Math.random() * 8) * u; sparks.push({ x: W / 2, y: by + bh * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5 * u, life: 1.2 + Math.random() * 0.8, h: COMET_HUES[i % 5] }); } }
      c.strokeStyle = 'rgba(255,60,60,0.7)'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(bx + 8 * u, ry + rh / 2); c.lineTo(bx + bw - 8 * u, ry + rh / 2); c.stroke();
      // レバー：右の横腹から。玉を下へ引きおろす（lever 0＝上、1＝下）
      const px = bx + bw + 6 * u, py = by + bh * 0.55, L = bh * 0.42, th = lever * Math.PI;
      const kx = px + 14 * u + Math.sin(th) * 12 * u, ky = py - Math.cos(th) * L;
      c.fillStyle = '#7a7a86'; c.beginPath(); c.roundRect(px - 6 * u, py - 16 * u, 16 * u, 32 * u, 4 * u); c.fill();
      c.strokeStyle = '#d8d8e0'; c.lineWidth = 6 * u; c.lineCap = 'round'; c.beginPath(); c.moveTo(px + 6 * u, py); c.lineTo(kx, ky); c.stroke();
      const kg = c.createRadialGradient(kx - 4 * u, ky - 4 * u, 0, kx, ky, 14 * u); kg.addColorStop(0, '#ff8a8a'); kg.addColorStop(1, '#c01010'); c.fillStyle = kg; c.beginPath(); c.arc(kx, ky, 13 * u, 0, TAU); c.fill();
      x._lever = { kx, ky, top: py - L, L, u };
      if (!busy && !pulling && lever < 0.05) tapHint(c, kx, ky - 18 * u, u, t, '下に引く');
      if (lights > 0) lights -= 1 / 60;
      // 手をはなしたら、レバーはばねで上へ戻る
      if (!pulling && lever > 0) lever = Math.max(0, lever - 0.06);
    });
    // レバー：玉をつかんで下へ。いちばん下まで引くと回る。軽くさわっただけでも、引きおろして回す
    x.drag({
      down(px, py) { const L = x._lever; if (!L || busy) return false; if (Math.hypot(px - L.kx, py - L.ky) > 30 * L.u) return false; pulling = { y0: py, l0: lever, moved: false }; return true; },
      move(px, py) { if (!pulling) return; const L = x._lever; lever = clamp(pulling.l0 + (py - pulling.y0) / (L.L * 2)); if (Math.abs(py - pulling.y0) > 6) pulling.moved = true; if (lever >= 0.7) { pulling = null; lever = 1; spin(); } },
      up() { if (!pulling) return; const tapped = !pulling.moved; pulling = null; if (tapped) (async () => { pulling = { auto: true }; for (let k = 0; k <= 10; k++) { lever = k / 10; await wait(16); } pulling = null; spin(); })(); },
    });
    x._hot = (px, py) => { const L = x._lever; return !!L && !busy && Math.hypot(px - L.kx, py - L.ky) < 30 * L.u; };
    x.tap(() => {}, x._hot);
    const res = x.html('<div class="evu-dres"></div>');
    const sym = (i) => `<canvas class="evu-sym" width="40" height="40" data-i="${i}"></canvas>`;
    const row3 = (i) => sym(i) + sym(i) + sym(i);
    const note = x.html(`<div class="evu-sheet evu-pay">
      <div class="evu-sheet-r"><span>1回まわす</span><b>1回目 無料 ／ 以降 ${x.cometImg(200)} 3</b></div>
      <div class="evu-sheet-h">役</div>
      <div class="evu-paygrid">
        <div class="evu-sheet-r"><span class="syms">${row3(0)}</span><b>最高のカード</b></div>
        <div class="evu-sheet-r"><span class="syms">${row3(1)}</span><b>コメット+20</b></div>
        <div class="evu-sheet-r"><span class="syms">${row3(2)}</span><b>レアカード</b></div>
        <div class="evu-sheet-r"><span class="syms">${row3(3)}</span><b>レアカード</b></div>
        <div class="evu-sheet-r"><span>どれか2つ</span><b>コメット+4</b></div>
        <div class="evu-sheet-r bad"><span class="syms">${row3(4)}</span><b>HP −30%</b></div>
      </div>
    </div>`);
    for (const cv2 of note.querySelectorAll('canvas.evu-sym')) { const g = cv2.getContext('2d'); g.translate(20, 20); slotSym(g, 0, 0, 36, Number(cv2.dataset.i)); }
    x.body.append(x.html('<div class="evu-spacer"></div>'), res, note);
    x.foot(x.back());
    async function spin() {
      if (busy) return; if (!free && x.s.comets < 3) { x.toast('コメットが足りない…', 'bad'); x.sfx('ev_coin', { pitch: 0.6 }); return; }
      busy = true; res.innerHTML = ''; x.foot(); note.hidden = false;
      if (free) free = 0; else { x.api.addComets(-3); x.sfx('ev_coin'); }
      x.sfx('ev_crank');
      // 結果を先に決める（レアのできごとなので、少し当たりやすい）
      const r = Math.random();
      let out;
      if (r < 0.06) out = [0, 0, 0]; else if (r < 0.14) out = [1, 1, 1]; else if (r < 0.26) { const s0 = 2 + Math.floor(Math.random() * 2); out = [s0, s0, s0]; } else if (r < 0.3) out = [4, 4, 4];
      else { const a = Math.floor(Math.random() * 5), b = Math.floor(Math.random() * 5); let cc = Math.floor(Math.random() * 5); if (a === b && b === cc) cc = (cc + 1) % 5; out = [a, b, cc]; }
      const [a, b, cc] = out, three = a === b && b === cc;
      // チャンス予告：そろうときは、ときどき回る前に台が虹色に光る（はずれでも、たまに光る＝ガセ）
      if ((three && a !== 4 && Math.random() < 0.6) || (!three && Math.random() < 0.08)) { chance = performance.now(); x.sfx('ev_reach'); x.flash('#fff', 0.25, 0.5); await wait(1100); chance = 0; }
      reels.forEach((rl) => { rl.v = 14; rl.bounce = 0; });
      x.sfx('ev_dice');
      const stopAt = (i, cyc = 2) => { const rl = reels[i]; const base = Math.ceil(rl.pos) + 5 * cyc; rl.stop = base + ((out[i] - base) % 5 + 5) % 5; };
      await wait(800); stopAt(0);
      await wait(550); stopAt(1);
      if (a === b) {
        // リーチ：最後のリールはゆっくり回り、心臓の音が鳴る
        // じっくり見せる：だんだん遅くなり、最後はゆっくり1コマずつ。止まるまで心臓の音
        await wait(350); reach = performance.now(); x.sfx('ev_reach'); x.shake(6, 0.3);
        reels[2].v = 9;
        for (const v of [7, 5.5, 4, 3]) { await wait(650); x.sfx('ev_heart'); reels[2].v = v; }
        await wait(650); x.sfx('ev_heart');
        reels[2].v = 2.6; stopAt(2, 1);
        (async () => { while (reels[2].v > 0 && !x.dead) { await wait(700); if (reels[2].v > 0) x.sfx('ev_heart'); } })();
      } else { await wait(550); stopAt(2); }
      // 3つとも本当に止まるまで待ってから、結果を出す
      while (reels.some((rl) => rl.v > 0)) await wait(50);
      await wait(350); reach = 0;
      let msg, good = true;
      if (three && a !== 4) { jack = { t0: performance.now(), big: a === 0, burst: true }; x.sfx(a === 0 ? 'ev_jackpot' : 'ev_win'); x.flash(a === 0 ? '#fff6a0' : '#fff', 0.5, a === 0 ? 1 : 0.6); if (a === 0) x.shake(20, 0.7); }
      if (a === b && b === cc) {
        lights = 2;
        if (a === 0) { msg = '777！ 大当たり！'; x.sfx('gssr'); x.flash('#fff6a0', 0.6); const ch = x.api.roll({ count: 1, floor: 'mythic', noCurse: true })[0]; if (ch) { const card = x.card(ch); card.classList.add('evu-pop'); x.api.give(ch); res.appendChild(card); } }
        else if (a === 1) { msg = '星そろい！ コメット +20'; x.api.addComets(20); x.sfx('ev_win'); }
        else if (a === 4) { msg = '骨そろい… HPが30%減った'; good = false; lights = 0; x.api.hurt(0.3); x.sfx('ev_lose'); x.shake(12, 0.4); }
        else { msg = 'そろった！'; x.sfx('gsr'); const ch = x.api.roll({ count: 1, floor: 'super', noCurse: true })[0]; if (ch) { const card = x.card(ch); card.classList.add('evu-pop'); x.api.give(ch); res.appendChild(card); } }
      } else if (a === b || b === cc || a === cc) { msg = '2つそろい　コメット +4'; x.api.addComets(4); x.sfx('ev_buy'); }
      else { msg = 'はずれ'; good = false; x.sfx('ev_lose'); }
      res.insertBefore(x.html(`<div class="evu-call ${good ? 'win' : 'lose'}">${msg}</div>`), res.firstChild); x.fit(res);
      if (res.querySelector('.evu-card')) note.hidden = true;   // カードが出たら、役の表をしまって場所をあける
      busy = false; x.foot(x.ok(() => x.done()));
    }
  },

  // ---------------- ルーレット：8つのますの輪を回す。針が止まったところで運命が決まる ----------------
  roulette(x) {
    let ang = 0, vel = 0.3, target = null, done = false;
    x.draw((c, t, W, H, u) => {
      const g = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.8); g.addColorStop(0, '#0a2a3a'); g.addColorStop(1, '#02060c'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      rays(c, W / 2, H * 0.44, H * 0.7, t * 0.3, 16, '120,220,255', 0.06);
      const cx = W / 2, cy = H * 0.44, R = Math.min(W * 0.38, H * 0.25);
      if (target != null) { const left = target - ang; const v = Math.max(0.004, left * 0.035); ang += Math.min(v, left); if (left <= 0.0005) { ang = target; target = null; x._stop && x._stop(); } }
      else if (!done) ang += vel / 60;
      // 外の輪と電球
      c.fillStyle = '#5a3a14'; c.beginPath(); c.arc(cx, cy, R + 14 * u, 0, TAU); c.fill();
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; c.fillStyle = (Math.floor(t * 6) + i) % 2 ? '#fff6a0' : '#8a6a20'; c.beginPath(); c.arc(cx + Math.cos(a) * (R + 7 * u), cy + Math.sin(a) * (R + 7 * u), 3 * u, 0, TAU); c.fill(); }
      const n = WHEEL.length, seg = TAU / n;
      for (let i = 0; i < n; i++) {
        const a0 = ang + i * seg - Math.PI / 2 - seg / 2;
        c.fillStyle = WHEEL[i].col; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a0 + seg); c.closePath(); c.fill();
        c.strokeStyle = '#1a1008'; c.lineWidth = 2 * u; c.stroke();
        c.save(); c.translate(cx, cy); c.rotate(a0 + seg / 2); c.fillStyle = WHEEL[i].ink; c.font = `${Math.round(13 * u)}px DotGothic16, sans-serif`; c.textAlign = 'right'; c.textBaseline = 'middle'; fillC(c, WHEEL[i].name, R - 10 * u, 0); c.restore();
      }
      c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(cx, cy, 18 * u, 0, TAU); c.fill(); c.strokeStyle = '#5a3a00'; c.lineWidth = 3 * u; c.stroke();
      x._geo = { cx, cy, R, u };
      if (target == null && !done && !spun) tapHint(c, cx, cy - R - 26 * u, u, t, 'まわす');
      // 針（上）
      c.fillStyle = '#fff'; c.strokeStyle = '#1a1008'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(cx, cy - R + 14 * u); c.lineTo(cx - 12 * u, cy - R - 22 * u); c.lineTo(cx + 12 * u, cy - R - 22 * u); c.closePath(); c.fill(); c.stroke();
    });
    const note = x.html('<div class="evu-note">輪をさわると回る。止まったますのことが起きる</div>');
    x.body.append(x.html('<div class="evu-spacer"></div>'), note);
    const onWheel = (px, py) => { const g = x._geo; return !spun && g && Math.hypot(px - g.cx, py - g.cy) < g.R + 14 * g.u; };
    let spun = false;
    x.tap((px, py) => { if (onWheel(px, py)) go(); }, onWheel);
    x.foot(x.back());
    const go = () => {
      spun = true; x.foot(); note.remove(); x.sfx('ev_crank');
      // 当たりのます（重みづけ）を決めて、そこで止まるように回す
      const W8 = [6, 18, 14, 10, 16, 10, 14, 12];
      let r = Math.random() * W8.reduce((a, b) => a + b, 0), pick = 0; for (let i = 0; i < 8; i++) { r -= W8[i]; if (r <= 0) { pick = i; break; } }
      const seg = TAU / 8, want = -pick * seg + (Math.random() - 0.5) * seg * 0.6;
      const base = ang + TAU * 5; target = base + (((want - base) % TAU) + TAU) % TAU;
      let tick = 0; const tk = setInterval(() => { if (target == null || x.dead) return clearInterval(tk); x.sfx('ev_coin', { pitch: 1.8 + (tick++ % 2) * 0.2 }); }, 110);
      x._stop = async () => {
        x._stop = null; done = true; clearInterval(tk);
        const w = WHEEL[pick]; let good = true;
        if (pick === 0) { x.sfx('gssr'); x.flash('#fff6a0', 0.6); }
        if (pick === 0 || pick === 2) { const ch = x.api.roll({ count: 1, floor: pick === 0 ? 'mythic' : 'super', noCurse: true })[0]; if (ch) { const card = x.card(ch); card.classList.add('evu-pop'); x.api.give(ch); x.body.appendChild(card); x.fit(x.body); } if (pick === 2) x.sfx('gsr'); }
        if (pick === 1) { good = false; x.sfx('ev_lose'); }
        if (pick === 3) { const cu = x.api.curse(); good = false; x.sfx('ev_curse'); if (cu) w._sub = `呪い「${cu.name}」を受けた`; }
        if (pick === 4) { x.api.addComets(10); x.sfx('ev_win'); }
        if (pick === 5) { x.api.stealHalf(); good = false; x.sfx('ev_lose'); x.shake(10, 0.4); }
        if (pick === 6) { x.api.heal(1); x.sfx('ev_spring'); }
        if (pick === 7) { x.api.hurt(0.3); good = false; x.sfx('ev_lose'); x.flash('#ff1a2a', 0.4, 0.5); x.shake(14, 0.4); }
        x.body.insertBefore(x.html(`<div class="evu-big ${good ? '' : 'bad'}">${w.name}${pick === 0 ? '！！' : ''}</div>`), x.body.querySelector('.evu-card'));
        x.body.appendChild(x.html(`<div class="evu-note">${w._sub || w.sub}</div>`)); delete w._sub;
        await wait(600); x.foot(x.ok(() => x.done()));
      };
    };
  },

  // ---------------- おみくじ：神社。六角の箱を振ると棒が出て、くじが開く。大凶なら… ----------------
  omikuji(x) {
    const R = [
      { k: '大吉', w: 15, col: '#e01818', sub: 'レアなカードを1枚と、HP全回復', fn: (a) => { a.heal(1); return a.roll({ count: 1, floor: 'super', noCurse: true })[0]; } },
      { k: '中吉', w: 20, col: '#e01818', sub: 'コメット +6', fn: (a) => { a.addComets(6); } },
      { k: '小吉', w: 20, col: '#d04818', sub: 'コメット +3', fn: (a) => { a.addComets(3); } },
      { k: '吉', w: 20, col: '#d04818', sub: 'HPが30%回復', fn: (a) => { a.heal(0.3); } },
      { k: '末吉', w: 10, col: '#6a5a3a', sub: '何も起きない…けど、悪くもない', fn: () => {} },
      { k: '凶', w: 10, col: '#3a3a5a', sub: 'HPが20%減った', fn: (a) => { a.hurt(0.2); } },
      { k: '大凶', w: 5, col: '#000', sub: '', fn: null },
    ];
    let shake = 0, stick = 0, slip = 0, res = null;
    x.draw((c, t, W, H, u) => {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2a4a'); g.addColorStop(0.6, '#f0a070'); g.addColorStop(1, '#e8d8b0'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 鳥居
      c.fillStyle = '#c8281a'; c.fillRect(W * 0.12, H * 0.1, W * 0.76, 14 * u); c.fillRect(W * 0.16, H * 0.1 + 22 * u, W * 0.68, 9 * u); c.fillRect(W * 0.2, H * 0.1, 14 * u, H * 0.6); c.fillRect(W * 0.8 - 14 * u, H * 0.1, 14 * u, H * 0.6);
      c.fillStyle = '#1a1010'; c.fillRect(W * 0.1, H * 0.1 - 8 * u, W * 0.8, 9 * u);
      // 桜の花びら
      for (let i = 0; i < 24; i++) { const p = (t * 0.12 + i / 24) % 1; c.fillStyle = 'rgba(255,190,210,0.85)'; c.save(); c.translate(W * ((i * 0.618 + p * 0.3) % 1), H * p); c.rotate(t * 2 + i); c.beginPath(); c.ellipse(0, 0, 4 * u, 2.5 * u, 0, 0, TAU); c.fill(); c.restore(); }
      // 六角の箱
      const bx = W / 2 + (shake ? Math.sin(t * 40) * 10 * u : 0), by = H * 0.42 + (shake ? Math.cos(t * 33) * 6 * u : 0), rot = shake ? Math.sin(t * 25) * 0.4 : 0;
      x._geo = { x: W / 2, y: H * 0.42, u };
      if (!drawn) tapHint(c, W / 2, H * 0.42 - 74 * u, u, t, 'ふる');
      c.save(); c.translate(bx, by); c.rotate(rot + (stick ? Math.PI * 0.85 * clamp(stick * 3) : 0));
      c.fillStyle = '#8a5a2a'; c.fillRect(-26 * u, -60 * u, 52 * u, 120 * u); c.fillStyle = '#a8703a'; c.fillRect(-26 * u, -60 * u, 18 * u, 120 * u);
      c.fillStyle = '#f6efd8'; c.fillRect(-14 * u, -40 * u, 28 * u, 70 * u); c.fillStyle = '#c01818'; c.font = `${Math.round(18 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, '御', 0, -26 * u); fillC(c, '籤', 0, -4 * u); fillC(c, '箱', 0, 18 * u);
      // 出てくる棒
      if (stick) { const k = clamp((stick - 0.3) * 2); c.fillStyle = '#e8d8a8'; c.fillRect(-3 * u, 60 * u, 6 * u, 50 * u * k); }
      c.restore();
      // くじ（開く）
      if (slip > 0 && res) {
        const k = ease(slip), cx = W / 2, cy = H * 0.42, w = 90 * u, h = 220 * u * k;
        c.save(); c.translate(cx, cy);
        c.fillStyle = res.k === '大凶' ? '#1a0a0a' : '#fbf6ea'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = res.k === '大凶' ? '#c00' : '#c01818'; c.lineWidth = 2 * u; c.strokeRect(-w / 2 + 6 * u, -h / 2 + 6 * u, w - 12 * u, h - 12 * u);
        if (k > 0.8) { c.fillStyle = res.k === '大凶' ? '#ff2020' : res.col; c.font = `${Math.round(40 * u)}px DotGothic16, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; [...res.k].forEach((ch, i, arr) => fillC(c, ch, 0, (i - (arr.length - 1) / 2) * 50 * u)); }
        c.restore();
      }
    });
    const note = x.html('<div class="evu-note">箱をふって、おみくじを引く</div>');
    x.body.append(x.html('<div class="evu-spacer"></div>'), note);
    let drawn = false;
    const onBox = (px, py) => { const g = x._geo; return !drawn && g && Math.abs(px - g.x) < 40 * g.u && Math.abs(py - g.y) < 70 * g.u; };
    x.tap((px, py) => { if (onBox(px, py)) draw(); }, onBox);
    x.foot(x.back());
    const draw = async () => {
      drawn = true; x.foot(); note.remove();
      shake = 1; x.sfx('ev_dice'); await wait(900); shake = 0;
      for (let k = 0; k <= 30; k++) { stick = k / 30; await wait(16); }
      x.sfx('ev_seal', { pitch: 1.5 });
      let r = Math.random() * 100; res = R[R.length - 1]; for (const it of R) { r -= it.w; if (r <= 0) { res = it; break; } }
      await wait(300); stick = 0;
      for (let k = 0; k <= 20; k++) { slip = k / 20; await wait(16); }
      if (res.k === '大凶') {
        x.sfx('ev_kyo'); x.flash('#000', 0.8, 0.9); x.shake(18, 0.6);
        x.body.appendChild(x.html('<div class="evu-big bad">大凶…</div>'));
        await wait(1500); x.goto('kyo'); return;
      }
      const good = ['大吉', '中吉', '小吉', '吉'].includes(res.k);
      x.sfx(res.k === '大吉' ? 'gssr' : good ? 'ev_win' : res.k === '凶' ? 'ev_lose' : 'ev_coin');
      if (res.k === '凶') x.shake(10, 0.3);
      const ch = res.fn(x.api);
      x.body.appendChild(x.html(`<div class="evu-note">${res.sub}</div>`));
      if (ch) { const card = x.card(ch); card.classList.add('evu-pop'); x.api.give(ch); x.body.appendChild(card); x.fit(x.body); }
      await wait(500); x.foot(x.ok(() => x.done()));
    };
  },

  // ---------------- 時の旅人：歯車と砂時計の旅人。スキルを1つ渡すと、同じレベルの別のスキルに変えてくれる ----------------
  traveler(x) {
    x.flash('#cfe8ff', 0.9, 0.9); x.sfx('ev_star'); wait(200).then(() => x.sfx('ev_gong', { pitch: 1.6 }));
    let sand = 0;
    x.draw((c, t, W, H, u) => {
      const g = c.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, H * 0.9); g.addColorStop(0, '#1a3a5a'); g.addColorStop(1, '#04060e'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      // 回る歯車
      const gear = (gx, gy, r, n, sp, col) => { c.save(); c.translate(gx, gy); c.rotate(t * sp); c.strokeStyle = col; c.lineWidth = 3 * u; c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, rr = i % 2 ? r : r * 1.15; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.3, 0, TAU); c.stroke(); c.restore(); };
      gear(W * 0.2, H * 0.18, 50 * u, 12, 0.3, 'rgba(160,200,255,0.25)'); gear(W * 0.85, H * 0.3, 70 * u, 16, -0.2, 'rgba(160,200,255,0.2)'); gear(W * 0.5, H * 0.1, 30 * u, 8, 0.6, 'rgba(255,220,140,0.3)');
      // 時計の文字盤（大きく、うっすら）
      c.strokeStyle = 'rgba(200,220,255,0.18)'; c.lineWidth = 2 * u; c.beginPath(); c.arc(W / 2, H * 0.3, 120 * u, 0, TAU); c.stroke();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.fillStyle = 'rgba(200,220,255,0.35)'; c.font = `${Math.round(12 * u)}px 'Press Start 2P', monospace`; c.textAlign = 'center'; c.textBaseline = 'middle'; fillC(c, ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'][i], W / 2 + Math.sin(a) * 105 * u, H * 0.3 - Math.cos(a) * 105 * u); }
      c.strokeStyle = 'rgba(255,220,140,0.6)'; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(W / 2, H * 0.3); c.lineTo(W / 2 + Math.sin(-t * 2) * 90 * u, H * 0.3 - Math.cos(-t * 2) * 90 * u); c.stroke();
      // 旅人：外套の影と、手に砂時計
      const tx = W / 2, ty = H * 0.3;
      c.fillStyle = '#0a1020'; c.beginPath(); c.moveTo(tx - 40 * u, ty + 70 * u); c.quadraticCurveTo(tx - 36 * u, ty - 30 * u, tx, ty - 44 * u); c.quadraticCurveTo(tx + 36 * u, ty - 30 * u, tx + 40 * u, ty + 70 * u); c.fill();
      c.fillStyle = '#9ad8ff'; for (const ex of [-8, 8]) { c.beginPath(); c.arc(tx + ex * u, ty - 14 * u, 2.5 * u, 0, TAU); c.fill(); }
      // 砂時計
      const hx = tx, hy = ty + 30 * u; c.save(); c.translate(hx, hy); c.rotate(sand > 0 ? Math.PI * ease(clamp(sand)) : 0);
      c.strokeStyle = '#ffd84a'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(-12 * u, -18 * u); c.lineTo(12 * u, -18 * u); c.lineTo(0, 0); c.lineTo(12 * u, 18 * u); c.lineTo(-12 * u, 18 * u); c.lineTo(0, 0); c.closePath(); c.stroke();
      const fl = (t * 0.3) % 1; c.fillStyle = '#ffe08a'; c.beginPath(); c.moveTo(-10 * u * (1 - fl), -16 * u + 14 * u * fl); c.lineTo(10 * u * (1 - fl), -16 * u + 14 * u * fl); c.lineTo(0, -1 * u); c.fill(); c.beginPath(); c.moveTo(-10 * u * fl, 16 * u - 14 * u * fl); c.lineTo(10 * u * fl, 16 * u - 14 * u * fl); c.lineTo(12 * u, 17 * u); c.lineTo(-12 * u, 17 * u); c.fill();
      c.restore();
      // 舞う砂
      for (let i = 0; i < 30; i++) { const a = t * 0.5 + i * 0.7, r = (60 + (i % 5) * 18) * u; c.fillStyle = `rgba(255,224,140,${0.3 + 0.3 * Math.sin(t * 2 + i)})`; c.fillRect(tx + Math.cos(a) * r, ty + Math.sin(a) * r * 0.6, 2 * u, 2 * u); }
    });
    // 手放す候補は、持っているスキルから3つ（ランダム）。旅人が話しかけてくる（闇市の商人と同じ、せりふの吹き出し）
    const owned = x.api.ownedSkills().sort(() => Math.random() - 0.5).slice(0, 3);
    const say = x.html('<div class="evu-note evu-say evu-talk">「どれか1つ、時の流れに返してみないか。<br>かわりに別の力を…少し強くして渡そう」</div>');
    // ふつうのスキルカードで、縦に3枚ならべる（レベルは今のレベルを出す）
    const list = x.html('<div class="evu-pick3"></div>');
    owned.forEach((k, i) => {
      const r0 = k.evo ? 'mythic' : rarityOfLevel(k.lv, SKILL_MAX);
      const b = x.card({ id: k.id, kind: 'skill', rarity: r0 === 'mythic' && !k.evo ? 'super' : r0 }); b.classList.add('evu-pickcard'); b.style.animationDelay = `${0.3 + i * 0.12}s`;
      const sm = b.querySelector('.card-name small:not(.card-from)'); if (sm) sm.innerHTML = `Lv${k.lv}`;
      b.addEventListener('click', () => step2(k, b)); list.appendChild(b);
    });
    x.body.append(x.html('<div class="evu-spacer"></div>'), say, list);
    x.fit(list);
    x.foot(x.back());
    const talk = (h) => { say.innerHTML = h; say.classList.remove('evu-talk'); void say.offsetWidth; say.classList.add('evu-talk'); };
    async function step2(k, plate) {
      if (list.classList.contains('chosen')) return;
      list.classList.add('chosen'); plate.classList.add('on'); x.foot();
      const pool = x.api.roll({ count: 8, onlySkill: true, noCurse: true }).filter((ch) => ch.kind === 'skill' && !x.s.skills[ch.id]);
      await wait(400); list.remove();
      if (!pool.length) { talk('「…いまは、渡せる力が無いようだ」'); x.foot(x.ok(() => x.done())); return; }
      talk(`「${x.skillName(k.id)}か。…では、砂をひっくり返そう」`);
      // 名前がくるくる入れかわり、砂時計がひっくり返って、1つに止まる
      const pick = pickOne(pool);
      const roll = x.html('<div class="evu-skplate evu-rollplate"><b>？</b><small>Lv?</small></div>');
      x.body.appendChild(roll);
      const names = pool.map((c) => x.skillName(c.id)).concat(Object.values(SKILL_BY_ID).slice(0, 12).map((v) => v.name));
      x.sfx('ev_wish');
      for (let q = 0; q < 26; q++) { roll.querySelector('b').textContent = names[(q * 7) % names.length]; sand = q / 26; if (q % 3 === 0) x.sfx('ev_coin', { pitch: 1.6 + (q % 2) * 0.2 }); await wait(40 + q * 6); }
      const lv = x.api.swapSkill(k.id, pick.id, 1) || Math.min(SKILL_MAX, Math.max(1, k.lv) + 1);
      x.flash('#cfe8ff', 0.5, 0.7); x.sfx('gsr');
      const r0 = rarityOfLevel(lv, SKILL_MAX), card = x.card({ id: pick.id, kind: 'skill', rarity: r0 === 'mythic' ? 'super' : r0 });   // mythic で作ると「進化」の見た目になるため
      const sm = card.querySelector('.card-name small:not(.card-from)'); if (sm) sm.innerHTML = `Lv${lv}`;
      card.classList.add('evu-pop'); roll.replaceWith(card); x.fit(x.body);
      talk(`「${x.skillName(k.id)}は、${x.skillName(pick.id)}（Lv${lv}）になった。<br>…大事に使うといい」`);
      await wait(500); x.foot(x.ok(() => x.done()));
    }
  },
});
