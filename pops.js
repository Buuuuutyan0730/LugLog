// 撃破のはじけ方（着せ替え）。敵を倒したときの散り方だけを変える（強さは変わらない）
//   どれも、標準と同じくらいの数の破片にそろえる（重くしない）
//   破片の決まり：shape（形）・col（色。なければ敵の色）・rot/vr（向きと回る速さ）・ay（下へ引く力。負なら上へ）・drag（減速）・delay（出るまでの秒）・grow（輪の広がる速さ）
export const POP_STYLES = [
  { id: 'std', name: '標準', rarity: 'start' },
  { id: 'dot', name: 'ドット', rarity: 'N' },
  { id: 'ripple', name: '波紋', rarity: 'N' },
  { id: 'spark', name: '火花', rarity: 'N' },
  { id: 'petal', name: '花びら', rarity: 'R' },
  { id: 'star', name: '星', rarity: 'R' },
  { id: 'bubble', name: '泡', rarity: 'R' },
  { id: 'confetti', name: '紙ふぶき', rarity: 'SR' },
  { id: 'glitch', name: '分解', rarity: 'SR' },
  { id: 'firework', name: '花火', rarity: 'SSR' },
  { id: 'blackhole', name: 'ブラックホール', rarity: 'SSR' },
];

const TAU = Math.PI * 2;
const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

