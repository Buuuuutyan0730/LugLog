// 描画担当。game.js が作った状態を読んで描くだけで、状態は書き換えない。

import { THEME, ghostColor, PREFS, tickRainbow } from './theme.js?v=20261123153505';
import { makeForms } from './forms.js?v=20261123153505';
import { CONFIG } from './config.js?v=20261123153505';
const SK_DOOM = CONFIG.skill.doom.time;   // 死の宣告：倒れるまでの秒数（印の輪の減り方）

function particleColor(pt, alpha = 1) {
  if (pt.kind === 'ghost') return ghostColor(pt.idx, alpha);
  if (pt.kind === 'enemy') return alpha === 1 ? THEME.enemy : `rgba(${THEME.enemyRgbA}, ${alpha})`;
  if (pt.kind === 'white') return `rgba(255, 255, 255, ${alpha})`;
  if (pt.kind === 'shard') return THEME.shard;
  return THEME.playerGlow;
}

// 敵の状態の印の色
const STATUS = {
  iceBody: '#9fe8ff',
  iceEdge: '#1f6f99',
  chillBody: '#3f86c4',   // 遅くなっている（凍る手前）：青っぽく
  chillEdge: '#bff4ff',
  shock: '#ffe94a',
  poisonBody: '#b45cff',
  poisonEdge: '#45137a',
  poison: '#ecd2ff',
  burnOuter: '#ff8a1f',
  burnInner: '#ffe14a',
  pull: 'rgba(210, 220, 255, 0.75)',
  mark: '#ffffff',
  focus: '#fff6c8',           // 集中砲火：ダメージが積み上がっている印（淡い黄色の輪）
  shield: '#dbe4f2',          // 盾持ちの盾（金属の明るい灰色）
  shieldEdge: '#6f7f99',
};
const NO_STATUS = {};

export function createRenderer(canvas, view) {
  let ctx = canvas.getContext('2d');
  let F = makeForms(ctx);   // 本体・罠・現象・衛星・収穫の道の形
  // 本体を虹色に塗りかえるための、裏の画用紙（いったんここに本体を描き、色だけ虹色に置きかえて戻す）
  const mainCtx = ctx, mainF = F;
  const offA = document.createElement('canvas'), offB = document.createElement('canvas');
  const actx = offA.getContext('2d'), bctx = offB.getContext('2d');
  const offF = makeForms(actx);   // 本体・罠・現象・衛星・収穫の道の形

  // カメラ：映している範囲の横幅（ステージが広がると、なめらかに引いていく）
  let viewW = view.width;
  let worldW = view.width, worldH = view.height;
  let lastT = 0;

  // 画面の上での位置と大きさ：毎フレーム測ると、ページ全体の配置の計算をやり直させて重くなるので、
  //   大きさが変わったとき・スクロールしたときだけ測り直す
  let rectCache = null;
  const canvasRect = () => rectCache || (rectCache = canvas.getBoundingClientRect());
  window.addEventListener('scroll', () => { rectCache = null; }, { passive: true });
  window.addEventListener('resize', () => { rectCache = null; });
  // 重さに合わせた画面の細かさ：1フレームが長い状態が続くと下げ、短い状態が続くと上げる
  let dprCap = 2, frameAvg = 16, slowFor = 0, fastFor = 0;
  function adaptQuality(dt) {
    if (!(dt > 0) || dt > 0.25) return;   // タブの切り替えなどで大きく空いたときは数えない
    frameAvg = frameAvg * 0.9 + dt * 1000 * 0.1;
    if (frameAvg > 24) { slowFor += dt; fastFor = 0; } else if (frameAvg < 15) { fastFor += dt; slowFor = 0; } else { slowFor = 0; fastFor = 0; }
    const top = Math.min(window.devicePixelRatio || 1, 2);
    if (slowFor > 1 && dprCap > 1) { dprCap = Math.max(1, Math.min(top, dprCap) - 0.25); slowFor = 0; resize(); }
    else if (fastFor > 4 && dprCap < top) { dprCap = Math.min(top, dprCap + 0.25); fastFor = 0; resize(); }
  }
  function resize() {
    rectCache = null;
    const rect = canvasRect();
    // 画面の細かさは2倍まで（スマホの3倍だと描く点の数が2倍以上になり、とても重い。見た目の差はほとんどない）
    //   さらに、重くて間に合わないときは自動で少し粗くする（dprCap。軽くなれば戻す）
    const dpr = Math.min(window.devicePixelRatio || 1, 2, dprCap);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  // 画面上の1ピクセルがゲーム内でどれだけの長さか
  function pxToWorld() {
    const rect = canvasRect();
    return rect.width > 0 ? viewW / rect.width : 1;
  }

  // 画面上の位置 → ゲーム内の座標（画面の中心＝ステージの中心）
  function clientToWorld(cx, cy) {
    const rect = canvasRect();
    if (rect.width <= 0) return { x: 0, y: 0 };
    const fx = (cx - rect.left) / rect.width - 0.5;
    const fy = (cy - rect.top) / rect.height - 0.5;
    return { x: worldW / 2 + fx * viewW, y: worldH / 2 + fy * viewW * (rect.height / rect.width) };
  }

  // 混み具合で光のぼかしを減らす（ぼかしは描く手間が大きい。敵・弾・分身が多いときほど省く）
  let lod = 1;
  const glow = (color, blur) => { if (lod <= 0) { ctx.shadowBlur = 0; return; } ctx.shadowColor = color; ctx.shadowBlur = blur * PREFS.glow * lod; };
  const noGlow = () => { ctx.shadowBlur = 0; };
  // 設定の「光の強さ」（ひかえめ 0.4／ふつう 1／つよい 1.6）を、ぼかし以外の光（輪・粒・フラッシュ）にも効かせる
  const glowAlpha = () => Math.min(1, 0.45 + 0.55 * PREFS.glow);   // ひかえめ 0.67／ふつう 1／つよい 1
  const glowWidth = () => 0.6 + 0.4 * PREFS.glow;                  // ひかえめ 0.76／ふつう 1／つよい 1.24

  function polyline(pts, every = 1, start = 0) {
    if (!pts || pts.length - start < 2) return false;
    ctx.beginPath();
    ctx.moveTo(pts[start].x, pts[start].y);
    for (let i = start + every; i < pts.length; i += every) ctx.lineTo(pts[i].x, pts[i].y);
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    return true;
  }

  // ---------- 背景 ----------
  function drawBackground(state, t = 0) {
    const W = state.world.w, H = state.world.h;
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, W, H);

    // 着せ替えの背景の飾り（どれも、敵や弾が見えにくくならない薄さにする）
    if (THEME.bgNebula) {
      // 銀河：大きくぼんやりした色の雲が、ゆっくり漂う
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [k, col] of [[0, '120, 60, 220'], [1, '40, 120, 230'], [2, '230, 70, 160']]) {
        const x = W * (0.3 + 0.4 * Math.sin(t * 0.03 + k * 2.1)), y = H * (0.3 + 0.4 * Math.cos(t * 0.025 + k * 1.7)), r = W * (0.55 + 0.1 * k);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${col}, 0.16)`); g.addColorStop(1, `rgba(${col}, 0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
    if (THEME.bgDots) {
      ctx.fillStyle = THEME.bgDots;
      for (let y = 20; y < H; y += 40) for (let x = 20; x < W; x += 40) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    if (THEME.bgDiag) {
      ctx.save(); ctx.strokeStyle = THEME.bgDiag; ctx.lineWidth = 6;
      ctx.beginPath();
      for (let x = -H; x < W; x += 34) { ctx.moveTo(x, H); ctx.lineTo(x + H, 0); }
      ctx.stroke(); ctx.restore();
    }
    if (THEME.bgRain) {
      // 雨：細い線が、斜めに静かに降る
      ctx.save(); ctx.strokeStyle = 'rgba(150, 190, 255, 0.16)'; ctx.lineWidth = 1;
      ctx.beginPath();
      const n = Math.round(70 * (W * H) / (360 * 640) * (state.bgThumb || 1));
      for (let k = 0; k < n; k++) {
        const sp = 0.5 + (k % 5) * 0.12, x0 = ((k * 0.7548776) % 1) * (W + 60);
        const y = (((k * 0.5698403) + t * sp) % 1) * (H + 40) - 20, x = x0 - (y / H) * 40;
        ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14);
      }
      ctx.stroke(); ctx.restore();
    }
    if (THEME.bgCloud) {
      ctx.save(); ctx.fillStyle = 'rgba(60, 76, 150, 0.16)';
      for (let k = 0; k < 6; k++) {
        const y = ((k * 0.37 + 0.1) % 1) * H, x = (((k * 0.61) + t * 0.006 * (1 + (k % 3))) % 1.4 - 0.2) * W;
        ctx.beginPath(); ctx.ellipse(x, y, W * (0.22 + (k % 3) * 0.06), H * 0.035, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (THEME.bgStars) {
      ctx.save();
      for (let k = 0; k < THEME.bgStars * (W * H) / (360 * 640) * (state.bgThumb || 1); k++) {
        const x = ((k * 0.7548776) % 1) * W, y = ((k * 0.5698403) % 1) * H;
        const tw = 0.35 + 0.35 * Math.sin(t * (1 + (k % 5) * 0.4) + k);
        ctx.globalAlpha = tw; ctx.fillStyle = k % 7 === 0 ? '#bfe6ff' : '#ffffff';
        const r = k % 9 === 0 ? 1.3 : 0.7;
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
      ctx.restore();
    }
    if (THEME.bgMeteor) {
      // 流れ星：5秒ごとに1本、画面を斜めに横切る
      const ph = (t % 5) / 1.2;
      if (ph < 1) {
        const n = Math.floor(t / 5), x0 = ((n * 0.618) % 1) * W * 0.8, y0 = ((n * 0.382) % 1) * H * 0.4;
        const x = x0 + ph * W * 0.5, y = y0 + ph * H * 0.25;
        ctx.save(); ctx.lineCap = 'round';
        const g = ctx.createLinearGradient(x - W * 0.12, y - H * 0.06, x, y);
        g.addColorStop(0, 'rgba(255, 255, 255, 0)'); g.addColorStop(1, `rgba(255, 255, 255, ${0.7 * (1 - ph)})`);
        ctx.strokeStyle = g; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - W * 0.12, y - H * 0.06); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
      }
    }
    if (THEME.bgCity) {
      // 夜の街：下のほうに、ビルの影と小さな窓の明かり
      ctx.save(); ctx.fillStyle = 'rgba(28, 34, 70, 0.55)';
      const base = H, step = W / 14;
      for (let k = 0; k < 15; k++) {
        const h = H * (0.08 + (((k * 0.618) % 1) * 0.12));
        ctx.fillRect(k * step - 1, base - h, step - 2, h);
        ctx.fillStyle = 'rgba(255, 216, 120, 0.25)';
        for (let w = 0; w < 4; w++) if ((k + w) % 3 === 0) ctx.fillRect(k * step + 3 + (w % 2) * (step / 2 - 2), base - h + 6 + Math.floor(w / 2) * 8, 2, 2);
        ctx.fillStyle = 'rgba(28, 34, 70, 0.55)';
      }
      ctx.restore();
    }

    // マス目の大きさはステージの中で一定。ステージが広がると、画面上では小さく見える
    if (!THEME.grid) return;
    const cell = 40;
    ctx.lineWidth = 1;
    for (let i = 0, x = 0; x <= W + 0.1; i++, x = i * cell) {
      ctx.strokeStyle = i % 3 === 0 ? THEME.gridMajor : THEME.grid;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let i = 0, y = 0; y <= H + 0.1; i++, y = i * cell) {
      ctx.strokeStyle = i % 3 === 0 ? THEME.gridMajor : THEME.grid;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }


  // ふちを暗くする：毎フレーム作り直すと重いので、画面の大きさが変わったときだけ作って貼る
  let vigCv = null;
  function drawVignette() {
    const W = canvas.width, H = canvas.height;
    if (!vigCv || vigCv.width !== W || vigCv.height !== H) {
      vigCv = document.createElement('canvas'); vigCv.width = W; vigCv.height = H;
      const c2 = vigCv.getContext('2d');
      const g = c2.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
      c2.fillStyle = g;
      c2.fillRect(0, 0, W, H);
    }
    ctx.drawImage(vigCv, 0, 0);
  }

  // ---------- かけら ----------
  function drawPickups(state, t) {
    const blinkAt = 3;
    for (const k of state.pickups) {
      if (k.life < blinkAt && Math.sin(t * 24) < 0) continue; // 消える前は点滅
      const s = (k.gold ? 7 : 4) * (state.zoom || 1);   // 金のかけらだけ大きく。ほかは敵の大きさに関係なく同じ（ステージが広がっても画面の上で同じ大きさ）
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.spin + t * 3);
      glow(k.gold ? '#ffffff' : THEME.shard, k.gold ? 16 : 8);
      ctx.fillStyle = k.gold ? '#fff2b0' : THEME.shard;
      ctx.strokeStyle = THEME.shardEdge;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.3); ctx.lineTo(s, 0); ctx.lineTo(0, s * 1.3); ctx.lineTo(-s, 0);
      ctx.closePath();
      ctx.fill();
      noGlow();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 分身 ----------
  function ghostAlpha(life, t) {
    let a = 0.35 + 0.65 * Math.min(1, life / 0.5);
    if (life < 0.25) a *= Math.sin(t * 22) > 0 ? 1 : 0.25; // 消えかけは点滅
    return a;
  }

  // 置いている分身と、ラストスタンドで戦い続けている分身
  // 今いる分身・押し出されても戦っている分身（ラストスタンド）・分裂した小さな分身
  const allGhosts = (state) => {
    const more = (state.fading && state.fading.length) || (state.splits && state.splits.length);
    return more ? [...state.ghosts, ...(state.fading || []), ...(state.splits || [])] : state.ghosts;
  };

  function drawGhostPaths(state) {
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const g of allGhosts(state)) {
      const glowK = Math.max(0, g.spawnGlow || 0) / 0.6;   // 生まれた直後は軌跡が明るく光る
      ctx.strokeStyle = ghostColor(g.idx, 0.3 + 0.7 * glowK);
      ctx.lineWidth = 2 + 3 * glowK;
      if (glowK > 0) glow(ghostColor(g.idx), 14 * glowK);
      if (polyline(g.clip, 3)) ctx.stroke();
      noGlow();
      ctx.lineWidth = 2;
    }
    ctx.globalAlpha = 1;
  }

  // まっすぐさの光り方（0〜1）：半分より曲がった線は光らず、まっすぐに近いほど強く光る
  const straightGlow = (s) => Math.max(0, Math.min(1, (s - 0.5) / 0.5)) ** 1.5;
  function drawRecordPath(state, t) {
    const r0 = state.record;
    // まっすぐなほど、線の下に水色の光の帯が太く明るく出る
    if (r0.active && r0.path.length > 1) {
      const k = straightGlow(r0.straight == null ? 1 : r0.straight);
      if (k > 0) {
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#bff4ff';
        ctx.globalAlpha = 0.15 + 0.55 * k;
        ctx.lineWidth = 2 + 5 * k;
        glow('#7fe3ff', 16 * k);
        if (polyline(r0.path, 3)) ctx.stroke();
        noGlow();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -t * 30;
    ctx.lineWidth = 2;
    // 短すぎる間は暗く、分身を作れる長さになったら白、限界が近いと金色
    const r = state.record;
    ctx.strokeStyle = !r.enough ? THEME.recordPathShort
      : r.progress > 0.8 ? THEME.recordPathFull : THEME.recordPath;
    if (polyline(state.record.path, 3)) ctx.stroke();
    ctx.restore();
  }

  // 威圧：遅くなる範囲。うっすら塗った円と、ゆっくり回る点線の輪
  // おとり：敵を引きつける範囲。細い実線の輪と、内側を向いた矢じりがゆっくり回る（威圧の点線の輪と見分ける）
  function drawTaunt(g, t) {
    const R = g.taunt;
    ctx.save();
    ctx.strokeStyle = ghostColor(g.idx, 0.4);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(g.x, g.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ghostColor(g.idx, 0.85);
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = t * 0.4 + (k * Math.PI * 2) / n;
      const cx = g.x + Math.cos(a) * (R - 6), cy = g.y + Math.sin(a) * (R - 6);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a + Math.PI);   // 内側（分身）を向く
      ctx.beginPath();
      ctx.moveTo(5.5, 0); ctx.lineTo(-3.5, 4.5); ctx.lineTo(-1.2, 0); ctx.lineTo(-3.5, -4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawAwe(g, t) {
    ctx.save();
    ctx.fillStyle = ghostColor(g.idx, 0.07);
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.awe, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ghostColor(g.idx, 0.45);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -t * 12;
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 分身の形（取ったスキルで変わる） ----------
  //   look = { entry, type, parts: { id: true }, evo: { id: true }, elem }
  //   どのスキルも、まず体の輪郭そのものを少し変え（silhouette）、そのうえで動きや光を足す
  //   目覚め（型）で土台：巨像＝装甲の多角形、群体＝うごめく粒の塊、砲台＝角の丸い四角、守護＝六角形の盾
  //   極：その部分が一回り大きくなり白く光る芯が入る。目覚めの進化：金のふち
  const GOLD = '#ffd84a';
  const WHITE = '#ffffff';
  const TAU = Math.PI * 2;

  // 虹色のコア（中心が原点）：極・進化を1つでも持つと、まんなかの芯が虹色に光りながら回る
  function rainbowCore(R, t) {
    const g = ctx.createConicGradient(t * 1.2, 0, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60}, 100%, 62%)`);
    ctx.save();
    glow('#ffffff', 12); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); noGlow();
    const w = ctx.createRadialGradient(-R * 0.25, -R * 0.25, 0, 0, 0, R);
    w.addColorStop(0, 'rgba(255,255,255,0.85)'); w.addColorStop(0.45, 'rgba(255,255,255,0.15)'); w.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = w; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  // 分身の形は「大きさの倍率 1.2」のときの見た目で作ってある。倍率を上げたときは、線の太さ・飾り・まとうものまで
  //   丸ごと同じ割合で大きくする（体だけが大きくなって、線や飾りが細く小さく見えないように）
  const GHOST_DESIGN_MUL = 1.2;
  function drawGhostBody(g, col, look, t) {
    const S = (CONFIG.ghost.sizeMul || GHOST_DESIGN_MUL) / GHOST_DESIGN_MUL;
    const r = g.r / S;
    const type = look ? look.type : null;
    const has = (id) => !!(look && look.parts && look.parts[id]);
    const kw = (id) => !!(look && look.evo && look.evo[id]);   // 極
    const aim = g.aimA != null ? g.aimA : -Math.PI / 4;
    const entry = !!(look && look.entry);
    const fire = (k = 0) => ((t * 1.1 + k) % 1) < 0.1;          // 撃った瞬間（砲口が光る）
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.scale(S, S);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 体の輪郭の半径（角度ごと）。どのスキルを持つかで、丸が少しずつ変わる
    const polar = (k) => (a) => {
      let R = r * k;
      if (type === 'giant') R *= 1 + 0.05 * (Math.floor(((a + TAU) % TAU) / (TAU / 12)) % 2);   // 装甲板の段差
      if (type === 'swarm') R *= 1 + 0.07 * Math.sin(3 * a + t * 3) + 0.05 * Math.sin(5 * a - t * 2);   // うごめく
      if (has('crush')) { const s2 = Math.abs(Math.sin(a * 4)); R *= 1 + (kw('crush') ? 0.42 : 0.3) * Math.pow(s2, 8); }   // とげが体から生える
      if (has('split')) R *= 0.78 + 0.34 * Math.abs(Math.cos(a)) ** 0.8;                       // 2つに分かれかけて、くびれる
      if (has('thousand')) R *= 0.82 + 0.26 * Math.abs(Math.cos(1.5 * (a + t * 0.6)));          // 3つの丸が重なった形（回る）
      if (has('focus')) R *= 1 - 0.1 * Math.pow(Math.abs(Math.sin(2 * a)), 6);                  // 照準の4か所がへこむ
      if (has('mark')) R *= 1 + 0.08 * Math.pow(Math.abs(Math.cos(2 * a + Math.PI / 4)), 12);  // 印のとんがり
      if (entry && !type) { const d = ((a - t * 0.8) % (TAU / 3) + TAU / 3) % (TAU / 3); if (d < 0.35) R *= 0.9; }   // 砲口の切り欠き
      return R;
    };
    const polarPath = (k) => { const f = polar(k); ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = (i / 72) * TAU, R = f(a); if (i === 0) ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); else ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); } ctx.closePath(); };

    // 体の輪郭（土台ごと）。k：大きさの倍率
    const outline = (k = 1) => {
      if (type === 'turret') {
        // 砲台：角の丸い四角（形はこのまま。スキルは砲身・動き・光で見せる）
        ctx.save();
        ctx.beginPath();
        const h = r * 0.9 * k, c = r * 0.28 * k;
        const P = [[-h, -h], [h, -h], [h, h], [-h, h]];   // 砲台は、どのスキルでも四角のまま
        for (let i = 0; i < 4; i++) {
          const [x0, y0] = P[(i + 3) % 4], [x1, y1] = P[i], [x2, y2] = P[(i + 1) % 4];
          const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1);
          const ax = x1 + ((x0 - x1) / l1) * c, ay = y1 + ((y0 - y1) / l1) * c, bx = x1 + ((x2 - x1) / l2) * c, by = y1 + ((y2 - y1) / l2) * c;
          if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
          ctx.quadraticCurveTo(x1, y1, bx, by);
        }
        ctx.closePath();
        ctx.restore();
      } else if (type === 'decoy') {
        // 守護：六角形。挑発＝辺が内へへこむ、修復＝角が丸くなる
        ctx.beginPath();
        const R = r * 1.05 * k;
        for (let i = 0; i < 6; i++) {
          const a = (i * TAU) / 6, b = ((i + 1) * TAU) / 6, x = Math.cos(a) * R, y = Math.sin(a) * R, x2 = Math.cos(b) * R, y2 = Math.sin(b) * R;
          if (has('repair')) {
            // 角だけを少し丸める（六角形の形は残す）
            const c2 = ((i + 2) * TAU) / 6, xn = Math.cos(c2) * R, yn = Math.sin(c2) * R;
            const ax = x2 + (x - x2) * 0.25, ay = y2 + (y - y2) * 0.25, bx = x2 + (xn - x2) * 0.25, by = y2 + (yn - y2) * 0.25;
            if (i === 0) ctx.moveTo(x + (x2 - x) * 0.25, y + (y2 - y) * 0.25);
            ctx.lineTo(ax, ay); ctx.quadraticCurveTo(x2, y2, bx, by);
          } else {
            if (i === 0) ctx.moveTo(x, y);
            if (has('taunt')) { const m = (a + b) / 2; ctx.quadraticCurveTo(Math.cos(m) * R * 0.7, Math.sin(m) * R * 0.7, x2, y2); }
            else ctx.lineTo(x2, y2);
          }
        }
        ctx.closePath();
      } else {
        polarPath(k);
      }
    };
    // 白く光る芯（極）を、今の線の上に重ねる
    const core = (draw, w) => { ctx.save(); glow(WHITE, 8); ctx.strokeStyle = WHITE; ctx.lineWidth = w; draw(); ctx.restore(); noGlow(); };

    // ---- うしろ側 ----
    // 不落：六角形の外にもう一枚、厚い壁。壁の上を光が流れる
    if (has('fortress')) {
      ctx.save();
      ctx.fillStyle = ghostColor(g.idx, 0.55); ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6, R = r * 1.42; if (i === 0) ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); else ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); } ctx.closePath(); ctx.fill(); ctx.stroke();
      const sa = (t * 1.5) % TAU;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, sa, sa + 0.5); ctx.stroke();
      ctx.restore();
    }
    // 挑発：体の形の波が、外へ広がり続ける（敵を呼び寄せる）
    if (has('taunt')) {
      const n = kw('taunt') ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const ph = (t * 0.8 + i / n) % 1;
        ctx.save();
        ctx.globalAlpha *= (1 - ph) * (kw('taunt') ? 0.9 : 0.6);
        ctx.strokeStyle = kw('taunt') ? WHITE : col; ctx.lineWidth = 1.6;
        outline(1.1 + ph * 0.8); ctx.stroke();
        ctx.restore();
      }
    }
    // 千の影：同じ形の残像が、同じ道すじの前とうしろに並ぶ（3体が1本の軌跡を往復する）
    if (has('thousand')) {
      ctx.save();
      ctx.strokeStyle = ghostColor(g.idx, 0.5); ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(-r * 1.9, r * 0.9); ctx.quadraticCurveTo(0, r * 1.6, r * 1.9, r * 0.9); ctx.stroke(); ctx.setLineDash([]);
      for (const [x, y, s, a] of [[-r * 1.55, r * 1.05, 0.45, 0.5], [r * 1.55, r * 1.05, 0.45, 0.5]]) {
        ctx.save(); ctx.translate(x, y); ctx.globalAlpha *= a;
        ctx.fillStyle = ghostColor(g.idx, 0.6); ctx.beginPath(); ctx.arc(0, 0, r * s, 0, TAU); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    // 砲身（重砲・レーザー・散弾・一斉射撃）は体のうしろから出す。撃った瞬間は先が光る
    const barrel = (a, from, to, w, c, hot, flashK) => {
      ctx.save(); ctx.rotate(a);
      ctx.fillStyle = c; ctx.strokeStyle = THEME.barInk; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(from, -w / 2, to - from, w); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(from, -w / 2, to - from, w * 0.25);   // 砲身のつや
      if (hot) core(() => { ctx.beginPath(); ctx.moveTo(from + w * 0.3, 0); ctx.lineTo(to, 0); ctx.stroke(); }, Math.max(1.2, w * 0.3));
      if (flashK != null && fire(flashK)) { glow(WHITE, 12); ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(to + w * 0.4, 0, w * 0.75, 0, TAU); ctx.fill(); noGlow(); }
      ctx.restore();
    };
    if (has('cannon')) {
      const back = fire() ? r * 0.18 : 0;   // 撃つたびに、反動で少し下がる
      kw('cannon') ? barrel(aim, r * 0.4 - back, r * 2.0 - back, r * 0.8, col, true, 0) : barrel(aim, r * 0.4 - back, r * 1.7 - back, r * 0.62, col, false, 0);
    }
    if (has('laser')) {
      barrel(aim, r * 0.4, r * (kw('laser') ? 2.5 : 2.15), r * (kw('laser') ? 0.36 : 0.28), col, kw('laser'));
      // 砲口に、光がたまっていく
      const ch = (t * 0.9) % 1, L = r * (kw('laser') ? 2.5 : 2.15);
      ctx.save(); ctx.rotate(aim); glow(WHITE, 14); ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * ch})`; ctx.beginPath(); ctx.arc(L + r * 0.15, 0, r * (0.12 + 0.22 * ch), 0, TAU); ctx.fill(); noGlow(); ctx.restore();
    }
    if (has('shotgun')) {
      const offs = kw('shotgun') ? [-0.7, -0.35, 0, 0.35, 0.7] : [-0.38, 0, 0.38];
      offs.forEach((o, i) => barrel(aim + o, r * 0.5, r * 1.45, r * 0.3, col, kw('shotgun'), 0));
    }
    if (entry && !type) {
      const n = kw('volley') ? 6 : 3;
      for (let i = 0; i < n; i++) barrel(t * 0.8 + (i * TAU) / n, r * 0.7, r * 1.55, Math.max(2.5, r * 0.34), col, kw('volley'), i * 0.33);
    } else if (entry) {
      // 型がある分身にも、一斉射撃の小さな砲口（3つ）
      for (let i = 0; i < 3; i++) barrel(t * 0.8 + (i * TAU) / 3, r * 0.8, r * 1.35, Math.max(2, r * 0.24), col, kw('volley'), i * 0.33);
    }
    // 反撃：六角形の角から、とげ。ときどき先が光る（極は長く、白い芯）
    if (has('counter')) {
      const len = Math.max(4, r * 0.45) * (kw('counter') ? 1.7 : 1);
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6, R = r * 1.05;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.22) * R, Math.sin(a - 0.22) * R); ctx.lineTo(Math.cos(a) * (R + len), Math.sin(a) * (R + len)); ctx.lineTo(Math.cos(a + 0.22) * R, Math.sin(a + 0.22) * R); ctx.fill();
        if (kw('counter')) core(() => { ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a) * (R + len * 0.85), Math.sin(a) * (R + len * 0.85)); ctx.stroke(); }, 1.2);
        if (fire(i * 0.17)) { glow(WHITE, 10); ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(Math.cos(a) * (R + len), Math.sin(a) * (R + len), 2.2, 0, TAU); ctx.fill(); noGlow(); }
      }
    }
    // 威圧：角2本（左の角を描き、左右反転して右の角を描く。極は長く大きく）
    if (has('awe')) {
      const L = kw('awe') ? 2.2 : 1.8;
      for (const sg of [1, -1]) {
        ctx.save(); ctx.scale(sg, 1);
        const a = -Math.PI / 2 - 0.95;
        const base1 = [Math.cos(a - 0.25) * r, Math.sin(a - 0.25) * r], base2 = [Math.cos(a + 0.25) * r, Math.sin(a + 0.25) * r];
        const tip = [Math.cos(a + 0.55) * r * L, Math.sin(a + 0.55) * r * L];
        const ctl = [Math.cos(a) * r * (L - 0.15), Math.sin(a) * r * (L - 0.15)];
        ctx.fillStyle = col; glow(col, 10);
        ctx.beginPath(); ctx.moveTo(...base1); ctx.quadraticCurveTo(...ctl, ...tip); ctx.lineTo(...base2); ctx.closePath(); ctx.fill(); noGlow();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.moveTo(...base1); ctx.quadraticCurveTo(ctl[0] * 0.95, ctl[1] * 0.95, tip[0], tip[1]); ctx.lineTo(base1[0] * 0.9 + base2[0] * 0.1, base1[1] * 0.9 + base2[1] * 0.1); ctx.fill();
        if (kw('awe')) core(() => { ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.quadraticCurveTo(ctl[0] * 0.9, ctl[1] * 0.9, tip[0] * 0.92, tip[1] * 0.92); ctx.stroke(); }, 1.3);
        ctx.restore();
      }
      // 威圧の波：体から外へ、重い波がゆっくり広がる
      const ph = (t * 0.6) % 1;
      ctx.save(); ctx.globalAlpha *= (1 - ph) * 0.7; ctx.strokeStyle = col; ctx.lineWidth = 2.5; polarPath(1.05 + ph * 0.7); ctx.stroke(); ctx.restore();
    }
    // ギガント：体の外にもう一回り大きな殻ができ、柱で支える（殻はゆっくり回り、つなぎ目が光る）
    if (has('gigant')) {
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = 2.6; glow(col, 10);
      ctx.beginPath(); ctx.arc(0, 0, r * 1.42, 0, TAU); ctx.stroke(); noGlow();
      ctx.lineWidth = 2.2;
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + t * 0.3;
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.42); ctx.stroke();
        ctx.fillStyle = WHITE; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + i); ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.42, 1.8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // 要塞（固定砲台の進化）：四角のうしろに、角が張り出した星形の砦と、角ごとの小さな砲塔
    if (type === 'turret' && kw('turret')) {
      ctx.save();
      ctx.fillStyle = ghostColor(g.idx, 0.4); ctx.strokeStyle = col; ctx.lineWidth = 2.4; glow(col, 12);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8, R = i % 2 === 0 ? r * 2.3 : r * 1.5; if (i === 0) ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); else ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); noGlow();
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4, x = Math.cos(a) * r * 1.85, y = Math.sin(a) * r * 1.85;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(x, y); ctx.rotate(aim); ctx.fillStyle = THEME.barInk; ctx.fillRect(0, -r * 0.07, r * 0.45, r * 0.14); ctx.restore();
        if (fire(i * 0.25)) { glow(WHITE, 10); ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x + Math.cos(aim) * r * 0.55, y + Math.sin(aim) * r * 0.55, r * 0.14, 0, TAU); ctx.fill(); noGlow(); }
      }
      ctx.restore();
    }

    if (look && look.elem) F.phenomBack(r, look, t);   // 現象の道：分身がまとうもの（奥）

    // ---- 体（土台） ----
    // 中心が明るく、ふちに向かって分身の色になる光の塊。左上につや
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r * 1.3);
    grad.addColorStop(0, ghostColor(g.idx, 0.95));
    grad.addColorStop(0.55, ghostColor(g.idx, 0.5));
    grad.addColorStop(1, ghostColor(g.idx, 0.2));
    glow(col, 18);
    ctx.fillStyle = grad;
    ctx.strokeStyle = col;
    ctx.lineWidth = type === 'giant' ? 4 : type === 'swarm' ? 2 : 2.6;
    outline();
    ctx.fill();
    ctx.stroke();
    noGlow();
    ctx.save(); outline(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.45, r * 0.22, -0.5, 0, TAU); ctx.fill();
    ctx.restore();

    // 型ごとの、体の中の動き
    if (type === 'giant') {
      // 巨像：中で装甲の輪がゆっくり回る（重い鼓動）
      const k = 1 + 0.04 * Math.sin(t * 3);
      ctx.strokeStyle = col; ctx.lineWidth = 2.4;
      for (let i = 0; i < 4; i++) { const a = t * 0.6 + (i * TAU) / 4; ctx.beginPath(); ctx.arc(0, 0, r * 0.62 * k, a, a + 1.1); ctx.stroke(); }
    }
    if (type === 'turret') {
      // 砲台：中で照準の四角が回り、中心の灯りがまたたく
      ctx.save(); ctx.rotate(t * 0.9); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.strokeRect(-r * 0.42, -r * 0.42, r * 0.84, r * 0.84); ctx.restore();
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.fillStyle = THEME.barInk; ctx.beginPath(); ctx.arc(x * r * 0.62, y * r * 0.62, 1.4, 0, TAU); ctx.fill(); }
    }
    if (type === 'decoy') {
      // 守護：中に一回り小さな六角形の盾が重なり、ゆっくり脈打つ
      const k = 0.62 + 0.04 * Math.sin(t * 3);
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6 + Math.PI / 6; if (i === 0) ctx.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k); else ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k); } ctx.closePath(); ctx.stroke();
    }
    // 天の光：はるか上から、太い光の柱が分身に降り注ぐ。柱の中を光の粒が降り、頭上に光の門、体のまわりに光の十字
    if (has('heaven')) {
      ctx.save();
      const top = -r * 3.4, w = r * 0.85;
      const gr = ctx.createLinearGradient(-w, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,246,200,0)'); gr.addColorStop(0.5, 'rgba(255,250,225,0.75)'); gr.addColorStop(1, 'rgba(255,246,200,0)');
      ctx.fillStyle = gr; glow('#fff6c8', 16);
      ctx.beginPath(); ctx.moveTo(-w * 0.55, top); ctx.lineTo(w * 0.55, top); ctx.lineTo(w, r * 0.6); ctx.lineTo(-w, r * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(-r * 0.08, top, r * 0.16, r * 0.6 - top);
      noGlow();
      // 頭上の光の門（回る光の輪）
      ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 1.8; glow('#fff6c8', 10);
      ctx.beginPath(); ctx.ellipse(0, top, w * 0.75, w * 0.22, 0, 0, TAU); ctx.stroke(); noGlow();
      // 柱の中を降る光の粒
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) { const ph = (t * 1.2 + i / 5) % 1, x = (((i * 37) % 9) / 9 - 0.5) * w * 0.9; ctx.globalAlpha = 1 - ph * 0.5; ctx.beginPath(); ctx.arc(x, top + ph * (r * 0.6 - top), 1.3, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      // 体のまわりの光の十字（ゆっくり明滅）
      const k = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.strokeStyle = `rgba(255,250,225,${k})`; ctx.lineWidth = 2; glow('#fff6c8', 12);
      ctx.beginPath(); ctx.moveTo(-r * 1.6 * k, 0); ctx.lineTo(r * 1.6 * k, 0); ctx.moveTo(0, -r * 1.6 * k); ctx.lineTo(0, r * 1.6 * k); ctx.stroke(); noGlow();
      ctx.restore();
    }

    // ---- 中身 ----
    ctx.fillStyle = col;
    if (has('repair')) {
      // 修復：まんなかの芯が鼓動のように脈打ち、光の粒がのぼる（極は白く大きく、外に輪）
      const k = 1 + 0.35 * Math.sin(t * 5);
      ctx.fillStyle = kw('repair') ? WHITE : '#eafff4';
      glow(kw('repair') ? WHITE : col, 12);
      ctx.beginPath(); ctx.arc(0, 0, r * (kw('repair') ? 0.45 : 0.36) * k, 0, TAU); ctx.fill();
      noGlow();
      if (kw('repair')) { ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.7 * k, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = 'rgba(234,255,244,0.9)';
      for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc((i - 1) * r * 0.45, -r * 0.2 - ph * r * 1.4, 1.4, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (has('split')) {
      // 分裂：くびれの線と、分かれかけた2つの芯（極は白く光る）
      ctx.strokeStyle = THEME.barInk; ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, r * 0.8); ctx.stroke();
      ctx.fillStyle = kw('split') ? WHITE : '#ffffff'; if (kw('split')) glow(WHITE, 8);
      const d = r * (0.45 + 0.05 * Math.sin(t * 4));
      for (const x of [-d, d]) { ctx.beginPath(); ctx.arc(x, 0, Math.max(1.5, r * 0.2), 0, TAU); ctx.fill(); }
      noGlow();
    } else if (type === 'swarm') {
      // 群体：小さな粒が尾を引いてまわる。目印を取ると、粒が白いひし形（印）に変わる
      const n = 6, sz = Math.max(1.2, r * 0.16);
      for (let i = 0; i < n; i++) {
        const a = t * 1.6 + (i * TAU) / n, d = r * (0.42 + 0.08 * Math.sin(t * 3 + i)), x = Math.cos(a) * d, y = Math.sin(a) * d;
        ctx.strokeStyle = ghostColor(g.idx, 0.6); ctx.lineWidth = sz; ctx.beginPath(); ctx.arc(0, 0, d, a - 0.5, a); ctx.stroke();
        if (has('mark')) {
          const m = sz * (kw('mark') ? 2.1 : 1.6);
          ctx.fillStyle = WHITE; if (kw('mark')) glow(WHITE, 8);
          ctx.beginPath(); ctx.moveTo(x, y - m); ctx.lineTo(x + m * 0.7, y); ctx.lineTo(x, y + m); ctx.lineTo(x - m * 0.7, y); ctx.closePath(); ctx.fill();
          noGlow();
        } else { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill(); }
      }
    } else if (!(look && look.elem && look.elem !== 'freeze' && look.elem !== 'poison')) {
      ctx.fillStyle = '#ffffff'; glow(col, 8); ctx.beginPath(); ctx.arc(0, 0, Math.max(1.5, r * 0.3), 0, TAU); ctx.fill(); noGlow();
    }

    if (look && look.elem) F.phenomFront(r, look, t, () => outline());   // 現象の道：分身がまとうもの（手前）

    // ---- 前側 ----
    // 集中砲火：照準の十字が、狙いを絞るように内へ縮んでは戻る（極は外に照準の輪）
    if (has('focus')) {
      const k = 1 - 0.15 * ((t * 1.2) % 1);
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6; glow(col, 8);
      for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.55 * k, Math.sin(a) * r * 0.55 * k); ctx.lineTo(Math.cos(a) * r * 1.5 * k, Math.sin(a) * r * 1.5 * k); ctx.stroke(); }
      noGlow();
      if (kw('focus')) core(() => { ctx.beginPath(); ctx.arc(0, 0, r * 1.32 * k, 0, TAU); ctx.stroke(); }, 1.2);
    }
    // 迎撃：左右の盾板が、レーダーのように体のまわりを回る（極は4枚）
    if (has('intercept')) {
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      const n = kw('intercept') ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const a = t * 1.4 + (i * TAU) / n;
        ctx.beginPath(); ctx.arc(0, 0, r * 1.38, a - 0.4, a + 0.4); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(Math.cos(a + 0.4) * r * 1.38, Math.sin(a + 0.4) * r * 1.38, 1.6, 0, TAU); ctx.fill();
        if (kw('intercept')) core(() => { ctx.beginPath(); ctx.arc(0, 0, r * 1.38, a - 0.3, a + 0.3); ctx.stroke(); }, 1);
      }
    }
    // 極・進化の印：まんなかの芯が虹色になる（極を1つでも持てば）
    if (look && look.evo && Object.keys(look.evo).length) rainbowCore(r * 0.42, t);
    ctx.restore();
  }

  function drawGhosts(state, t) {
    const ram = state.ghostAttack === 'ram';
    for (const g of allGhosts(state)) if (g.awe) drawAwe(g, t);
    for (const g of allGhosts(state)) if (g.taunt) drawTaunt(g, t);
    for (const g of allGhosts(state)) {
      const a = ghostAlpha(g.life, t);
      const col = ghostColor(g.idx);

      g.trail.forEach((p, k) => {
        ctx.globalAlpha = a * 0.12 * (5 - k);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, g.r * (1 - k * 0.12)), 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = a;
      const look = g.look || state.ghostLook || null;
      // まっすぐな線から生まれた分身（弾がよく当たる）：体のまわりに細い水色の輪がゆっくり回る
      if (g.straight != null) {
        const k = straightGlow(g.straight);
        if (k > 0.05) {
          ctx.save();
          ctx.globalAlpha = a * (0.25 + 0.6 * k);
          ctx.strokeStyle = '#bff4ff'; ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 12;
          ctx.beginPath(); ctx.arc(g.x, g.y, g.r + 5, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
          ctx.globalAlpha = a;
        }
      }
      drawGhostBody(g, col, look, t);

      if (ram) {
        // 体当たり型：回るトゲの輪
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(t * 6);
        ctx.fillStyle = col;
        for (let k = 0; k < 6; k++) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(g.r + 2, -3);
          ctx.lineTo(g.r + 8, 0);
          ctx.lineTo(g.r + 2, 3);
          ctx.fill();
        }
        ctx.restore();
      }

      // 分裂した小さな分身：残り時間を外側の細い輪で見せる（減っていく）
      if (g.split != null) {
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.split);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 弾 ----------
  // 弾：1発ずつ影のぼかし（shadowBlur）で光らせるととても重いので、色ごとにまとめて描く。
  //   光は「太くて薄い線」を下に重ねて見せる（ぼかしを使わない）
  function drawShots(state) {
    if (!state.shots.length) return;
    const groups = new Map();
    for (const sh of state.shots) {
      const ice = sh.owner === 'ice' || sh.owner === 'blade';   // 砕氷の破片・千刃：白っぽい水色
      const c = sh.gold ? '#ffd84a' : sh.owner === 'player' ? THEME.playerShot : ice ? '#bff4ff' : ghostColor(sh.idx);
      const halo = sh.owner === 'player' ? THEME.playerGlow : ice ? '#7fe3ff' : c;
      const w = Math.round(sh.size * 4) / 2;   // 太さも同じものをまとめる
      const key = c + '|' + halo + '|' + w;
      let g = groups.get(key);
      if (!g) { g = { c, halo, w, list: [] }; groups.set(key, g); }
      g.list.push(sh);
    }
    ctx.save();
    ctx.lineCap = 'round';
    const path = (g) => {
      ctx.beginPath();
      for (const sh of g.list) {
        const tail = 0.02 + sh.size * 0.004;
        ctx.moveTo(sh.x - sh.vx * tail, sh.y - sh.vy * tail);
        ctx.lineTo(sh.x, sh.y);
      }
    };
    // 弾がとても多いときは、下の光を省く（分身が多いと、弾だけで描く量が倍になる）
    if (PREFS.glow > 0 && state.shots.length < 120) {
      ctx.globalAlpha = Math.min(0.5, 0.28 * PREFS.glow);
      for (const g of groups.values()) { ctx.strokeStyle = g.halo; ctx.lineWidth = g.w * 2 + 5 * PREFS.glow; path(g); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    for (const g of groups.values()) { ctx.strokeStyle = g.c; ctx.lineWidth = g.w * 2; path(g); ctx.stroke(); }
    ctx.restore();
  }

  // ---------- 敵 ----------
  // 色は赤で統一し、形で種類を見分ける
  // ふつうの敵の体の絵を、種類・大きさ・色ごとに一度だけ描いてとっておく（画面の細かさに合わせて描く）
  // 使い回しは、遅い端末の試験では速くならなかったので、今は切っておく（スマホで試して速ければ true に）
  const USE_SPRITES = false;
  const spriteCache = new Map();
  function drawEnemySprite(e, body, edge, hit, heavy) {
    const m = ctx.getTransform(), sc = Math.hypot(m.a, m.b);      // ゲーム内の長さ1が、画面の何点か
    const unrot = e.kind === 'bomber' || e.kind === 'thief';     // この2つは、体の向きに関係なく上向きに描く
    const rq = Math.round(e.r * 2) / 2;
    const gl = PREFS.glow;
    const key = `${e.kind}|${rq}|${body}|${edge}|${hit ? 1 : 0}|${Math.round(sc * 20)}|${gl}`;
    let sp = spriteCache.get(key);
    if (!sp) {
      if (spriteCache.size > 600) spriteCache.clear();
      const blur = (heavy ? 16 : 12) * gl;
      const half = rq * 1.7 + 4 + blur / sc;                     // 形のはみ出し＋縁＋光の分の余白（ゲーム内の長さ）
      const px = Math.ceil(half * 2 * sc);
      // 使い回す絵は、画面に貼るのが速い形（ImageBitmap）にしておく（ふつうのcanvasのままだと、貼るたびに中身を送り直して遅い）
      const off = typeof OffscreenCanvas !== 'undefined';
      const cv0 = off ? new OffscreenCanvas(px, px) : document.createElement('canvas');
      if (!off) { cv0.width = px; cv0.height = px; }
      const c2 = cv0.getContext('2d');
      c2.translate(px / 2, px / 2); c2.scale(sc, sc);
      const save = ctx; ctx = c2;
      try {
        const fake = { kind: e.kind, r: rq, ang: 0 };
        if (blur > 0) { c2.shadowColor = body; c2.shadowBlur = blur; }
        c2.fillStyle = hit ? '#ffffff' : body;
        c2.strokeStyle = edge;
        c2.lineWidth = e.kind === 'tank' ? 3.5 : 2.5;
        enemyShape(fake);
        c2.fill();
        c2.shadowBlur = 0;
        c2.stroke();
        c2.fillStyle = 'rgba(255,255,255,0.85)';
        c2.beginPath(); c2.arc(0, 0, heavy ? 4 : 2.5, 0, Math.PI * 2); c2.fill();
      } finally { ctx = save; }
      const cv = off && cv0.transferToImageBitmap ? cv0.transferToImageBitmap() : cv0;
      sp = { cv, half };
      spriteCache.set(key, sp);
    }
    if (unrot) { ctx.save(); ctx.rotate(-(e.ang || 0)); }
    ctx.drawImage(sp.cv, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
    if (unrot) ctx.restore();
  }
  function enemyShape(e) {
    const r = e.r;
    ctx.beginPath();
    if (e.kind === 'shooter') {
      // ひし形
      ctx.moveTo(r * 1.25, 0); ctx.lineTo(0, r * 0.9); ctx.lineTo(-r * 1.0, 0); ctx.lineTo(0, -r * 0.9);
    } else if (e.kind === 'tank') {
      // 角を落とした大きな四角
      const k = r * 0.35;
      ctx.moveTo(-r + k, -r); ctx.lineTo(r - k, -r); ctx.lineTo(r, -r + k); ctx.lineTo(r, r - k);
      ctx.lineTo(r - k, r); ctx.lineTo(-r + k, r); ctx.lineTo(-r, r - k); ctx.lineTo(-r, -r + k);
    } else if (e.kind === 'drift' || e.kind === 'swarm') {
      // 漂い：丸／群れ：小さな丸（大きさは体力で決まるので、群れは自然に小さくなる）
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else if (e.kind === 'bomber') {
      // 自爆：太い十字（＋）。回さずに描く
      const w = r * 0.42;
      const c = Math.cos(-(e.ang || 0)), s2 = Math.sin(-(e.ang || 0));
      const pts = [[w, -r], [w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w], [-w, -r]];
      pts.forEach(([x, y], k) => { const X = x * c - y * s2, Y = x * s2 + y * c; if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
    } else if (e.kind === 'thief') {
      // かけら泥棒：5つの角の星（回転させずに描くため、体の向きとは関係なく上向き）
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5 - (e.ang || 0);
        const rr = k % 2 === 0 ? r * 1.3 : r * 0.58;
        if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
    } else if (e.kind === 'shield') {
      // 半円：前（盾を向ける側）が平ら、後ろが丸い
      ctx.moveTo(r * 0.45, -r);
      ctx.ellipse(r * 0.45, 0, r * 1.45, r, 0, -Math.PI / 2, Math.PI / 2, true);
    } else if (e.kind === 'dasher') {
      // 細い矢じり
      ctx.moveTo(r * 1.6, 0); ctx.lineTo(-r * 0.9, r * 0.75); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(-r * 0.9, -r * 0.75);
    } else if (e.kind === 'core') {
      // ボス「コア」：八角形
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + Math.PI / 8;
        if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    } else if (e.kind === 'hunter') {
      // ボス「ハンター」：前へ鋭くとがった矢じりに、左右の翼と、後ろの切れ込み
      // 狩人：槍の穂先のような頭から、後ろへ反り返った2枚の刃の翼。翼の内側はのこぎりの歯
      ctx.moveTo(r * 1.7, 0);
      ctx.lineTo(r * 0.5, r * 0.3);
      ctx.quadraticCurveTo(-r * 0.2, r * 0.7, -r * 1.3, r * 1.25);     // 翼の外側（後ろへ反る）
      ctx.lineTo(-r * 0.75, r * 0.62);                                   // 翼の先から内側へ
      for (let k = 0; k < 3; k++) { const x = -r * 0.75 + k * r * 0.28; ctx.lineTo(x + r * 0.05, r * (0.5 - k * 0.07)); ctx.lineTo(x + r * 0.2, r * (0.58 - k * 0.1)); }   // のこぎりの歯
      ctx.lineTo(-r * 0.1, r * 0.22); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(-r * 0.1, -r * 0.22);
      for (let k = 2; k >= 0; k--) { const x = -r * 0.75 + k * r * 0.28; ctx.lineTo(x + r * 0.2, -r * (0.58 - k * 0.1)); ctx.lineTo(x + r * 0.05, -r * (0.5 - k * 0.07)); }
      ctx.lineTo(-r * 0.75, -r * 0.62);
      ctx.lineTo(-r * 1.3, -r * 1.25);
      ctx.quadraticCurveTo(-r * 0.2, -r * 0.7, r * 0.5, -r * 0.3);
    } else if (e.kind === 'twin') {
      // ボス「双子」：向かい合う三日月（side で左右が入れかわる）
      // 大きい円から、相手の側へずらした同じ大きさの円をくり抜いた形
      const sd = e.side || 1, d = r * 0.75, y0 = Math.sqrt(r * r - (d * d) / 4);
      const a0 = Math.atan2(y0, d / 2), b0 = Math.atan2(y0, -d / 2);
      const N = 24;
      for (let k = 0; k <= N; k++) { const a = a0 + ((Math.PI * 2 - 2 * a0) * k) / N; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (k === 0) ctx.moveTo(sd * x, y); else ctx.lineTo(sd * x, y); }
      for (let k = 0; k <= N; k++) { const a = Math.PI * 2 - b0 - ((Math.PI * 2 - 2 * b0) * k) / N; ctx.lineTo(sd * (d + Math.cos(a) * r), Math.sin(a) * r); }
    } else if (e.kind === 'clock') {
      // ボス「時計」：歯車の縁（12の歯）
      for (let k = 0; k < 24; k++) {
        const a = (k * Math.PI) / 12, rr = k % 2 === 0 ? r : r * 0.86;
        const a1 = a - 0.09, a2 = a + 0.09;
        if (k === 0) ctx.moveTo(Math.cos(a1) * rr, Math.sin(a1) * rr); else ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
        ctx.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
      }
    } else if (e.kind === 'shade') {
      // ボス「影」：分身に似た、裾がゆらぐしずく形
      ctx.moveTo(0, -r * 1.2);
      ctx.bezierCurveTo(r * 0.9, -r * 1.0, r * 1.1, r * 0.2, r * 0.9, r * 0.9);
      for (let k = 0; k <= 4; k++) { const x = r * 0.9 - (k * r * 1.8) / 4, y = r * (k % 2 ? 0.7 : 1.05); ctx.lineTo(x, y); }
      ctx.bezierCurveTo(-r * 1.1, r * 0.2, -r * 0.9, -r * 1.0, 0, -r * 1.2);
    } else if (e.kind === 'echo') {
      // 影が作る「敵の分身」：小さな丸（中は空洞）
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else {
      // 三角
      ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r * 0.8, r * 0.85); ctx.lineTo(-r * 0.8, -r * 0.85);
    }
    ctx.closePath();
  }

  function drawEnemies(state, t) {
    const VW = state.world.w, VH = state.world.h;
    state.enemies.forEach((e, i) => {
      // 画面の外の敵は描かない（ボスの予告などは画面の外にも届くので、ボスは描く）
      const pad = e.r * 2 + 8;
      if (!e.boss && (e.x < -pad || e.x > VW + pad || e.y < -pad || e.y > VH + pad)) return;
      // 突進の予告線
      if (e.kind === 'dasher' && e.phase === 'windup') {
        ctx.save();
        ctx.strokeStyle = THEME.enemy;
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 30);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + e.dashX * 230, e.y + e.dashY * 230);
        ctx.stroke();
        ctx.restore();
      }

      // ハンターの突進の予告：太い帯と、進む向きの矢じりが流れる
      if (e.kind === 'hunter' && e.phase === 'windup') {
        ctx.save();
        const L = e.dashLen || 300, ax = Math.cos(e.ang || 0), ay = Math.sin(e.ang || 0), w = e.r * 1.2;
        ctx.fillStyle = `rgba(${THEME.enemyRgbB}, ${0.12 + 0.1 * Math.sin(t * 20)})`;
        ctx.translate(e.x, e.y); ctx.rotate(e.ang || 0);
        ctx.fillRect(0, -w, L, w * 2);
        ctx.strokeStyle = `rgba(${THEME.enemyRgbL}, 0.8)`; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        ctx.strokeRect(0, -w, L, w * 2); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 120, 140, 0.8)';
        for (let k = 0; k < 5; k++) { const x = ((t * 260 + k * L / 5) % L); ctx.beginPath(); ctx.moveTo(x + 10, 0); ctx.lineTo(x - 4, -8); ctx.lineTo(x - 4, 8); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      // ハンター：後ろに残る、速さの残像（2つ）
      if (e.kind === 'hunter') {
        for (let k = 2; k >= 1; k--) {
          ctx.save(); ctx.translate(e.x - Math.cos(e.ang || 0) * e.r * 0.9 * k, e.y - Math.sin(e.ang || 0) * e.r * 0.9 * k); ctx.rotate(e.ang || 0);
          ctx.globalAlpha = 0.18 / k; ctx.fillStyle = THEME.enemy; enemyShape(e); ctx.fill(); ctx.restore();
        }
      }
      // 時計：針の予告（届く範囲の円と、針の出る向きが点滅）と、回っている針（後ろに薄い扇）
      if (e.kind === 'clock' && (e.phase === 'windup' || e.phase === 'sweep') && e.handA != null) {
        const C = CONFIG.boss.clock, z = state.zoom || 1;
        const hands = [{ a: e.handA + Math.PI * 2 * (e.sweepK || 0), len: C.hand * z, dir: 1 }];
        if (e.rage) hands.push({ a: e.handA + Math.PI - Math.PI * 2 * (e.sweepK || 0), len: C.rageHand * z, dir: -1 });
        ctx.save(); ctx.translate(e.x, e.y); ctx.lineCap = 'round';
        for (const h of hands) {
          if (e.phase === 'windup') {
            const k = 1 - Math.max(0, e.timer) / (e.windupMax || 1);
            ctx.fillStyle = `rgba(${THEME.enemyRgbB}, ${0.06 + 0.1 * k})`;
            ctx.beginPath(); ctx.arc(0, 0, h.len, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(${THEME.enemyRgbL}, 0.45)`; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.arc(0, 0, h.len, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * h.len * 0.94, Math.sin(a) * h.len * 0.94); ctx.lineTo(Math.cos(a) * h.len, Math.sin(a) * h.len); ctx.stroke(); }
            ctx.strokeStyle = `rgba(${THEME.enemyRgbL}, ${Math.sin(t * 24) > 0 ? 0.9 : 0.35})`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(h.a) * h.len, Math.sin(h.a) * h.len); ctx.stroke();
          } else {
            // 通った跡の薄い扇
            const back = 0.9 * h.dir;
            const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, h.len);
            gr.addColorStop(0, `rgba(${THEME.enemyRgbB}, 0.05)`); gr.addColorStop(1, `rgba(${THEME.enemyRgbB}, 0.22)`);
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, h.len, h.a - back, h.a, h.dir < 0); ctx.closePath(); ctx.fill();
            glow(THEME.enemy, 14);
            ctx.strokeStyle = THEME.enemyLight; ctx.lineWidth = C.handWidth * z * 2;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(h.a) * h.len, Math.sin(h.a) * h.len); ctx.stroke();
            noGlow();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(h.a) * h.len, Math.sin(h.a) * h.len); ctx.stroke();
          }
        }
        ctx.restore();
      }
      // 自爆：止まって点滅している間、爆発する範囲を赤い円で見せる（だんだん濃く）
      if (e.kind === 'bomber' && e.phase === 'windup') {
        ctx.save();
        const k = 1 - Math.max(0, e.timer) / (e.windupMax || 1);
        ctx.fillStyle = `rgba(${THEME.enemyRgbB}, ${0.08 + 0.14 * k})`;
        ctx.strokeStyle = `rgba(${THEME.enemyRgbL}, ${0.5 + 0.4 * k})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.blast, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      const st0 = e.status || NO_STATUS;
      // 冷えて遅い敵も、凍った敵と同じ見た目にする
      const st = st0.chill && !st0.freeze ? { ...st0, freeze: true } : st0;
      if (st.pull) drawPullLines(e, st.pull, t);

      const warn = (e.phase === 'windup' || e.flow === 'warn') && Math.sin(t * 40) > 0; // 撃つ・突っ込む直前は白く点滅（ボスは技の予告の間）
      const hit = e.flash > 0 || warn;
      const heavy = e.kind === 'tank' || e.boss || e.elite;      // 重いもの・ボス・中ボスは縁を太く
      // ボスのすき：まわりに白い点線の輪が回り、上に「チャンス」
      if (e.vuln) drawBossChance(e, t);
      ctx.save();
      if (e.vanish) ctx.globalAlpha *= 0.12;   // 影が消えている間
      ctx.translate(e.x, e.y);
      ctx.rotate(e.kind === 'tank' || (e.boss && e.kind !== 'hunter' && e.kind !== 'twin') ? 0 : e.ang || 0);
      // 体の色：凍結＝水色、毒＝紫（両方なら凍結を優先）。影と敵の分身は黒い体
      const dark = e.kind === 'shade' || e.kind === 'echo';
      const body = st.freeze ? STATUS.iceBody : st.chill ? STATUS.chillBody : st.poison ? STATUS.poisonBody : dark ? '#1a0a14' : THEME.enemy;
      const edge = st.freeze ? STATUS.iceEdge : st.chill ? STATUS.chillEdge : st.poison ? STATUS.poisonEdge : dark ? THEME.enemy : (THEME.enemyLine || THEME.enemyEdge);
      // 中ボス：体の外に、もう1本の太い縁取り
      if (e.elite) { ctx.save(); ctx.scale(1.22, 1.22); enemyShape(e); ctx.strokeStyle = THEME.enemy; ctx.globalAlpha = 0.55; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
      // ふつうの敵：体（光・塗り・縁・まんなかの点）は、前に描いた絵を使い回して貼るだけにする（見た目は同じで、ずっと軽い）
      if (USE_SPRITES && !e.boss && !e.elite && !e.vanish && !e.rage && e.kind !== 'echo') {
        drawEnemySprite(e, body, edge, hit, heavy);
      } else {
        // 怒った双子：赤く脈打つ光
        if (e.rage) { const k = 0.5 + 0.5 * Math.sin(t * 10); glow(THEME.enemy, 30 * k); }
        glow(body, heavy ? 16 : 12);
        ctx.fillStyle = hit ? '#ffffff' : body;
        ctx.strokeStyle = edge;
        ctx.lineWidth = e.boss || e.elite ? 5 : e.kind === 'tank' ? 3.5 : 2.5;
        enemyShape(e);
        ctx.fill();
        noGlow();
        ctx.stroke();
        if (!(e.boss && e.kind !== 'core') && e.kind !== 'echo') {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.arc(0, 0, heavy ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (e.kind === 'core') drawCoreRing(e, t);
      else if (e.boss || e.kind === 'echo') drawBossDetail(e, t);
      if (e.kind === 'shield' && e.shield > 0) drawShieldPlate(e, t);
      if (st.freeze) drawIceShell(e, t);
      ctx.restore();

      if (st.poison) drawPoison(e, i, t);
      if (st.burn) drawBurn(e, i, t);
      if (st.shock) drawShock(e, i, t);
      if (st.mark) drawMark(e, t);
      if (e.focus > 0) drawFocus(e, t);
      if (e.carry > 0) drawCarry(e, t);
    });
  }

  // かけら泥棒：持っているかけらが、体のまわりを回る（数が多いほど多く見える。最大8個）
  function drawCarry(e, t) {
    const n = Math.min(8, e.carry);
    const R = e.r * 1.3 + 7;
    ctx.save();
    glow(THEME.shard, 8);
    ctx.fillStyle = THEME.shard;
    ctx.strokeStyle = THEME.shardEdge;
    ctx.lineWidth = 1.2;
    for (let k = 0; k < n; k++) {
      const a = t * 2.2 + (k * Math.PI * 2) / n;
      const x = e.x + Math.cos(a) * R, y = e.y + Math.sin(a) * R;
      ctx.beginPath();
      ctx.moveTo(x, y - 4.2); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4.2); ctx.lineTo(x - 3, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    noGlow();
    ctx.restore();
  }

  // レーザー：分身から画面の端までの、まっすぐな光（だんだん細くなって消える）
  // 死神の型：画面を横切る大鎌と、死の宣告の印（減っていく輪）
  function drawReaper(state, t) {
    const sc = state.scythe;
    if (sc && sc.x != null) {
      ctx.save(); ctx.translate(sc.x, sc.y); ctx.scale(sc.dir, 1);
      const H = sc.h;
      // 通ったあとの残像
      const g = ctx.createLinearGradient(-H * 0.9, 0, 0, 0);
      g.addColorStop(0, 'rgba(160, 120, 255, 0)'); g.addColorStop(1, 'rgba(160, 120, 255, 0.25)');
      ctx.fillStyle = g; ctx.fillRect(-H * 0.9, -H / 2, H * 0.9, H);
      // 三日月の刃
      glow('#c8b0ff', 18); ctx.fillStyle = '#e8e0ff';
      ctx.beginPath();
      ctx.moveTo(0, -H / 2); ctx.quadraticCurveTo(H * 0.42, 0, 0, H / 2); ctx.quadraticCurveTo(H * 0.2, 0, 0, -H / 2);
      ctx.fill(); noGlow();
      ctx.restore();
    }
    for (const e of state.enemies) {
      if (!(e.doomT > 0)) continue;
      const k = e.doomT / SK_DOOM;
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.strokeStyle = THEME.enemy; ctx.lineWidth = 2; glow(THEME.enemy, 8);
      ctx.beginPath(); ctx.arc(0, 0, e.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); noGlow();
      ctx.fillStyle = THEME.enemy; ctx.font = `bold ${Math.round(e.r)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil(e.doomT)), 0, -e.r - 14);
      ctx.restore();
    }
  }
  // 毒の型：毒霧（紫のもや）
  function drawFog(state, t) {
    for (const f of state.fogs || []) {
      const k = Math.min(1, f.life / 0.5, (f.max - f.life) / 0.2 + 0.2);
      const R = f.r * (1 + 0.1 * Math.sin(t * 3 + f.x));
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
      g.addColorStop(0, `rgba(180, 92, 255, ${0.4 * k})`); g.addColorStop(1, 'rgba(180, 92, 255, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 重力の型：引力の渦（一番大きい分身のまわり）・斥力の輪・重力弾の小さな渦・重力崩壊
  function swirl(x, y, R, t, alpha, n = 3) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(40, 10, 70, ${0.35 * alpha})`); g.addColorStop(1, 'rgba(120, 60, 200, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(190, 150, 255, ${0.35 * alpha})`; ctx.lineWidth = 1.2;
    for (let k = 0; k < n; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) { const u = i / 24, a = -t * 2 + (k * Math.PI * 2) / n + u * 3.2, rr = R * (1 - u * 0.85); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawGravity(state, t) {
    for (const g of state.ghosts) if (g.pull) swirl(g.x, g.y, g.pull, t, 1, 4);
    for (const w of state.wells || []) swirl(w.x, w.y, w.r || 50, t * 1.5, Math.min(1, w.life / 0.3), 3);
    const p = state.player;
    if (p && p.repel) {
      ctx.save(); ctx.strokeStyle = 'rgba(190, 150, 255, 0.5)'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) { const ph = (t * 1.2 + k / 2) % 1; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (p.repel - p.r) * ph, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }
    if (state.collapseT > 0) swirl(state.world.w / 2, state.world.h / 2, Math.max(state.world.w, state.world.h) * 0.45, t * 2, Math.min(1, state.collapseT / 0.4), 6);
  }
  // 氷の型：霜の道（分身の軌跡に付いた霜）と、冷気（分身のまわりの冷たい輪）
  function drawIce(state, t) {
    if (state.frost) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const g of state.ghosts) {
        const c = g.clip; if (!c || c.length < 2) continue;
        ctx.strokeStyle = 'rgba(191, 244, 255, 0.35)'; ctx.lineWidth = 10;
        ctx.beginPath(); for (let i = 0; i < c.length; i += 4) (i ? ctx.lineTo(c[i].x, c[i].y) : ctx.moveTo(c[i].x, c[i].y)); ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let i = 0; i < c.length; i += 18) { const x = c[i].x, y = c[i].y; ctx.save(); ctx.translate(x, y); ctx.rotate(i); for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.fillRect(-3, -0.5, 6, 1); } ctx.restore(); }
      }
      ctx.restore();
    }
    for (const g of state.ghosts) {
      if (!g.cold) continue;
      ctx.save();
      const gr = ctx.createRadialGradient(g.x, g.y, g.r, g.x, g.y, g.cold);
      gr.addColorStop(0, 'rgba(127, 227, 255, 0.18)'); gr.addColorStop(1, 'rgba(127, 227, 255, 0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.x, g.y, g.cold, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(191, 244, 255, 0.4)'; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -t * 10; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(g.x, g.y, g.cold, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
  }
  // 雷の型：分身どうしの雷の線（毎回ぎざぎざが変わる）と、落ちる・飛び移る雷
  // 稲妻のぎざぎざを、今の道（パス）に足す（線を引くのはまとめて1回。1本ずつ光らせると、線の数だけ重くなる）
  function lightningPath(x0, y0, x1, y1, jag) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
    const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
    ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) { const k = i / n, o = (Math.random() - 0.5) * jag; ctx.lineTo(x0 + (x1 - x0) * k + nx / L * o, y0 + (y1 - y0) * k + ny / L * o); }
    ctx.lineTo(x1, y1);
  }
  function lightning(x0, y0, x1, y1, jag, w, col, alpha) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = alpha;
    ctx.beginPath(); lightningPath(x0, y0, x1, y1, jag); ctx.stroke();
  }
  function drawThunder(state, t) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    glow('#ffe14a', 12);
    // 雷の線：外側の黄色を全部まとめて1回、内側の白を全部まとめて1回で描く（見た目は同じで、描く回数がとても少ない）
    const links = state.links || [];
    if (links.length) {
      ctx.strokeStyle = '#ffe14a'; ctx.lineWidth = 3.5; ctx.globalAlpha = 0.55;
      ctx.beginPath(); for (const [a, b] of links) lightningPath(a.x, a.y, b.x, b.y, 12); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.95;
      ctx.beginPath(); for (const [a, b] of links) lightningPath(a.x, a.y, b.x, b.y, 8); ctx.stroke();
    }
    for (const b of state.bolts || []) { const k = b.life / b.max; lightning(b.x0, b.y0, b.x1, b.y1, 18, 4, '#ffe14a', 0.7 * k); lightning(b.x0, b.y0, b.x1, b.y1, 10, 1.6, '#ffffff', k); }
    noGlow(); ctx.restore();
  }
  // 炎の道：燃える軌跡・火の海・火の粉・火柱
  function drawFires(state, t) {
    for (const f of state.fires || []) {
      const k = Math.min(1, f.life / 0.4);
      ctx.save();
      if (f.kind === 'sea') {
        ctx.globalAlpha = 0.45 * k;
        const g = ctx.createLinearGradient(0, 0, 0, 1);
        ctx.fillStyle = '#ff6a1f'; glow('#ff8a1f', 18);
        ctx.beginPath(); f.poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); noGlow();
        ctx.globalAlpha = 0.8 * k; ctx.fillStyle = '#ffe14a';
        for (let i = 0; i < f.poly.length; i += 3) { const p = f.poly[i], h = 4 + 3 * Math.sin(t * 9 + i); ctx.beginPath(); ctx.moveTo(p.x - 3, p.y); ctx.quadraticCurveTo(p.x, p.y - h * 2, p.x + 3, p.y); ctx.fill(); }
      } else {
        // 揺れる炎の舌を、軌跡の点ごとに並べる
        glow('#ff8a1f', 12);
        for (let i = 0; i < f.pts.length; i++) {
          const p = f.pts[i], w = f.width, h = w * (1.4 + 0.5 * Math.sin(t * 10 + i * 1.7));
          ctx.globalAlpha = 0.85 * k; ctx.fillStyle = '#ff6a1f';
          ctx.beginPath(); ctx.moveTo(p.x - w * 0.8, p.y + w * 0.3); ctx.quadraticCurveTo(p.x - w * 0.3, p.y - h, p.x, p.y - h * 1.2); ctx.quadraticCurveTo(p.x + w * 0.3, p.y - h, p.x + w * 0.8, p.y + w * 0.3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffe14a'; ctx.globalAlpha = 0.9 * k;
          ctx.beginPath(); ctx.ellipse(p.x, p.y - h * 0.3, w * 0.3, h * 0.45, 0, 0, Math.PI * 2); ctx.fill();
        }
        noGlow();
      }
      ctx.restore();
    }
    for (const em of state.embers || []) {
      const k = Math.min(1, em.life / 0.5), f2 = 0.6 + 0.4 * Math.sin(t * 8 + em.x);
      ctx.save(); ctx.globalAlpha = k * f2; glow('#ff8a1f', 8); ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(em.x, em.y, 2.2, 0, Math.PI * 2); ctx.fill(); noGlow(); ctx.restore();
    }
    for (const pl of state.firePillars || []) {
      const R = pl.r || 28, k = Math.min(1, pl.life / 0.4), pulse = 1 + 0.12 * Math.sin(t * 12);
      ctx.save(); ctx.globalAlpha = k;
      const g = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, R * pulse);
      g.addColorStop(0, 'rgba(255, 240, 160, 0.95)'); g.addColorStop(0.5, 'rgba(255, 120, 30, 0.7)'); g.addColorStop(1, 'rgba(255, 60, 20, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pl.x, pl.y, R * pulse, 0, Math.PI * 2); ctx.fill();
      // 上へ伸びる炎の柱
      glow('#ff8a1f', 16); ctx.fillStyle = 'rgba(255, 170, 60, 0.85)';
      ctx.beginPath(); ctx.moveTo(pl.x - R * 0.35, pl.y); ctx.quadraticCurveTo(pl.x - R * 0.2, pl.y - R * 2.2, pl.x, pl.y - R * 2.8 * pulse); ctx.quadraticCurveTo(pl.x + R * 0.2, pl.y - R * 2.2, pl.x + R * 0.35, pl.y); ctx.closePath(); ctx.fill(); noGlow();
      ctx.restore();
    }
  }
  // 罠の道：光の罠（置き土産）とマキビシ。消える前の1秒は点滅
  function drawTraps(state, t) {
    for (const tr of state.traps || []) {
      if (tr.life < 1 && Math.floor(tr.life * 10) % 2 === 0) continue;
      ctx.save(); ctx.translate(tr.x, tr.y);
      const col = ghostColor(tr.idx, 1);
      if (tr.kind === 'mine') {
        // 地雷：黒い円盤に、赤い灯り（爆発が近いほど速く点滅）
        const fast = tr.fuse != null && tr.fuse < 1.2;
        const on = Math.floor(t * (fast ? 12 : 3) + tr.rot) % 2 === 0;
        ctx.fillStyle = '#2a2f3d'; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#5a6478'; ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) { const a = tr.rot + (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5); ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); ctx.stroke(); }
        if (on) { glow(THEME.enemy, 10); ctx.fillStyle = THEME.enemy; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill(); noGlow(); }
      } else if (tr.kind === 'light') {
        const k = 0.75 + 0.25 * Math.sin(t * 5 + tr.rot);
        glow(col, 12); ctx.fillStyle = ghostColor(tr.idx, 0.35); ctx.strokeStyle = col; ctx.lineWidth = 2;
        // 大きさは押し出された分身と同じ
        const R = (tr.size || 9) * k;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); noGlow();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, Math.max(2.5, R * 0.25), 0, Math.PI * 2); ctx.fill();
      } else {
        // マキビシ：4本のとげ。色は分身に関係なく灰色（返し針で何度も刺さるものは、ふちが明るい）
        ctx.rotate(tr.rot);
        ctx.fillStyle = '#a3abb8'; ctx.strokeStyle = tr.hits > 1 ? '#e8eef8' : '#4a5263'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? 1.6 : 5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // 疾風の型：疾走の跡（風神は竜巻）、残像斬りの残像と斬撃、瞬身の通り道
  function drawDashCuts(state, t) {
    const cuts = state.cuts || [];
    if (cuts.length) {
      ctx.save(); ctx.lineCap = 'round';
      for (const c of cuts) {
        const k = c.life / c.max;
        if (c.wind) {
          ctx.strokeStyle = `rgba(200, 255, 240, ${0.35 * k})`; ctx.lineWidth = 16 * k + 4;
          ctx.beginPath(); ctx.moveTo(c.x0, c.y0); ctx.lineTo(c.x1, c.y1); ctx.stroke();
          const mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2, a = t * 9 + mx * 0.1;
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * k})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(mx, my, 6 + 4 * k, a, a + 3.5); ctx.stroke();
        } else {
          glow('#fff6c8', 8);
          ctx.strokeStyle = `rgba(255, 246, 200, ${0.9 * k})`; ctx.lineWidth = 5 * k + 1;
          ctx.beginPath(); ctx.moveTo(c.x0, c.y0); ctx.lineTo(c.x1, c.y1); ctx.stroke();
          noGlow();
        }
      }
      ctx.restore();
    }
    for (const sl of state.slashes || []) {
      ctx.save(); ctx.translate(sl.x, sl.y);
      if (!sl.done) {
        // 残像：本体の形のうすい影
        ctx.globalAlpha = 0.45; ctx.fillStyle = THEME.playerGlow;
        starPath(0, 0, 9, 4, sl.dir); ctx.fill();
      } else {
        // 斬撃：十字に走る2本の光
        const k = Math.max(0, sl.life / 0.25);
        ctx.globalAlpha = k; glow('#ffffff', 10); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        const R = 30;
        for (const a of [sl.dir + 0.8, sl.dir - 0.8]) { ctx.beginPath(); ctx.moveTo(-Math.cos(a) * R, -Math.sin(a) * R); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
        noGlow();
      }
      ctx.restore();
    }
    for (const b of state.blinks || []) {
      const k = b.life / b.max;
      ctx.save(); ctx.lineCap = 'round'; glow('#fff6c8', 14);
      ctx.strokeStyle = `rgba(255, 246, 200, ${k})`; ctx.lineWidth = 10 * k + 2;
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${k})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(b.x1, b.y1); ctx.stroke();
      noGlow(); ctx.restore();
    }
  }
  function drawLasers(state) {
    for (const L of state.lasers || []) {
      const k = L.life / L.max;
      const col = ghostColor(L.idx);
      ctx.save();
      ctx.lineCap = 'round';
      glow(col, 18);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.55 * k;
      ctx.lineWidth = L.w * 2 * k;
      ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(L.x2, L.y2); ctx.stroke();
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, L.w * 0.7 * k);
      ctx.beginPath(); ctx.moveTo(L.x1, L.y1); ctx.lineTo(L.x2, L.y2); ctx.stroke();
      noGlow();
      ctx.restore();
    }
  }

  // 天の光：画面を縦に貫く光の柱（落ちる直前は細い予告線、落ちたら太く光って消える）
  function drawPillars(state, t) {
    for (const P of state.pillars || []) {
      ctx.save();
      if (P.warn > 0) {
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 30);
        ctx.strokeStyle = '#fff6c8';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(P.x, 0); ctx.lineTo(P.x, worldH); ctx.stroke();
      } else {
        const k = P.life / P.max;
        const grad = ctx.createLinearGradient(P.x - P.w, 0, P.x + P.w, 0);
        grad.addColorStop(0, 'rgba(255,246,200,0)');
        grad.addColorStop(0.5, `rgba(255,250,225,${0.85 * k})`);
        grad.addColorStop(1, 'rgba(255,246,200,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(P.x - P.w, 0, P.w * 2, worldH);
        ctx.fillStyle = `rgba(255,255,255,${k})`;
        ctx.fillRect(P.x - P.w * 0.18, 0, P.w * 0.36, worldH);
      }
      ctx.restore();
    }
  }

  // 盾持ちの盾：平らな前面の外に、少し反った金属の板。残りが少ないほどひびが増える
  function drawShieldPlate(e, t) {
    const r = e.r;
    const left = e.shield / e.shieldMax;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(r * 0.6, -r * 1.25);
    ctx.quadraticCurveTo(r * 1.0, 0, r * 0.6, r * 1.25);
    ctx.lineTo(r * 1.05, r * 1.25);
    ctx.quadraticCurveTo(r * 1.6, 0, r * 1.05, -r * 1.25);
    ctx.closePath();
    glow(STATUS.shield, 8);
    ctx.fillStyle = e.shieldHit > 0 ? '#ffffff' : STATUS.shield;
    ctx.fill();
    noGlow();
    ctx.strokeStyle = STATUS.shieldEdge;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // ひび
    ctx.strokeStyle = STATUS.shieldEdge;
    ctx.lineWidth = 1.3;
    const cracks = left < 0.34 ? 2 : left < 0.67 ? 1 : 0;
    for (let k = 0; k < cracks; k++) {
      const y0 = (k === 0 ? -0.35 : 0.4) * r;
      ctx.beginPath();
      ctx.moveTo(r * 1.0, y0);
      ctx.lineTo(r * 1.18, y0 + r * 0.18);
      ctx.lineTo(r * 1.06, y0 + r * 0.36);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 集中砲火：同じ敵に当てるほど、まわりの輪が上（12時）から時計回りに満ちる。上限で光る
  function drawFocus(e, t) {
    const R = e.r + 5;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = THEME.barInk;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = STATUS.focus;
    ctx.lineWidth = 2;
    if (e.focus >= 1) glow(STATUS.focus, 10 + 4 * Math.sin(t * 10));
    ctx.beginPath(); ctx.arc(e.x, e.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, e.focus)); ctx.stroke();
    noGlow();
    ctx.restore();
  }

  // ---------- 敵の状態の印 ----------
  // 色は「敵の赤」と「味方の寒色」のどちらとも混ざらないように選ぶ
  //   凍結＝水色の体＋白い殻、痺れ＝黄色、毒＝紫の体＋紫の泡、燃焼＝橙と黄、吸い寄せ＝白っぽい線、目印＝白い的
  // 同じ敵の印が毎回同じ場所に出るよう、番号から決まる「乱数もどき」を使う
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ボスの体の中の細かい形（体の向きの中で描く）
  function drawBossDetail(e, t) {
    const r = e.r;
    ctx.save();
    if (e.kind === 'hunter') {
      // 背骨の白い筋と、刃のふちを走る光
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 1.35, 0); ctx.lineTo(-r * 0.35, 0); ctx.stroke();
      const g = (t * 1.5) % 1;
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - g)})`; ctx.lineWidth = 2;
      for (const sy of [1, -1]) { ctx.beginPath(); ctx.moveTo(r * 0.5 - g * r * 1.6, sy * (r * 0.3 + g * r * 0.8)); ctx.lineTo(r * 0.5 - g * r * 1.8 - r * 0.25, sy * (r * 0.3 + g * r * 0.8 + r * 0.18)); ctx.stroke(); }
    } else if (e.kind === 'twin') {
      // 三日月の内側に沿う、細い白い光の線（ゆっくり明滅）
      ctx.save(); ctx.scale(0.72, 0.72); enemyShape(e); ctx.restore();
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.3 * Math.sin(t * 2 + (e.side || 1))})`; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (e.kind === 'clock') {
      // 文字盤：12の目盛りと、回る長針・短針
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, L = i % 3 === 0 ? 0.16 : 0.08; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66); ctx.lineTo(Math.cos(a) * r * (0.66 - L), Math.sin(a) * r * (0.66 - L)); ctx.stroke(); }
      ctx.lineCap = 'round'; ctx.strokeStyle = '#ffffff';
      const am = t * 1.2 - Math.PI / 2, ah = t * 0.1 - Math.PI / 2;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(am) * r * 0.55, Math.sin(am) * r * 0.55); ctx.stroke();
      ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ah) * r * 0.35, Math.sin(ah) * r * 0.35); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    } else if (e.kind === 'shade') {
      // 黒い体の中で、赤い渦がゆっくり回る
      ctx.save(); ctx.rotate(t * 0.8);
      glow(THEME.enemy, 10); ctx.strokeStyle = THEME.enemy; ctx.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let i = 0; i <= 16; i++) { const u = i / 16, a = (k * Math.PI * 2) / 3 + u * 2.6, rr = r * 0.65 * (1 - u * 0.85); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.stroke(); }
      noGlow(); ctx.restore();
      ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, ${0.4 + 0.3 * Math.sin(t * 4)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2); ctx.setLineDash([3, 6]); ctx.lineDashOffset = t * 20; ctx.stroke(); ctx.setLineDash([]);
    } else if (e.kind === 'echo') {
      // 敵の分身：中に赤い芯
      ctx.fillStyle = THEME.enemy; ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // 双子をつなぐ赤い糸（片方が倒れると切れる）と、影が作った敵の分身の道筋
  // 浮かぶ文字（即死 など）：ぽんと大きく出て、上へ流れながら消える
  // ダメージの数字：敵の上に、種類ごとの色で出る（会心は赤く大きく）
  const DN_COLOR = { aim: '#bff4ff', hit: '#ffffff', crit: '#ff4d5e', poison: '#c77dff', burn: '#ff9f43', shock: '#ffe066', ice: '#7fe3ff' };
  function drawDamageNums(state) {
    const D = state.dnums;
    if (!D || !D.length) return;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8, 10, 24, 0.85)'; ctx.lineJoin = 'round';
    let font = '';
    const VW = state.world.w, VH = state.world.h;
    for (const f of D) {
      if (f.x < -20 || f.x > VW + 20 || f.y < -20 || f.y > VH + 20) continue;   // 画面の外は描かない
      const k = f.t / f.max, crit = f.kind === 'crit';
      const size = Math.round((crit ? 14 : f.kind === 'aim' ? 11 : 10) * (k > 0.85 ? 1 + (k - 0.85) * 2 : 1));
      const want = `bold ${size}px 'DotGothic16', sans-serif`;
      if (want !== font) { ctx.font = want; font = want; }
      ctx.globalAlpha = Math.min(1, k / 0.35);
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = DN_COLOR[f.kind] || '#ffffff';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
  function drawFloats(state) {
    const F = state.floats;
    if (!F || !F.length) return;
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of F) {
      const k = 1 - f.t / f.max, pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.4);
      ctx.globalAlpha = Math.min(1, f.t / (f.max * 0.4));
      ctx.font = `bold ${Math.round(15 * pop)}px 'DotGothic16', sans-serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20, 0, 30, 0.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = '#e8b8ff'; glow('#c060ff', 10);
      ctx.fillText(f.text, f.x, f.y);
      noGlow();
    }
    ctx.restore();
  }
  // ボスの技の予告：赤く光る形。だんだん中が満ちていき、満ちたら技が来る。hot は当たっている最中（明るく）
  function drawWarns(state, t) {
    const W2 = state.warns;
    if (!W2 || !W2.length) return;
    ctx.save();
    for (const w of W2) {
      const k = 1 - Math.max(0, w.t) / (w.max || 1), pulse = 0.5 + 0.5 * Math.sin(t * 18);
      const fillA = w.hot ? 0.45 : 0.08 + 0.1 * k, lineA = w.hot ? 0.95 : 0.45 + 0.35 * pulse;
      ctx.fillStyle = `rgba(${THEME.enemyRgbB}, ${fillA})`;
      ctx.strokeStyle = `rgba(${THEME.enemyRgbL}, ${lineA})`;
      ctx.lineWidth = 2;
      if (w.k === 'circle') {
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.fill();
        ctx.setLineDash([7, 5]); ctx.lineDashOffset = -t * 30; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${THEME.enemyRgbB}, ${0.18 + 0.12 * k})`; ctx.beginPath(); ctx.arc(w.x, w.y, w.r * k, 0, Math.PI * 2); ctx.fill();
      } else if (w.k === 'line') {
        const a = Math.atan2(w.y2 - w.y1, w.x2 - w.x1), L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        ctx.save(); ctx.translate(w.x1, w.y1); ctx.rotate(a);
        ctx.fillRect(0, -w.w, L, w.w * 2);
        ctx.fillStyle = `rgba(${THEME.enemyRgbB}, ${0.2 + 0.15 * k})`; ctx.fillRect(0, -w.w, L * k, w.w * 2);
        ctx.setLineDash([8, 6]); ctx.strokeRect(0, -w.w, L, w.w * 2); ctx.setLineDash([]);
        ctx.restore();
      } else if (w.k === 'fan') {
        let a = w.a;
        if (w.aimAt === 'player' && state.player) a = Math.atan2(state.player.y - w.y, state.player.x - w.x);
        ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.arc(w.x, w.y, w.len, a - w.spread / 2, a + w.spread / 2); ctx.closePath(); ctx.fill();
        ctx.setLineDash([7, 5]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = `rgba(${THEME.enemyRgbB}, ${0.18 + 0.12 * k})`; ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.arc(w.x, w.y, w.len * k, a - w.spread / 2, a + w.spread / 2); ctx.closePath(); ctx.fill();
      } else if (w.k === 'path' && w.pts && w.pts.length > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); w.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.lineWidth = w.w * 2; ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, ${w.hot ? 0.55 : 0.12 + 0.12 * k})`; ctx.stroke();
        ctx.lineWidth = w.hot ? 3 : 1.6; ctx.strokeStyle = `rgba(${THEME.enemyRgbL}, ${lineA})`;
        if (!w.hot) { ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 40; }
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
  // ボスのすき：白い点線の輪が回り、上に「チャンス」の文字（ダメージが通りやすい合図）
  function drawBossChance(e, t) {
    ctx.save();
    const R = e.r * 1.4 + 3 * Math.sin(t * 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 40;
    glow('#ffffff', 10);
    ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, Math.PI * 2); ctx.stroke();
    noGlow(); ctx.setLineDash([]);
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffe14a'; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
    ctx.strokeText('チャンス！', e.x, e.y - R - 4); ctx.fillText('チャンス！', e.x, e.y - R - 4);
    ctx.restore();
  }
  function drawBossLinks(state, t) {
    const twins = state.enemies.filter((e) => e.kind === 'twin' && e.hp > 0 && !e.rage);
    if (twins.length === 2) {
      const [a, b] = twins;
      // 光の線：消えている間は細い点線、予告は細く点滅、当たる間は太く光る
      const st = state.twin ? state.twin.tether.st : 'off';
      ctx.save(); ctx.lineCap = 'round';
      if (st === 'on') {
        const w = CONFIG.boss.twin.tetherWidth * state.zoom;
        glow(THEME.enemy, 16);
        ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, 0.9)`; ctx.lineWidth = w * 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        noGlow();
        ctx.strokeStyle = `rgba(255,255,255,${0.75 + 0.25 * Math.sin(t * 30)})`; ctx.lineWidth = w * 0.6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else if (st === 'warn') {
        ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, ${0.35 + 0.35 * (Math.sin(t * 24) > 0 ? 1 : 0)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, 0.3)`; ctx.lineWidth = 1.5; ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.restore();
    }
    // 倒れた片方が戻ってくる場所：残り時間の輪
    if (state.twin && state.twin.dead) {
      const D = state.twin.dead, f = D.t / CONFIG.boss.twin.revive, rr = CONFIG.boss.twin.radius * state.zoom;
      ctx.save(); ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, 0.6)`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(D.x, D.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
      ctx.setLineDash([2, 5]); ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(D.x, D.y, rr * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    for (const e of state.enemies) {
      if (e.kind !== 'echo' || !e.path) continue;
      ctx.save(); ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, 0.4)`; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.lineDashOffset = t * 20;
      // まだ通っていない所だけ（動き出す前は少し濃く）
      if (e.wait > 0) { ctx.strokeStyle = `rgba(${THEME.enemyRgbB}, ${Math.sin(t * 24) > 0 ? 0.8 : 0.45})`; }
      const from = Math.max(0, e.pi || 0);
      ctx.beginPath(); ctx.moveTo(e.x, e.y); for (let i = from + 1; i < e.path.length; i++) ctx.lineTo(e.path[i].x, e.path[i].y); ctx.stroke();
      ctx.restore();
    }
  }
  // 時計が時間を止めている間：画面が青く沈み、外に目盛りが出る
  function drawTimeStop(state, t) {
    if (!(state.timeStop > 0)) return;
    const W = state.world.w, H = state.world.h;
    ctx.save();
    ctx.fillStyle = 'rgba(40, 60, 120, 0.28)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(191, 230, 255, 0.5)'; ctx.lineWidth = 2;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    for (let i = 0; i < 60; i++) { const a = (i * Math.PI) / 30, L = i % 5 === 0 ? 14 : 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R - L), cy + Math.sin(a) * (R - L)); ctx.stroke(); }
    ctx.restore();
  }
  function drawCoreRing(e, t) {
    ctx.save();
    ctx.rotate(t * 0.9);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([e.r * 0.35, e.r * 0.22]);
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 凍結：ひと回り大きい白い殻で包み、ところどころ光らせる
  function drawIceShell(e, t) {
    ctx.save();
    ctx.scale(1.3, 1.3);
    enemyShape(e);
    ctx.fillStyle = 'rgba(225, 248, 255, 0.28)';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.stroke();
    ctx.restore();
    // 氷のつや（短い斜めの線）ときらめき
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-e.r * 0.55, -e.r * 0.15); ctx.lineTo(-e.r * 0.2, -e.r * 0.5);
    ctx.moveTo(-e.r * 0.45, e.r * 0.15); ctx.lineTo(-e.r * 0.3, 0);
    ctx.stroke();
    const tw = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * tw})`;
    const s = 1.2 + tw * 1.4;
    ctx.fillRect(e.r * 0.7 - s / 2, -e.r * 0.8 - s * 1.5, s, s * 3);
    ctx.fillRect(e.r * 0.7 - s * 1.5, -e.r * 0.8 - s / 2, s * 3, s);
  }

  // 痺れ：体のまわりに、黄色いギザギザの火花が細かく入れ替わりながら走る
  function drawShock(e, i, t) {
    const frame = Math.floor(t * 14);
    ctx.save();
    ctx.strokeStyle = STATUS.shock;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'miter';
    glow(STATUS.shock, 8);
    for (let k = 0; k < 3; k++) {
      const seed = i * 31 + frame * 7 + k * 3;
      const a = hash(seed) * Math.PI * 2;
      const r0 = e.r * 0.7, r1 = e.r * 1.75;
      ctx.beginPath();
      for (let j = 0; j <= 3; j++) {
        const rr = r0 + ((r1 - r0) * j) / 3;
        const off = j === 0 || j === 3 ? 0 : (j % 2 ? 1 : -1) * e.r * 0.28;
        const x = e.x + Math.cos(a) * rr - Math.sin(a) * off;
        const y = e.y + Math.sin(a) * rr + Math.cos(a) * off;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    noGlow();
    ctx.restore();
  }

  // 毒：紫の泡が体から湧いて、上へ浮かんで消える
  function drawPoison(e, i, t) {
    const n = 5;
    for (let k = 0; k < n; k++) {
      const p = (t * 0.6 + k / n + hash(i * 5 + k) * 0.3) % 1;   // 0→1 で上へ
      const x = e.x + (hash(i * 11 + k) - 0.5) * e.r * 1.5 + Math.sin(t * 3 + k * 2) * 1.5;
      const y = e.y + e.r * 0.2 - p * e.r * 2.2;
      const rr = (1.6 + hash(i * 3 + k * 7) * 1.8) * (0.7 + p * 0.5);
      ctx.globalAlpha = Math.min(1, (1 - p) * 1.6);
      ctx.fillStyle = 'rgba(200, 120, 255, 0.6)';
      ctx.strokeStyle = STATUS.poison;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(x - rr * 0.45, y - rr * 0.45, Math.max(0.8, rr * 0.4), Math.max(0.8, rr * 0.4));
    }
    ctx.globalAlpha = 1;
  }

  // 燃焼：体の上側に小さな炎が3つ、ゆらゆら揺れる
  function flame(x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w, y - h * 0.55, x, y - h);
    ctx.quadraticCurveTo(x + w, y - h * 0.55, x + w, y);
    ctx.arc(x, y, w, 0, Math.PI);
    ctx.closePath();
  }
  function drawBurn(e, i, t) {
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const x = e.x + (k - 1) * e.r * 0.62;
      const y = e.y - e.r * (k === 1 ? 0.55 : 0.2);
      const wob = Math.sin(t * 17 + k * 2.1 + i) * 0.18 + Math.sin(t * 29 + k) * 0.08;
      const h = e.r * (k === 1 ? 1.05 : 0.75) * (1 + wob);
      const w = e.r * 0.26;
      glow(STATUS.burnOuter, 8);
      ctx.fillStyle = STATUS.burnOuter;
      flame(x, y, w, h);
      ctx.fill();
      noGlow();
      ctx.fillStyle = STATUS.burnInner;
      flame(x, y + w * 0.2, w * 0.5, h * 0.55);
      ctx.fill();
    }
    ctx.restore();
  }

  // 吸い寄せ：吸い寄せる先へ向かう線が、流れるように動く
  function drawPullLines(e, to, t) {
    const dx = to.x - e.x, dy = to.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const len = Math.min(d - e.r, e.r * 3.2);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -t * 40;
    for (let k = -1; k <= 1; k++) {
      const ox = -uy * k * e.r * 0.6, oy = ux * k * e.r * 0.6;
      const g = ctx.createLinearGradient(e.x, e.y, e.x + ux * len, e.y + uy * len);
      g.addColorStop(0, 'rgba(210, 220, 255, 0)');
      g.addColorStop(0.35, STATUS.pull);
      g.addColorStop(1, 'rgba(210, 220, 255, 0)');
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(e.x + ox * 0.5 + ux * e.r * 0.4, e.y + oy * 0.5 + uy * e.r * 0.4);
      ctx.lineTo(e.x + ox + ux * len, e.y + oy + uy * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 目印：頭上（HPバーのさらに上）に白い的。ゆっくり回り、少し脈打つ
  function drawMark(e, t) {
    const x = e.x, y = e.y - e.r - 19;
    const s = 5.5 * (1 + 0.1 * Math.sin(t * 6));
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = THEME.barInk;
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = STATUS.mark;
    ctx.lineWidth = 1.6;
    glow(STATUS.mark, 6);
    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
    noGlow();
    ctx.rotate(t * 1.5);
    ctx.lineWidth = 1.8;
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(s - 2, 0); ctx.lineTo(s + 3, 0); ctx.stroke();
    }
    ctx.fillStyle = STATUS.mark;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }

  function drawEnemyShots(state, t) {
    for (const b of state.enemyShots) {
      const pulse = 1 + Math.sin(t * 12) * 0.1;
      glow(THEME.enemy, 12);
      ctx.fillStyle = THEME.enemyBulletCore;
      ctx.strokeStyle = THEME.enemyBulletEdge;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      noGlow();
      ctx.stroke();
    }
  }

  // ---------- HPバー ----------
  function bar(x, y, w, h, ratio, lag, fill) {
    ctx.fillStyle = THEME.barInk;
    ctx.fillRect(x - w / 2 - 1.5, y - 1.5, w + 3, h + 3);
    ctx.fillStyle = THEME.barBack;
    ctx.fillRect(x - w / 2, y, w, h);
    if (lag > ratio) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - w / 2, y, w * lag, h);
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x - w / 2, y, w * ratio, h);
  }

  let playerLag = 1; // ダメージ分が少し遅れて減る白い部分（見た目だけの値）

  function drawBars(state, t) {
    for (const e of state.enemies) {
      if (e.hp >= e.maxHp || e.boss) continue; // 傷ついた敵だけ表示（ボスは画面上の専用バー）
      const w = Math.max(16, e.r * 2);
      bar(e.x, e.y - e.r - 8, w, 3, Math.max(0, e.hp / e.maxHp), 0, THEME.enemy);
    }
    // おとり：HPの減った分身の上に、分身の色でHPバー
    for (const g of allGhosts(state)) {
      if (!(g.maxHp > 0) || g.hp >= g.maxHp) continue;
      bar(g.x, g.y - g.r - 8, Math.max(16, g.r * 2), 3, Math.max(0, g.hp / g.maxHp), 0, ghostColor(g.idx));
    }
    // 盾持ち：盾が削られたら、盾の残りを体力バーの上に出す（壊れたら消える）
    for (const e of state.enemies) {
      if (e.kind !== 'shield' || !(e.shield > 0) || e.shield >= e.shieldMax) continue;
      const w = Math.max(16, e.r * 2);
      bar(e.x, e.y - e.r - (e.hp < e.maxHp ? 14 : 8), w, 3, e.shield / e.shieldMax, 0, STATUS.shield);
    }
    if (state.over) return;
    const p = state.player;
    const ratio = state.hp / state.maxHp;
    playerLag = ratio < playerLag ? Math.max(ratio, playerLag - 0.012) : ratio;
    let fill = THEME.playerGlow;
    if (ratio <= 0.3 && Math.sin(t * 16) > 0) fill = '#ffffff';          // 残りわずかは点滅
    else if (state.regenerating && Math.sin(t * 8) > 0) fill = '#fff2b0'; // 回復中はやわらかく明滅
    bar(p.x, p.y - p.r * 1.5 - 9, Math.max(34, p.r * 3.4), 4, ratio, playerLag, fill);
    // 生命の泉のシールド：HPバーのすぐ上に、白い細いバー
    if (state.lifeShield > 0) bar(p.x, p.y - p.r * 1.5 - 14, Math.max(34, p.r * 3.4), 2, Math.min(1, state.lifeShield / (state.maxHp * 0.2)), 0, '#e8f6ff');
  }

  // 演出は「光を足す」描き方にして、重なるほど明るく見せる
  function drawParticles(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const pt of state.particles) {
      if (pt.delay > 0) continue;
      const a = Math.max(0, pt.life / pt.max);
      ctx.globalAlpha = a * glowAlpha();
      const col = pt.col || particleColor(pt);
      if (pt.shape) { drawShapedParticle(pt, col, a); continue; }
      if (pt.streak) {
        ctx.strokeStyle = col;
        ctx.lineWidth = pt.size;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x - pt.vx * 0.05, pt.y - pt.vy * 0.05);
        ctx.stroke();
      } else {
        const sz = pt.size * (0.6 + 0.4 * a);
        ctx.fillStyle = col;
        if (pt.snap) ctx.fillRect(Math.round(pt.x / pt.snap) * pt.snap - sz / 2, Math.round(pt.y / pt.snap) * pt.snap - sz / 2, sz, sz);   // 分解：マス目にそろえる
        else ctx.fillRect(pt.x - sz / 2, pt.y - sz / 2, sz, sz);
      }
    }
    ctx.restore();
  }

  // はじけ方の形のついた破片（花びら・星・泡・紙・輪）
  function drawShapedParticle(pt, col, a) {
    const s = pt.size;
    if (pt.shape === 'ring') {
      ctx.strokeStyle = col; ctx.lineWidth = (pt.w || 2) * (0.4 + 0.6 * a);
      ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(0.1, s), 0, TAU); ctx.stroke();
      return;
    }
    if (pt.shape === 'bubble') {
      ctx.strokeStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, s, 0, TAU); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(pt.x - s * 0.45, pt.y - s * 0.45, s * 0.3, s * 0.3);
      return;
    }
    ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot || 0); ctx.fillStyle = col;
    if (pt.shape === 'petal') { ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, TAU); ctx.fill(); }
    else if (pt.shape === 'confetti') { ctx.scale(Math.cos((pt.rot || 0) * 2), 1); ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6); }
    else if (pt.shape === 'star') {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? s * 0.45 : s, an = (k / 10) * TAU - Math.PI / 2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawRings(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of state.rings) {
      const k = 1 - r.life / r.max;              // 0→1
      const ease = 1 - (1 - k) * (1 - k);        // はじめ速く、だんだんゆっくり
      ctx.globalAlpha = (1 - k) * glowAlpha();
      ctx.strokeStyle = particleColor(r);
      ctx.lineWidth = r.width * (1 - k * 0.6) * glowWidth();
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * ease, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of state.flashes) {
      const k = f.life / f.max;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, particleColor(f, Math.min(1, 0.9 * k * PREFS.glow)));
      g.addColorStop(1, particleColor(f, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 本体 ----------
  // 本体：金色の光の結晶（4つの角を持つ星）。分身（丸）とも敵（赤）とも形と色で見分けられる
  function starPath(cx, cy, outer, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rr = i % 2 === 0 ? outer : inner;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // 本体（見本では、状態の違う本体を並べて描けるように extraPlayers も描く）
  // 始まる前：本体のまわりに、外へ広がって消える輪が脈打つ
  function drawReadyPulse(state, t) {
    if (state.mode !== 'ready' || !state.player) return;
    const p = state.player;
    ctx.save();
    for (let k = 0; k < 2; k++) {
      const u = (t * 0.8 + k * 0.5) % 1;
      ctx.globalAlpha = (1 - u) * 0.7;
      ctx.strokeStyle = THEME.playerRing || '#ffd84a';
      ctx.lineWidth = 2.5 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 + u * 4), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPlayer(state, t) {
    drawReadyPulse(state, t);
    if (state.over) return;
    drawOnePlayer(state.player, t, true);
    for (const p of state.extraPlayers || []) drawOnePlayer(p, t, false);
  }

  // 本体：極・進化を1つでも持てば、まんなかのコアが虹色になる
  const evoOf = (l) => !!(l && l.evo && Object.keys(l.evo).length);
  function drawOnePlayer(p, t, main) {
    drawPlayerBack(p, t, main);
    if (p.inv > 0 && Math.floor(t * 14) % 2 === 0) return; // 無敵中は点滅
    // 描くモード：本体が筆先（ペン先）の形になる
    if (p.drawMode) { drawPenTip(p, t); drawPlayerExtras(p, t); return; }
    if (p.auraKw || evoOf(p.look) || evoOf(p.olook) || evoOf(p.hlook)) rainbowPaint(p, t, p.r * 8, () => drawPlayerShapes(p, t));
    else drawPlayerShapes(p, t);
    drawPlayerExtras(p, t);
  }
  // 本体の形を裏の画用紙に描き、明るさはそのままで色だけを回る虹色に置きかえて、画面へ戻す
  function rainbowPaint(p, t, R, draw) {
    const cv = mainCtx.canvas;
    for (const c of [offA, offB]) if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; }
    const m = mainCtx.getTransform();
    const cx = m.a * p.x + m.c * p.y + m.e, cy = m.b * p.x + m.d * p.y + m.f, h = R * Math.hypot(m.a, m.b);
    const x0 = Math.max(0, Math.floor(cx - h)), y0 = Math.max(0, Math.floor(cy - h));
    const w = Math.min(cv.width, Math.ceil(cx + h)) - x0, hh = Math.min(cv.height, Math.ceil(cy + h)) - y0;
    if (w <= 0 || hh <= 0) return;
    actx.setTransform(1, 0, 0, 1, 0, 0); actx.globalCompositeOperation = 'source-over'; actx.clearRect(x0, y0, w, hh);
    actx.setTransform(m);
    ctx = actx; F = offF;
    try { draw(); } finally { ctx = mainCtx; F = mainF; }
    actx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(x0, y0, w, hh); bctx.drawImage(offA, x0, y0, w, hh, x0, y0, w, hh);
    const g = actx.createConicGradient(t * 1.2, cx, cy);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60}, 100%, 55%)`);
    actx.globalCompositeOperation = 'color'; actx.fillStyle = g; actx.fillRect(x0, y0, w, hh);
    actx.globalCompositeOperation = 'destination-in'; actx.drawImage(offB, x0, y0, w, hh, x0, y0, w, hh);
    actx.globalCompositeOperation = 'source-over';
    mainCtx.save(); mainCtx.setTransform(1, 0, 0, 1, 0, 0); mainCtx.drawImage(offA, x0, y0, w, hh, x0, y0, w, hh); mainCtx.restore();
  }
  function drawPlayerBack(p, t, main) {
    // 収穫の道：吸う範囲の輪・かけら（体より奥）
    if (p.hlook) F.drawHarvest(p, p.hlook, t);
    // 本体の道：闘気の膜・鬼神・シールド・突撃の光・連打の輪（体より先に、うしろ側を描く）
    if (p.aura) drawAura(p, t);
    if (p.demon) drawDemon(p, t);
    if (p.charge != null) drawCharge(p, t);

    // かけらを吸い取る範囲（白い枠だけ）
    // 吸い寄せない（腹ペコのカース）ときは描かない（前は代わりの大きさで描いていて、吸わないのに円が見えていた）
    const reach = p.magnetR || 0;
    ctx.strokeStyle = THEME.magnetRing;
    ctx.globalAlpha = main && reach > 0 ? 0.22 : 0;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, reach, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 本体の形を持つ道（本体・衛星・収穫）。取った順に並ぶ
  function shapesOf(p) {
    const order = p.shapeOrder || ['body', 'orbit', 'harvest'];
    return order.filter((k) => (k === 'body' ? p.look && p.look.type : k === 'orbit' ? p.olook && (p.olook.type || p.olook.entry) : p.hlook && (p.hlook.type || p.hlook.entry)));
  }
  // 形が2つ以上なら、3秒ごとに次の形へ。切り替わりの0.3秒は、前の形が薄れながら次の形がふくらんで現れる
  const SHAPE_EVERY = 3, SHAPE_FADE = 0.3;
  function drawPlayerShapes(p, t) {
    const list = shapesOf(p);
    if (list.length < 2) { drawPlayerShape(p, t, list[0] || null); return; }
    const n = list.length, i = Math.floor(t / SHAPE_EVERY) % n, ph = t % SHAPE_EVERY;
    if (ph >= SHAPE_FADE) { drawPlayerShape(p, t, list[i]); return; }
    const k = ph / SHAPE_FADE;
    const one = (kind, a, sc) => {
      ctx.save(); ctx.globalAlpha *= a;
      ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.translate(-p.x, -p.y);
      drawPlayerShape(p, t, kind); ctx.restore();
    };
    one(list[(i - 1 + n) % n], 1 - k, 1 + 0.15 * k);
    one(list[i], k, 0.85 + 0.15 * k);
  }
  // 本体の形（後ろの光と体）。kind：'body'＝本体の道、'orbit'／'harvest'＝その道の型の形、null＝ふつうの星
  function drawPlayerShape(p, t, kind) {
    if (kind === 'body' && F.drawBody(p, p.look, t)) return;

    const r = p.r * 1.25;
    const rot = t * 0.8;
    // 衛星・収穫の道の型を持っていれば、黄色い体そのものがその形になる（後ろの光は共通）
    const ck = kind === 'orbit' ? F.coreKind({ olook: p.olook }) : kind === 'harvest' ? F.coreKind({ hlook: p.hlook }) : null;
    if (ck) {
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.6);
      halo.addColorStop(0, `rgba(${THEME.playerRgb}, 0.45)`);
      halo.addColorStop(1, `rgba(${THEME.playerRgb}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(p.x, p.y); F.drawCore(ck, r * 0.9, t); ctx.restore();
      return;
    }
    // 後ろの光
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.6);
    halo.addColorStop(0, `rgba(${THEME.playerRgb}, 0.45)`);
    halo.addColorStop(1, `rgba(${THEME.playerRgb}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // 外側の星（ゆっくり回る）
    glow(THEME.playerGlow, 16);
    ctx.fillStyle = THEME.playerGlow;
    starPath(p.x, p.y, r, r * 0.42, rot);
    ctx.fill();
    noGlow();
    ctx.strokeStyle = THEME.playerEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 内側の白い星（逆向きに回る）
    // 内側の白い星（逆向きに回る）
    ctx.fillStyle = THEME.playerLight;
    starPath(p.x, p.y, r * 0.5, r * 0.22, -rot * 1.6 + Math.PI / 4);
    ctx.fill();
  }

  // 描くモードの本体：ペン。傾きはいつも同じで、左右の向きだけ動いている向きに合わせる
  //   左へ動く：ペン先が左下・持ち手が右上／右へ動く：左右反対。ペン先の先端は本体の位置（軌跡の点）にぴったり合わせる
  const penFace = new WeakMap();
  function drawPenTip(p, t) {
    const r = p.r * 1.25, a = Math.PI * 0.75;
    let face = penFace.get(p) || -1;
    if (p.moving && p.dir != null && Math.abs(Math.cos(p.dir)) > 0.25) face = Math.cos(p.dir) > 0 ? 1 : -1;
    penFace.set(p, face);
    const tipX = r * 1.5;              // ペン先のいちばん前（本体の中心より少し前で、線を描く）
    const nibBack = -r * 0.2;          // ペン先と軸のつなぎ目
    const gripBack = -r * 0.75;        // にぎりの終わり
    const tail = -r * 2.6;             // 軸のいちばんうしろ
    const w = r * 0.5;                 // 軸の太さ（半分）
    ctx.save();
    ctx.translate(p.x, p.y);
    if (face > 0) ctx.scale(-1, 1);   // 右へ動いているときは左右反対
    ctx.rotate(a);
    ctx.translate(-tipX, 0);          // ペン先の先端を、本体の位置に合わせる
    // うしろの光
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
    halo.addColorStop(0, `rgba(${THEME.playerRgb}, 0.35)`);
    halo.addColorStop(1, `rgba(${THEME.playerRgb}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.lineJoin = 'round';
    // 軸（本体の色）。うしろは丸く
    glow(THEME.playerGlow, 12);
    ctx.fillStyle = THEME.playerGlow;
    ctx.beginPath();
    ctx.moveTo(gripBack, -w);
    ctx.lineTo(tail + w, -w);
    ctx.arc(tail + w, 0, w, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(gripBack, w);
    ctx.closePath();
    ctx.fill();
    noGlow();
    ctx.strokeStyle = THEME.playerEdge; ctx.lineWidth = 1.5; ctx.stroke();
    // 軸のクリップ（白い線）
    ctx.strokeStyle = THEME.playerLight; ctx.lineWidth = Math.max(1, r * 0.12); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tail + w * 1.2, -w * 0.45); ctx.lineTo(gripBack - r * 0.35, -w * 0.45); ctx.stroke();
    // にぎり（少し細い、暗い帯）
    ctx.fillStyle = THEME.playerEdge;
    ctx.beginPath();
    ctx.moveTo(gripBack, -w); ctx.lineTo(nibBack, -w * 0.8); ctx.lineTo(nibBack, w * 0.8); ctx.lineTo(gripBack, w);
    ctx.closePath(); ctx.fill();
    // ペン先（銀色）
    ctx.beginPath();
    ctx.moveTo(tipX, 0);
    ctx.quadraticCurveTo(r * 0.55, w * 0.55, nibBack, w * 0.8);
    ctx.lineTo(nibBack, -w * 0.8);
    ctx.quadraticCurveTo(r * 0.55, -w * 0.55, tipX, 0);
    ctx.closePath();
    ctx.fillStyle = '#dfe8f5'; ctx.fill();
    ctx.strokeStyle = '#5a6478'; ctx.lineWidth = 1.2; ctx.stroke();
    // ペン先の切り込みと穴
    ctx.strokeStyle = '#5a6478'; ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath(); ctx.moveTo(tipX * 0.95, 0); ctx.lineTo(r * 0.3, 0); ctx.stroke();
    ctx.fillStyle = '#5a6478';
    ctx.beginPath(); ctx.arc(r * 0.22, 0, r * 0.11, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // 体の上に重ねるもの（シールド・連打の輪・収穫の道・衛星の道）
  function drawPlayerExtras(p, t) {
    if (p.shield) drawShieldBubble(p, t);
    else if (p.shieldCd > 0) drawShieldWait(p);
    if (p.rush > 0) drawRush(p, t);
    if (p.hlook) F.drawHarvestOnBody(p, p.hlook, t);
    // ゲーム中は、実際に当たる玉（p.orbs）を描く。見本画面では形の見本（drawOrbit）
    if (p.orbs) drawOrbs(p, t);
    else if (p.olook) F.drawOrbit(p, p.olook, t);
  }
  // 衛星の道：回る玉（大衛星は帯の流れる大きな玉、流星で飛んでいる玉は尾を引く）
  function drawOrbs(p, t) {
    ctx.save();
    ctx.strokeStyle = 'rgba(191,230,255,0.22)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    const rings = [...new Set(p.orbs.map((o) => Math.round(o.R)))];
    for (const R of rings) { ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const o of p.orbs) {
      if (o.flying) {
        const g = ctx.createLinearGradient(o.x, o.y, p.x, p.y);
        g.addColorStop(0, 'rgba(191,230,255,0.7)'); g.addColorStop(1, 'rgba(191,230,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = o.r * 1.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + (p.x - o.x) * 0.4, o.y + (p.y - o.y) * 0.4); ctx.stroke();
      }
      glow('#bfe6ff', 10); ctx.fillStyle = '#bfe6ff'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); noGlow();
      ctx.strokeStyle = '#3b7fc4'; ctx.lineWidth = 1; ctx.stroke();
      if (o.big) {
        ctx.save(); ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = 'rgba(59,127,196,0.7)'; ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) { const off = ((t * 1.2 + k / 3) % 1) * 2 - 1; ctx.beginPath(); ctx.moveTo(o.x + off * o.r * 1.4 - o.r, o.y - o.r); ctx.lineTo(o.x + off * o.r * 1.4 + o.r * 0.2, o.y + o.r); ctx.stroke(); }
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // 刃輪：分身のまわりを回る三日月の刃（研磨で強くなるほど白く光る）
  function drawGhostBlades(state, t) {
    for (const g of state.ghosts) {
      if (!g.blades) continue;
      const hot = Math.min(1, (g.whet || 0));
      for (const b of g.blades) {
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a + t * 10);
        const s = b.r;
        glow(hot > 0.3 ? '#ffffff' : '#e8ecff', 6 + hot * 10);
        ctx.fillStyle = hot > 0.5 ? '#ffffff' : '#e8ecff'; ctx.strokeStyle = ghostColor(g.idx, 1); ctx.lineWidth = 1;
        for (let k = 0; k < 2; k++) {
          ctx.rotate(Math.PI);
          ctx.beginPath(); ctx.moveTo(-s, s * 0.25); ctx.quadraticCurveTo(0, -s * 1.3, s, s * 0.25); ctx.quadraticCurveTo(0, -s * 0.35, -s, s * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        noGlow(); ctx.restore();
      }
    }
  }
  // 盾衛星の型：回る盾（ふちが光る板）と、聖域の光の輪
  function drawPlate(pl) {
    ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(pl.a);
    const s = pl.r;
    glow('#cfe0ff', 8); ctx.fillStyle = 'rgba(207,224,255,0.85)'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-s * 0.35, -s); ctx.quadraticCurveTo(s * 0.45, 0, -s * 0.35, s); ctx.lineTo(-s * 0.85, s * 0.8); ctx.quadraticCurveTo(-s * 0.2, 0, -s * 0.85, -s * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke(); noGlow();
    ctx.restore();
  }
  function drawShieldSats(state, t) {
    const p = state.player;
    if (p && p.sanctuary) {
      ctx.save();
      const g = ctx.createRadialGradient(p.x, p.y, p.sanctuary * 0.6, p.x, p.y, p.sanctuary);
      g.addColorStop(0, 'rgba(255, 250, 225, 0)'); g.addColorStop(1, 'rgba(255, 250, 225, 0.16)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.sanctuary, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 250, 225, 0.55)'; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sanctuary, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    if (p && p.plates) for (const pl of p.plates) drawPlate(pl);
    for (const g of state.ghosts) if (g.plates) for (const pl of g.plates) drawPlate(pl);
  }
  // 子機の型：子機（小さな三角の船）と、本体の上の母艦
  function drawDrones(state, t) {
    const p = state.player;
    if (state.mother && p) {
      const x = p.x, y = p.y - 40 - Math.sin(t * 2) * 2;
      ctx.save(); ctx.translate(x, y);
      glow('#9fd4ff', 10); ctx.fillStyle = '#cfe0ff'; ctx.strokeStyle = '#3b7fc4'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-22, 2); ctx.lineTo(-14, -6); ctx.lineTo(14, -6); ctx.lineTo(22, 2); ctx.lineTo(12, 7); ctx.lineTo(-12, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); noGlow();
      ctx.fillStyle = '#3b7fc4'; for (let i = -2; i <= 2; i++) { ctx.fillRect(i * 6 - 1.5, -2, 3, 3); }
      ctx.fillStyle = (Math.floor(t * 3) % 2) ? '#ffffff' : '#9fd4ff'; ctx.beginPath(); ctx.arc(0, 7, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    for (const d of state.drones || []) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a || 0);
      const s = d.r || 5, fade = d.temp != null && d.temp < 1 ? d.temp : 1;
      ctx.globalAlpha = fade;
      glow('#9fd4ff', 8); ctx.fillStyle = d.role === 'collect' ? '#ffd84a' : '#9fd4ff'; ctx.strokeStyle = '#3b7fc4'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s * 1.4, 0); ctx.lineTo(-s, s * 0.9); ctx.lineTo(-s * 0.5, 0); ctx.lineTo(-s, -s * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke(); noGlow();
      // 噴射の光
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-s * 0.8, 0, s * 0.3 + Math.random() * s * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  // 星の雨：落ちてくる星（上から光の筋）と、落ちた場所の目印。黄金の雨も同じ形で金色
  function drawStars(state, t) {
    for (const d of state.goldDrops || []) {
      if (d.t < 0 || d.done) continue;
      const k = Math.min(1, d.t / d.max), y = d.y - 220 * (1 - k);
      ctx.save(); glow('#ffd84a', 12); ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(d.x, y - 40); ctx.lineTo(d.x, y); ctx.stroke(); noGlow();
      ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.moveTo(d.x, y - 5); ctx.lineTo(d.x + 4, y); ctx.lineTo(d.x, y + 5); ctx.lineTo(d.x - 4, y); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    for (const st of state.stars || []) {
      if (st.t < 0) continue;
      const k = Math.min(1, st.t / st.max);
      ctx.save();
      if (!st.done) {
        ctx.strokeStyle = 'rgba(191,230,255,0.4)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(st.x, st.y, 10 * (1 - k) + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        const y = st.y - 220 * (1 - k);
        glow('#ffffff', 12); ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(st.x - 10, y - 40); ctx.lineTo(st.x, y); ctx.stroke(); noGlow();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(st.x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---------- 本体の道の見た目 ----------
  //   色は本体の金色を基本に、鬼神だけ赤みを足す
  const BODY = { get aura() { return THEME.playerRgb; }, charge: '#fff6c8', shield: '#bfe6ff', shieldEdge: '#5aa9e6', rush: '#ffb347', demon: '255, 90, 60' };

  // 闘気：本体のまわりの光の膜（ゆっくり脈打つ）
  function drawAura(p, t) {
    const R = p.aura * (1 + 0.04 * Math.sin(t * 5));
    ctx.save();
    const g = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, R);
    g.addColorStop(0, `rgba(${BODY.aura}, 0.05)`);
    g.addColorStop(0.8, `rgba(${BODY.aura}, 0.16)`);
    g.addColorStop(1, `rgba(${BODY.aura}, 0.3)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
    glow(`rgb(${BODY.aura})`, 10);
    ctx.strokeStyle = `rgba(${BODY.aura}, 0.75)`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    noGlow();
    // 極闘気：膜の外へ、はじき飛ばす波が出続ける（白い芯の輪）
    if (p.auraKw) {
            const ph = (t * 1.2) % 1;
      ctx.globalAlpha = 1 - ph;
      glow('#ffffff', 8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * (1 + ph * 0.45), 0, Math.PI * 2); ctx.stroke();
      noGlow();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // 突撃：動いている向きの前側が光る
  function drawCharge(p, t) {
    const R = (p.aura || p.r * 1.6) + 4;
    ctx.save();
    // 前側を扇形にうすく光らせ、そのふちを太い弧で強調する
    const fan = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, R + 10);
    fan.addColorStop(0, 'rgba(255, 246, 200, 0)');
    fan.addColorStop(1, 'rgba(255, 246, 200, 0.45)');
    ctx.fillStyle = fan;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, R + 10, p.charge - 0.8, p.charge + 0.8); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'round';
    glow(BODY.charge, 14);
    ctx.strokeStyle = BODY.charge;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, p.charge - 0.75, p.charge + 0.75); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(p.x, p.y, R + 5, p.charge - 0.45, p.charge + 0.45); ctx.stroke();
    noGlow();
    ctx.restore();
  }

  // シールド：本体を包む青白い泡（六角形のふち）
  function drawShieldBubble(p, t) {
    const R = p.aura ? p.aura * 1.18 + 2 : p.r * 1.6 + 2;   // 闘気の膜の外側を囲む
    ctx.save();
    ctx.fillStyle = 'rgba(191, 230, 255, 0.12)';
    ctx.strokeStyle = BODY.shield;
    ctx.lineWidth = 2;
    glow(BODY.shieldEdge, 10);
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = t * 0.5 + (k * Math.PI) / 3;
      const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    noGlow();
    ctx.restore();
  }

  // シールドが戻るまで：うすい輪が、戻るにつれて満ちていく
  function drawShieldWait(p) {
    const R = (p.aura || p.r * 1.6) + 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(191, 230, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.shieldCd)); ctx.stroke();
    ctx.restore();
  }

  // 連打：続けてぶつかるほど、本体のまわりの橙の輪が満ちる（上限で光る）
  function drawRush(p, t) {
    const R = (p.aura || p.r * 1.6) + 9;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = THEME.barInk;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = BODY.rush;
    ctx.lineWidth = 2;
    if (p.rush >= 1) glow(BODY.rush, 10 + 4 * Math.sin(t * 10));
    ctx.beginPath(); ctx.arc(p.x, p.y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, p.rush)); ctx.stroke();
    noGlow();
    ctx.restore();
  }

  // 鬼神：赤く燃える大きな光と、外へ伸びるとげ
  function drawDemon(p, t) {
    const R = (p.aura || p.r * 1.6) * 1.9;
    ctx.save();
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    g.addColorStop(0, `rgba(${BODY.demon}, 0.7)`);
    g.addColorStop(0.55, `rgba(${BODY.demon}, 0.35)`);
    g.addColorStop(1, `rgba(${BODY.demon}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${BODY.demon}, 0.85)`;
    glow(`rgb(${BODY.demon})`, 12);
    for (let k = 0; k < 10; k++) {
      const a = t * 2 + (k * Math.PI * 2) / 10;
      const len = R * (0.85 + 0.15 * Math.sin(t * 9 + k));
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a - 0.2) * p.r * 1.3, p.y + Math.sin(a - 0.2) * p.r * 1.3);
      ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
      ctx.lineTo(p.x + Math.cos(a + 0.2) * p.r * 1.3, p.y + Math.sin(a + 0.2) * p.r * 1.3);
      ctx.fill();
    }
    noGlow();
    ctx.restore();
  }

  // ---------- ボスの登場と撃破（短く控えめ） ----------
  //   登場：state.bossIntro = { t: 0〜1（進み具合）, name }。上下に警告の帯が流れ、名前が中央に出て消える
  //   撃破：state.bossDown = { t: 0〜1, x, y }。はじける輪と、うっすら白い光
  function drawBossDownWorld(state) {
    const D = state.bossDown;
    if (!D) return;
    const k = D.t, e = 1 - (1 - k) ** 3;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let n = 0; n < 2; n++) {
      const kk = Math.max(0, e - n * 0.18);
      if (kk <= 0) continue;
      ctx.globalAlpha = (1 - kk) * (n ? 0.5 : 0.9);
      ctx.strokeStyle = n ? THEME.enemyLight : '#fff';
      ctx.lineWidth = (n ? 3 : 6) * (1 - kk) + 1;
      ctx.beginPath(); ctx.arc(D.x, D.y, 20 + kk * (n ? 150 : 110), 0, TAU); ctx.stroke();
    }
    // 破片：決まった向きに飛び散る（見本でも毎回同じ形になるように、乱数は使わない）
    ctx.fillStyle = THEME.enemy;
    for (let n = 0; n < 14; n++) {
      const a = n * 2.399, d = 18 + e * (70 + (n % 4) * 22), r = 4 * (1 - k) + 0.5;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath(); ctx.arc(D.x + Math.cos(a) * d, D.y + Math.sin(a) * d, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawBossFx(state, t) {
    const W = canvas.width, H = canvas.height, u = W / 360;
    const D = state.bossDown;
    if (D) {
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.28 * Math.max(0, 1 - D.t * 2.2) ** 2;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    const B = state.bossIntro;
    if (!B) return;
    const k = B.t;
    const a = Math.min(1, k / 0.1, (1 - k) / 0.18);
    if (a <= 0) return;
    ctx.save();
    // 上下の警告の帯：斜めのしま模様と「WARNING」の文字が流れる
    const bh = 22 * u, shift = (t * 60 * u) % (24 * u);
    for (const [y0, dir] of [[H * 0.16, 1], [H * 0.84 - bh, -1]]) {
      const slide = (1 - Math.min(1, k / 0.12)) * W * dir;
      ctx.save();
      ctx.translate(slide, 0);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = 'rgba(120,10,30,0.75)';
      ctx.fillRect(0, y0, W, bh);
      ctx.beginPath(); ctx.rect(0, y0, W, bh); ctx.clip();
      ctx.strokeStyle = 'rgba(255,70,100,0.35)'; ctx.lineWidth = 6 * u;
      for (let x = -bh + shift * dir; x < W + bh; x += 24 * u) { ctx.beginPath(); ctx.moveTo(x, y0 + bh); ctx.lineTo(x + bh, y0); ctx.stroke(); }
      ctx.fillStyle = '#ffd6de';
      ctx.font = `${Math.round(9 * u)}px "Press Start 2P", monospace`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const step = 110 * u, off = ((t * 50 * u * dir) % step + step) % step;
      for (let x = -step + off; x < W; x += step) ctx.fillText('WARNING', x, y0 + bh / 2 + u);
      ctx.restore();
      ctx.globalAlpha = a; ctx.fillStyle = '#ff3b5c';
      ctx.fillRect(slide, y0 - u, W, u); ctx.fillRect(slide, y0 + bh, W, u);
    }
    // 名前：少し大きい所から縮んで止まり、最後にふっと消える
    const nk = Math.min(1, Math.max(0, (k - 0.12) / 0.2));
    if (nk > 0) {
      const sc = 1 + (1 - nk) * 0.35;
      ctx.globalAlpha = a * nk;
      ctx.translate(W / 2, H * 0.44);
      ctx.scale(sc, sc);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ff8fa3';
      ctx.font = `${Math.round(8 * u)}px "Press Start 2P", monospace`;
      ctx.fillText('BOSS', 0, -24 * u);
      ctx.shadowColor = 'rgba(255,40,80,0.9)'; ctx.shadowBlur = 16 * u * PREFS.glow;
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.round(30 * u)}px "DotGothic16", sans-serif`;
      ctx.fillText(B.name, 0, 4 * u);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff3b5c';
      const lw = 70 * u * nk;
      ctx.fillRect(-lw, 24 * u, lw * 2, Math.max(1, 1.5 * u));
    }
    ctx.restore();
  }

  // 描くモード：画面のふちに水色の枠線（ゆっくり息をするように明るさが揺れる）
  function drawDrawEdge(state, t) {
    const k = state.drawEdge || 0;
    if (k <= 0) return;
    const W = canvas.width, H = canvas.height, lw = Math.max(3, Math.round(Math.min(W, H) * 0.012));
    ctx.save();
    ctx.globalAlpha = k * (0.75 + 0.25 * Math.sin(t * 2.4));
    ctx.strokeStyle = '#7fe3ff';
    ctx.lineWidth = lw;
    ctx.strokeRect(lw / 2, lw / 2, W - lw, H - lw);
    ctx.restore();
  }
  function drawHurt(state) {
    if (state.hurtFlash <= 0) return;
    const W = canvas.width, H = canvas.height;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.7);
    g.addColorStop(0, 'rgba(255,40,70,0)');
    g.addColorStop(1, THEME.hurt);
    ctx.globalAlpha = state.hurtFlash;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // 見本画面だけで使う名札（state.labels があるときだけ描く）
  function drawLabels(state) {
    if (!state.labels) return;
    ctx.save();
    ctx.font = '9px "DotGothic16", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    for (const l of state.labels) {
      // 印（見本で、直してほしいものとして選ばれた）：名前と、その上の絵を赤い点線で囲む
      if (l.marked) {
        const w = Math.max(54, ctx.measureText(l.text).width + 12);
        ctx.save();
        ctx.strokeStyle = '#ff4d66'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
        ctx.fillStyle = 'rgba(255, 77, 102, 0.12)';
        ctx.beginPath(); ctx.roundRect(l.x - w / 2, l.y - 50, w, 64, 6); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = THEME.barInk;
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillStyle = l.marked ? '#ffd0d8' : '#f3f5ff';
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.restore();
  }

  // 一斉射撃の待ち時間：本体の下に小さな弧。たまると光る
  function drawVolleyGauge(state, t) {
    if (!state.skills || !state.skills.volley || state.over || !state.player) return;
    const p = state.player, wait = state.volleyWait || 1;
    const k = state.volleyCd > 0 ? 1 - state.volleyCd / wait : 1;
    const R = p.r + 9;   // 本体の真下の、4分の1の弧
    ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath(); ctx.arc(p.x, p.y, R, Math.PI * 0.75, Math.PI * 0.25, true); ctx.stroke();
    if (k >= 1) { glow(ghostColor(1), 8 + 4 * Math.sin(t * 6)); ctx.strokeStyle = ghostColor(1); }
    else ctx.strokeStyle = ghostColor(1, 0.6);
    ctx.beginPath(); ctx.arc(p.x, p.y, R, Math.PI * 0.75, Math.PI * 0.75 - Math.PI * 0.5 * k, true); ctx.stroke();
    noGlow(); ctx.restore();
  }

  function draw(state, t) {
    {
      const busy = state.enemies.length + (state.shots ? state.shots.length : 0) * 0.5 + (state.ghosts ? state.ghosts.length : 0) * 3 + (state.enemyShots ? state.enemyShots.length : 0) * 0.5;
      lod = busy > 160 ? 0 : busy > 90 ? 0.5 : 1;
    }
    tickRainbow(t);   // 虹のセット：本体とかけらの色を回す
    adaptQuality(t - lastT);
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    worldW = state.world.w;
    worldH = state.world.h;
    // 広がるときはなめらかに引き、やり直しで狭くなるときはすぐ合わせる
    if (worldW < viewW) viewW = worldW;
    else viewW += (worldW - viewW) * Math.min(1, dt * 3);
    if (Math.abs(worldW - viewW) < 0.05) viewW = worldW;

    const k = canvas.width / viewW;
    const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake * PREFS.shake : 0;
    const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake * PREFS.shake : 0;
    const ox = canvas.width / 2 - (worldW / 2) * k + sx * k;
    const oy = canvas.height / 2 - (worldH / 2) * k + sy * k;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(k, 0, 0, k, ox, oy);
    drawBackground(state, t);
    drawGhostPaths(state);
    drawRecordPath(state, t);
    drawTraps(state, t);
    drawIce(state, t);
    drawFog(state, t);
    drawReaper(state, t);
    drawStars(state, t);
    drawGhostBlades(state, t);
    drawDrones(state, t);
    drawShieldSats(state, t);
    drawGravity(state, t);
    drawFires(state, t);
    drawPickups(state, t);
    drawShots(state);
    drawBossLinks(state, t);
    drawWarns(state, t);
    drawEnemies(state, t);
    drawGhosts(state, t);
    drawLasers(state);
    drawEnemyShots(state, t);
    drawPillars(state, t);
    drawThunder(state, t);
    drawDashCuts(state, t);
    drawRings(state);
    drawParticles(state);
    drawDamageNums(state);
    drawFloats(state);
    drawBossDownWorld(state);
    drawTimeStop(state, t);
    drawPlayer(state, t);
    drawVolleyGauge(state, t);
    drawBars(state, t);
    for (const c of state.trapCells || []) { ctx.save(); ctx.translate(c.x, c.y); F.drawTrapCell(c.look, t, c.w); ctx.restore(); }   // 罠の形の見本
    drawLabels(state);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!state.noVignette) drawVignette();   // アイコン用の絵では、ふちを暗くしない
    drawDrawEdge(state, t);
    drawHurt(state);
    drawBossFx(state, t);
  }

  return { resize, draw, pxToWorld, clientToWorld };
}