// e：倒れた敵（x, y, r）。add(破片) で破片を足す。rand：乱数（見本では毎回同じ形にするため渡す）
export function spawnPop(style, e, add, rand = Math.random) {
  const R = (a, b) => a + rand() * (b - a);
  const n = Math.round(12 + e.r * 1.2);
  const out = (speed, o) => { const a = R(0, TAU), v = R(speed * 0.3, speed); return { x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, kind: 'enemy', idx: 0, ...o }; };
  const life = (a, b) => { const l = R(a, b); return { life: l, max: l }; };
  const ring = (r0, grow, l, o = {}) => add({ x: e.x, y: e.y, vx: 0, vy: 0, shape: 'ring', size: r0, grow, kind: 'enemy', idx: 0, life: l, max: l, w: 2.5, ...o });
  switch (style) {
    case 'dot':   // 大きめの四角が、ゆっくり散る
      for (let i = 0; i < n; i++) add(out(170, { size: R(3.5, 6.5), drag: 0.88, ...life(0.45, 0.8) }));
      ring(e.r * 0.6, 90, 0.3);
      break;
    case 'ripple':   // 輪が3つ、時間差で広がる
      for (let k = 0; k < 3; k++) ring(e.r * 0.5, 120 + k * 30, 0.55 + k * 0.1, { delay: k * 0.1, w: 3 - k * 0.6 });
      for (let i = 0; i < Math.round(n / 3); i++) add(out(120, { size: R(1.5, 2.5), ...life(0.3, 0.5) }));
      break;
    case 'spark':   // 橙と黄の火花だけが、勢いよく飛ぶ
      for (let i = 0; i < n; i++) add(out(480 + e.r * 6, { streak: true, size: R(1.2, 2.2), col: pick(rand, ['#ffb347', '#ffd84a', '#ff7a2a']), drag: 0.9, ...life(0.25, 0.45) }));
      break;
    case 'petal':   // 花びらが、くるくる回りながら舞い落ちる
      for (let i = 0; i < Math.round(n * 0.7); i++) add(out(200, { shape: 'petal', size: R(3, 5), col: pick(rand, ['#ffb0d0', '#ff7ab8', '#fff0f6']), rot: R(0, TAU), vr: R(-6, 6), ay: 70, drag: 0.9, ...life(0.8, 1.3) }));
      break;
    case 'star':   // 金の星が、回りながら散る
      for (let i = 0; i < Math.round(n * 0.6); i++) add(out(260, { shape: 'star', size: R(3, 5.5), col: pick(rand, ['#ffd84a', '#fff2a8', '#ffe27a']), rot: R(0, TAU), vr: R(-8, 8), drag: 0.9, ...life(0.5, 0.85) }));
      ring(e.r * 0.6, 100, 0.3, { col: '#ffd84a' });
      break;
    case 'bubble':   // 泡が、ふわっと浮かんで消える
      for (let i = 0; i < Math.round(n * 0.6); i++) add(out(150, { shape: 'bubble', size: R(2.5, 6), col: pick(rand, ['#9fe8ff', '#cff6ff']), ay: -90, drag: 0.9, ...life(0.7, 1.2) }));
      break;
    case 'confetti': {   // 色とりどりの紙が、ひらひら舞い落ちる
      const cols = ['#ff5a7a', '#ffd84a', '#5fd36a', '#4fb3ff', '#c48bff', '#ff9a2a'];
      for (let i = 0; i < Math.round(n * 0.9); i++) { const p = out(300, { shape: 'confetti', size: R(3, 5), col: pick(rand, cols), rot: R(0, TAU), vr: R(-10, 10), ay: 140, drag: 0.88, ...life(0.9, 1.4) }); p.vy -= 120; add(p); }
      break;
    }
    case 'glitch': {   // 敵の形が四角いマス目に分かれ、ずれながら消える
      const cell = Math.max(3, e.r / 2.6), cols = [null, null, '#3fe0ff', '#ff4fd8'];
      for (let y = -e.r; y <= e.r; y += cell) for (let x = -e.r; x <= e.r; x += cell) {
        if (x * x + y * y > e.r * e.r) continue;
        const l = R(0.25, 0.7);
        add({ x: e.x + x, y: e.y + y, vx: x * R(1, 4) + R(-20, 20), vy: y * R(1, 4), size: cell * 0.9, kind: 'enemy', idx: 0, col: pick(rand, cols), drag: 0.85, life: l, max: l, snap: cell });
      }
      break;
    }
    case 'firework': {   // 花火：色の筋がきれいな輪に開き、少しおくれて小さな光が散る
      const m = 28, sp = 300 + e.r * 5;
      for (let i = 0; i < m; i++) {
        const a = (i / m) * TAU, l = R(0.55, 0.7);
        add({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, streak: true, size: 2, col: `hsl(${(i / m) * 360}, 95%, 65%)`, drag: 0.9, ay: 40, life: l, max: l, kind: 'enemy', idx: 0 });
      }
      for (let i = 0; i < 12; i++) add(out(140, { size: R(1.5, 2.5), col: '#ffffff', delay: 0.3, ay: 30, ...life(0.7, 0.9) }));
      ring(e.r * 0.4, 260, 0.35, { col: '#ffffff', w: 2 });
      break;
    }
    case 'blackhole': {   // まわりの光が中心へ吸い込まれ、最後に輪が開く
      const m = Math.round(n * 0.9);
      for (let i = 0; i < m; i++) {
        const a = R(0, TAU), d = e.r * R(2.5, 4), l = 0.32;
        add({ x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: -Math.cos(a) * d / l * 1.6, vy: -Math.sin(a) * d / l * 1.6, streak: true, size: 1.8, col: pick(rand, ['#a77bff', '#6f5aff', '#ff5fd0']), drag: 0.86, life: l, max: l, kind: 'enemy', idx: 0 });
      }
      ring(e.r * 1.6, -40, 0.32, { col: '#6f5aff', w: 3 });
      ring(e.r * 0.3, 220, 0.4, { col: '#c8a6ff', w: 4, delay: 0.3 });
      for (let i = 0; i < 10; i++) add(out(260, { size: R(1.5, 2.5), col: '#e6d6ff', delay: 0.3, ...life(0.6, 0.8) }));
      break;
    }
    default: return false;
  }
  return true;
}

// 破片を進める（ゲームと見本で同じ動かし方）
export function stepParticle(pt, dt) {
  if (pt.delay > 0) { pt.delay -= dt; return; }
  pt.x += pt.vx * dt;
  pt.y += pt.vy * dt;
  const d = pt.drag ?? 0.92;
  pt.vx *= d; pt.vy *= d;
  if (pt.ay) pt.vy += pt.ay * dt;
  if (pt.vr) pt.rot += pt.vr * dt;
  if (pt.grow) pt.size = Math.max(0, pt.size + pt.grow * dt);
  pt.life -= dt;
}
