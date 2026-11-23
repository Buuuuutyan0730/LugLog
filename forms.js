// スキルで変わる「形」の描き方（本体・罠・現象・衛星・収穫の道）。分身の道の形は render.js の drawGhostBody。
//   どの道が何の形を変えるか
//     本体の道 … 本体の体そのもの
//     罠の道   … 軌跡の上に置かれる罠
//     現象の道 … 分身がまとうもの（分身の体の上に重ねる。分身の道の形とは別の層）
//     衛星の道 … 本体のまわりを回るもの
//     収穫の道 … かけらと、本体のかけらを吸う範囲
//   決まり：目覚め（型）で土台が変わる／分岐・両立・奥義は体そのもの（ふち・中身・動き）を変える／
//           極は一回り大きくなり白く光る芯が入る／目覚めの進化は金のふち
//   どの関数も、呼ぶ側が ctx.translate で中心に動かしてから呼ぶ

import { THEME, PREFS } from './theme.js?v=20261123154100';

export function makeForms(ctx) {
  const glow = (c, b) => { ctx.shadowColor = c; ctx.shadowBlur = b * PREFS.glow; };
  const noGlow = () => { ctx.shadowBlur = 0; };
  const GOLD = '#ffd84a';
  const WHITE = '#ffffff';
  const INK = THEME.barInk;
  const TAU = Math.PI * 2;
  const has = (look, id) => !!(look && look.parts && look.parts[id]);
  const kw = (look, id) => !!(look && look.evo && look.evo[id]);
  const core = (draw, w) => { ctx.save(); glow(WHITE, 8); ctx.strokeStyle = WHITE; ctx.lineWidth = w; draw(); ctx.restore(); };
  // 極・進化の印：ゆっくり回る虹色の輪（極を1つでも持てば付く）
  let now = 0;
  const rainbowStroke = (R) => { const g = ctx.createConicGradient(now * 0.8, 0, 0); for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60}, 95%, 65%)`); return g; };
  const goldRim = (R) => { ctx.save(); glow('#ffffff', 10); ctx.strokeStyle = rainbowStroke(R); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); ctx.restore(); };
  const anyEvo = () => false;   // 極の印は本体のコア（render.js）で示すので、ここでは輪を描かない
  const zig = (x1, y1, x2, y2, n, amp, seed) => {
    ctx.beginPath(); ctx.moveTo(x1, y1);
    for (let i = 1; i < n; i++) {
      const k = i / n, nx = -(y2 - y1), ny = x2 - x1, L = Math.hypot(nx, ny) || 1;
      const o = (((i * 7 + seed) % 5) / 4 - 0.5) * 2 * amp;
      ctx.lineTo(x1 + (x2 - x1) * k + (nx / L) * o, y1 + (y2 - y1) * k + (ny / L) * o);
    }
    ctx.lineTo(x2, y2); ctx.stroke();
  };
  const flick = (t, k = 0) => Math.floor(t * 12 + k) % 3;   // 雷のちらつき用（0〜2）

  // ============================================================
  // 現象の道：分身がまとうもの（分身の中心が原点。r＝分身の半径）
  //   back：分身の体より奥に描く／front：体の上に描く
  // ============================================================
  const PH = { thunder: '#ffe94a', ice: '#9fe8ff', iceDeep: '#1f6f99', grav: '#b9a6ff', poison: '#b45cff', poisonDeep: '#45137a', reaper: '#7a6cff' };

  function phenomBack(r, look, t) {
    const e = look.elem;
    if (e === 'freeze') {
      // 冷気：まわりに白い霧と雪の粒
      if (has(look, 'chill')) {
        const R = r * (kw(look, 'chill') ? 2.1 : 1.8);
        const g = ctx.createRadialGradient(0, 0, r, 0, 0, R);
        g.addColorStop(0, 'rgba(159,232,255,0.35)'); g.addColorStop(1, 'rgba(159,232,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
        ctx.fillStyle = WHITE;
        for (let i = 0; i < 8; i++) { const a = t * 0.6 + i * 0.8, d = r * (1.2 + ((i * 3) % 5) * 0.12); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1, 0, TAU); ctx.fill(); }
      }
      // 霜の道：うしろの通り道に霜の点
      if (has(look, 'frostpath')) {
        ctx.fillStyle = PH.ice;
        for (let i = 1; i <= 5; i++) { const x = -r * 0.9 * i * 0.55 - r * 0.5, y = r * 0.55 * i * 0.3; ctx.globalAlpha *= 1; ctx.beginPath(); ctx.moveTo(x, y - 2.5); ctx.lineTo(x + 2, y); ctx.lineTo(x, y + 2.5); ctx.lineTo(x - 2, y); ctx.fill(); }
      }
      // 氷結：体のふちから氷の結晶が6本のびる
      const L = r * (kw(look, 'freeze') ? 0.75 : 0.5);
      ctx.fillStyle = PH.ice; ctx.strokeStyle = PH.iceDeep; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + Math.PI / 6;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(r * 0.85, -r * 0.16); ctx.lineTo(r + L, 0); ctx.lineTo(r * 0.85, r * 0.16); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (kw(look, 'freeze')) core(() => { ctx.beginPath(); ctx.moveTo(r * 0.9, 0); ctx.lineTo(r + L * 0.85, 0); ctx.stroke(); }, 1);
        ctx.restore();
      }
    }
    if (e === 'poison') {
      // 毒霧：まわりの紫の霧
      if (has(look, 'miasma')) {
        for (let i = 0; i < 5; i++) {
          const a = t * 0.4 + i * 1.3, d = r * 1.05;
          const g = ctx.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, r * 0.9);
          g.addColorStop(0, 'rgba(200,120,255,0.7)'); g.addColorStop(1, 'rgba(180,92,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 1.0, 0, TAU); ctx.fill();
        }
      }
      // パンデミック：とげのある胞子がまわりを回る
      if (has(look, 'pandemic')) {
        for (let i = 0; i < 4; i++) {
          const a = t * 0.9 + (i * TAU) / 4, d = r * 1.55, x = Math.cos(a) * d, y = Math.sin(a) * d, s = r * 0.22;
          ctx.fillStyle = PH.poison; ctx.strokeStyle = PH.poisonDeep; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = PH.poison;
          for (let k = 0; k < 6; k++) { const b = (k * TAU) / 6; ctx.beginPath(); ctx.moveTo(x + Math.cos(b) * s, y + Math.sin(b) * s); ctx.lineTo(x + Math.cos(b) * s * 1.7, y + Math.sin(b) * s * 1.7); ctx.stroke(); }
        }
      }
    }
    if (e === 'reaper') {
      // 死神：体全体を、黒いもやがぐるりと包み、ゆらめく（冥府：青白い炎）。処刑ではもやが鋭い刃になる
      const evo = kw(look, 'reaper');
      const blade = has(look, 'execute');
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n + t * 0.4, h = r * (0.45 + 0.2 * Math.sin(t * 5 + i * 1.9)) * (blade ? 1.35 : 1);
        const sw = Math.sin(t * 3 + i) * 0.25;   // もやの先が、横にゆれる
        ctx.fillStyle = evo ? 'rgba(150,210,255,0.8)' : 'rgba(60,30,110,0.95)';
        ctx.strokeStyle = blade ? '#e8ecff' : evo ? '#e8f6ff' : '#8a7cff'; ctx.lineWidth = blade ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a - 0.22) * r * 0.92, Math.sin(a - 0.22) * r * 0.92);
        if (blade) ctx.lineTo(Math.cos(a + sw * 0.4) * (r + h), Math.sin(a + sw * 0.4) * (r + h));
        else ctx.quadraticCurveTo(Math.cos(a + sw) * (r + h * 0.7), Math.sin(a + sw) * (r + h * 0.7), Math.cos(a + sw * 1.5) * (r + h), Math.sin(a + sw * 1.5) * (r + h));
        ctx.lineTo(Math.cos(a + 0.22) * r * 0.92, Math.sin(a + 0.22) * r * 0.92);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (blade && kw(look, 'execute')) core(() => { ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a + sw * 0.4) * (r + h * 0.85), Math.sin(a + sw * 0.4) * (r + h * 0.85)); ctx.stroke(); }, 1);
      }
      // 魂の収穫：青白い魂が、うずを巻きながら吸い込まれてくる（尾を引く）
      if (has(look, 'soulreap')) {
        const n2 = kw(look, 'soulreap') ? 4 : 3;
        for (let i = 0; i < n2; i++) {
          const ph = (t * 0.6 + i / n2) % 1, a = i * (TAU / n2) + ph * 2.5, d = r * (2.4 - ph * 1.5);
          ctx.strokeStyle = `rgba(190,230,255,${0.6 * (1 - ph * 0.5)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, d, a - 0.6, a); ctx.stroke();
          ctx.fillStyle = `rgba(220,240,255,${1 - ph * 0.4})`; glow('#bfe6ff', 8);
          ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.17, 0, TAU); ctx.fill(); noGlow();
        }
      }
      // 大鎌：体のまわりを、大きな三日月の刃がぐるりと薙ぎ払う
      if (has(look, 'scythe')) {
        const a = t * 2.4;
        ctx.save(); ctx.rotate(a);
        ctx.fillStyle = evo ? '#e8f6ff' : '#d8dcff'; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0.1, 1.2); ctx.arc(r * 0.35, -r * 0.05, r * 1.6, 1.15, 0.15, true); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }
    if (e === 'pull') {
      // 斥力：外へ押し出す輪（点線）
      if (has(look, 'repel')) {
        ctx.strokeStyle = PH.grav; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
        for (let i = 0; i < 2; i++) { const ph = (t * 0.9 + i / 2) % 1; ctx.globalAlpha *= 1; ctx.save(); ctx.globalAlpha *= 1 - ph; ctx.beginPath(); ctx.arc(0, 0, r * (1.1 + ph * 0.9), 0, TAU); ctx.stroke(); ctx.restore(); }
        ctx.setLineDash([]);
      }
      // 圧縮：外から内へ縮む輪
      if (has(look, 'compress')) {
        ctx.strokeStyle = PH.grav; ctx.lineWidth = 1.4;
        for (let i = 0; i < 2; i++) { const ph = (t * 0.9 + i / 2) % 1; ctx.save(); ctx.globalAlpha *= ph; ctx.beginPath(); ctx.arc(0, 0, r * (2 - ph * 0.9), 0, TAU); ctx.stroke(); ctx.restore(); }
      }
      // 重力弾：黒い小さな玉がまわりを回る
      if (has(look, 'gravshot')) {
        for (let i = 0; i < 3; i++) {
          const a = -t * 1.6 + (i * TAU) / 3, d = r * 1.5;
          ctx.fillStyle = '#05030c'; ctx.strokeStyle = PH.grav; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.24, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
    }
    if (e === 'thunder') {
      // 落雷：上から分身へ稲妻が落ちる
      if (has(look, 'strike')) {
        // 1秒ごとに、上から稲妻が落ちる（落ちた瞬間だけ光り、分身のまわりが白く光る）
        const ph = t % 1;
        if (ph < 0.18) {
          const k = 1 - ph / 0.18;
          ctx.save(); ctx.globalAlpha *= k;
          ctx.strokeStyle = PH.thunder; glow(PH.thunder, 14); ctx.lineWidth = kw(look, 'strike') ? 3.4 : 2.4;
          zig(r * 0.25, -r * 3.4, 0, -r * 0.9, 6, r * 0.4, Math.floor(t));
          if (kw(look, 'strike')) core(() => zig(r * 0.25, -r * 3.4, 0, -r * 0.9, 6, r * 0.4, Math.floor(t)), 1.2);
          ctx.fillStyle = 'rgba(255,250,200,0.5)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
          noGlow(); ctx.restore();
        }
      }
      // 連鎖雷：稲妻が外へ、点から点へと跳ねる
      if (has(look, 'chainbolt')) {
        ctx.strokeStyle = PH.thunder; glow(PH.thunder, 8); ctx.lineWidth = 1.5;
        const hops = kw(look, 'chainbolt') ? 3 : 2;
        for (const dir of [-0.25, Math.PI / 2 - 0.25, Math.PI - 0.25, -Math.PI / 2 - 0.25]) {   // 上下左右へ
          let x = Math.cos(dir) * r, y = Math.sin(dir) * r;
          for (let h = 1; h <= hops; h++) {
            const nx = Math.cos(dir + h * 0.25) * r * (1 + h * 0.45), ny = Math.sin(dir + h * 0.25) * r * (1 + h * 0.45);
            zig(x, y, nx, ny, 3, r * 0.12, flick(t, h));
            ctx.fillStyle = PH.thunder; ctx.beginPath(); ctx.arc(nx, ny, 1.6, 0, TAU); ctx.fill();
            x = nx; y = ny;
          }
        }
        noGlow();
      }
      // 天雷：分身のまわりを稲妻の輪がまわる
      if (has(look, 'skybolt')) {
        ctx.strokeStyle = PH.thunder; glow(PH.thunder, 10); ctx.lineWidth = 1.6;
        const n = 10, R = r * 1.6;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const a = t * 1.2 + (i * TAU) / n, rr = R + (i % 2 ? 3 : -3); if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.stroke(); noGlow();
      }
    }
  }

  function phenomFront(r, look, t, outlinePath) {
    const e = look.elem;
    if (e === 'thunder') {
      // 雷：体のふちを、稲妻が走る（雷網：ふち全体が稲妻の網になる）
      const evo = kw(look, 'thunder');
      ctx.strokeStyle = PH.thunder; glow(PH.thunder, 10); ctx.lineWidth = 1.6;
      const n = evo ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const a = (i * TAU) / n + flick(t, i) * 0.5;
        zig(Math.cos(a - 0.5) * r, Math.sin(a - 0.5) * r, Math.cos(a + 0.5) * r, Math.sin(a + 0.5) * r, 4, r * 0.18, i + flick(t));
      }
      if (evo) { ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; zig(0, 0, Math.cos(a) * r, Math.sin(a) * r, 3, r * 0.1, i); } }
      noGlow();
      // 帯電：体の中に、黄色い火花の粒がちらつく
      if (has(look, 'charged')) {
        ctx.fillStyle = PH.thunder;
        for (let i = 0; i < (kw(look, 'charged') ? 9 : 6); i++) { const a = i * 2.4 + flick(t, i), d = r * 0.3 + ((i * 5) % 7) / 7 * r * 0.55; ctx.fillRect(Math.cos(a) * d - 1, Math.sin(a) * d - 1, 2, 2); }
      }
      // 中心は白い光
      ctx.fillStyle = WHITE; glow(PH.thunder, 10); ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, TAU); ctx.fill(); noGlow();
    }
    if (e === 'freeze') {
      // 体の中が、うすい氷の色になる
      ctx.save(); outlinePath(); ctx.clip();
      ctx.fillStyle = 'rgba(159,232,255,0.35)'; ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.2, -r * 0.6); ctx.moveTo(-r * 0.2, r * 0.1); ctx.lineTo(r * 0.3, -r * 0.4); ctx.stroke();
      ctx.restore();
      // 中心は雪の結晶（絶対零度：白く光る）
      const evo = kw(look, 'freeze');
      ctx.strokeStyle = evo ? WHITE : '#e8fbff'; if (evo) glow(WHITE, 8); ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42); ctx.lineTo(-Math.cos(a) * r * 0.42, -Math.sin(a) * r * 0.42); ctx.stroke(); }
      noGlow();
      // 砕氷：氷のかけらが外へ飛び散る
      if (has(look, 'shatter')) {
        ctx.fillStyle = PH.ice; ctx.strokeStyle = PH.iceDeep; ctx.lineWidth = 0.8;
        const n = kw(look, 'shatter') ? 6 : 4;
        for (let i = 0; i < n; i++) {
          const ph = (t * 0.8 + i / n) % 1, a = i * 1.7 + 0.3, d = r * (1.1 + ph * 0.9), s = r * 0.18 * (1 - ph * 0.4);
          const x = Math.cos(a) * d, y = Math.sin(a) * d;
          ctx.save(); ctx.globalAlpha *= 1 - ph * 0.7;
          ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.8, y + s * 0.6); ctx.lineTo(x - s * 0.8, y + s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }
      // 氷河期：分身ごと、六角形の氷の塊に閉じこめられる
      if (has(look, 'iceage')) {
        // 氷河期：分身を中心に、大きな雪の結晶が広がる（6本の枝と、枝分かれ）
        ctx.save(); ctx.rotate(t * 0.15);
        glow('#e8fbff', 8); ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 1.8;
        for (let i = 0; i < 6; i++) {
          const a = (i * TAU) / 6;
          ctx.save(); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(r * 1.0, 0); ctx.lineTo(r * 2.2, 0); ctx.stroke();
          for (const [x, l] of [[1.4, 0.45], [1.85, 0.32]]) { ctx.beginPath(); ctx.moveTo(r * x, 0); ctx.lineTo(r * (x + l * 0.6), -r * l); ctx.moveTo(r * x, 0); ctx.lineTo(r * (x + l * 0.6), r * l); ctx.stroke(); }
          ctx.restore();
        }
        noGlow(); ctx.restore();
      }
    }
    if (e === 'pull') {
      // 引力：中心が黒い渦になる（特異点：白い光の輪をまとう黒い穴）
      const evo = kw(look, 'pull');
      ctx.save(); outlinePath(); ctx.clip();
      ctx.strokeStyle = PH.grav; ctx.lineWidth = 1.4;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) { const s = i / 20, a = -t * 2 + k * (TAU / 3) + s * 4, d = r * (1 - s * 0.85); if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d); else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#05030c';
      ctx.beginPath(); ctx.arc(0, 0, r * (evo ? 0.5 : 0.36), 0, TAU); ctx.fill();
      if (evo) { glow(WHITE, 10); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.85, r * 0.3, -0.4, 0, TAU); ctx.stroke(); noGlow(); }
      // 重力崩壊：体のふちが内へゆがむ
      if (has(look, 'collapse')) {
        ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 32; i++) { const a = (i * TAU) / 32, d = r * (1.15 + 0.12 * Math.sin(a * 5 + t * 4)); if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d); else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
        ctx.stroke();
      }
    }
    if (e === 'poison') {
      // 毒：体の中が紫の液になり、泡がのぼる（猛毒：泡が多く、濃い）
      const evo = kw(look, 'poison');
      ctx.save(); outlinePath(); ctx.clip();
      ctx.fillStyle = evo ? 'rgba(120,40,200,0.6)' : 'rgba(180,92,255,0.45)';
      ctx.fillRect(-r * 2, -r * 0.1, r * 4, r * 2.2);
      ctx.fillStyle = 'rgba(236,210,255,0.9)';
      const n = evo ? 7 : 4;
      for (let i = 0; i < n; i++) { const ph = (t * 0.6 + i / n) % 1, x = (((i * 37) % 10) / 10 - 0.5) * r * 1.2, y = r * (0.8 - ph * 1.1); ctx.beginPath(); ctx.arc(x, y, r * 0.09 + (i % 2), 0, TAU); ctx.fill(); }
      ctx.restore();
      // 腐食：ふちが、ところどころ欠けている
      if (has(look, 'corrode')) {
        // 腐食：ふちが溶けてただれ、毒がしみ出して垂れていく（極：しみが広く、白く泡立つ）
        const big = kw(look, 'corrode');
        ctx.fillStyle = 'rgba(70,20,110,0.9)';
        for (let i = 0; i < (big ? 7 : 5); i++) {
          const a = i * 1.25 + 0.3, x = Math.cos(a) * r * 0.86, y = Math.sin(a) * r * 0.86, s = r * (0.2 + (i % 3) * 0.06);
          ctx.beginPath(); for (let k = 0; k < 9; k++) { const b = (k * TAU) / 9, rr = s * (0.7 + ((k * 5 + i) % 4) * 0.15); ctx.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); } ctx.closePath(); ctx.fill();
        }
        // ふちから垂れるしずく（下へ伸びて落ちる）
        ctx.fillStyle = PH.poison;
        for (const [a, sp] of [[0.6, 0], [2.3, 0.4], [1.5, 0.7]]) {
          const ph = (t * 0.7 + sp) % 1, x = Math.cos(a) * r, y = Math.sin(a) * r, len = r * (0.25 + ph * 0.7);
          ctx.beginPath(); ctx.moveTo(x - r * 0.1, y); ctx.lineTo(x - r * 0.05, y + len); ctx.arc(x, y + len, r * 0.09, Math.PI, 0, true); ctx.lineTo(x + r * 0.1, y); ctx.fill();
        }
        if (big) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 5; i++) { const a = i * 1.25 + 0.3 + Math.sin(t * 3 + i) * 0.1; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, 1.1, 0, TAU); ctx.fill(); } }
      }
      // 伝染：下から毒のしずくが落ちる
      if (has(look, 'contagion')) {
        // 伝染：毒が、等しい間隔のまわりの敵へ順番に伝わっていく
        //   分身から毒の波が輪になって広がり、波が届いた敵から紫に染まる。染まった敵からも小さな波が出る
        const n = kw(look, 'contagion') ? 4 : 3, D = r * 2.1, cyc = (t * 0.5) % 1;
        const wave = cyc * 1.25;   // 波の広がり（0→1で敵の位置まで）
        ctx.strokeStyle = `rgba(180,92,255,${0.7 * (1 - Math.min(1, wave))})`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(0, 0, r + (D - r) * Math.min(1, wave), 0, TAU); ctx.stroke();
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i * TAU) / n, X = Math.cos(a) * D, Y = Math.sin(a) * D;
          ctx.strokeStyle = 'rgba(180,92,255,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * (D - r * 0.25), Math.sin(a) * (D - r * 0.25)); ctx.stroke(); ctx.setLineDash([]);
          const hit = wave >= 1;
          ctx.fillStyle = hit ? PH.poison : THEME.enemy; ctx.strokeStyle = hit ? PH.poisonDeep : THEME.enemyEdge; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(X, Y, r * 0.24, 0, TAU); ctx.fill(); ctx.stroke();
          if (hit) { const w2 = (wave - 1) / 0.25; ctx.strokeStyle = `rgba(180,92,255,${0.8 * (1 - w2)})`; ctx.beginPath(); ctx.arc(X, Y, r * (0.3 + w2 * 0.5), 0, TAU); ctx.stroke(); }
        }
      }
    }
    if (e === 'reaper') {
      // 体の中が暗く沈み、中心にうつろな目が光る
      ctx.save(); outlinePath(); ctx.clip();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(5,3,12,0.9)'); g.addColorStop(1, 'rgba(40,20,80,0.35)');
      ctx.fillStyle = g; ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
      ctx.restore();
      const eyeC = kw(look, 'reaper') ? '#bfe6ff' : '#b0a4ff';
      if (has(look, 'doom')) {
        // 死の宣告：目が時計になり、針が回って時を刻む（12時に近づくと赤く）
        const a = -Math.PI / 2 + ((t * 0.5) % 1) * TAU;
        const late = ((t * 0.5) % 1) > 0.8;
        ctx.strokeStyle = eyeC; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.stroke();
        for (let i = 0; i < 12; i++) { const b = (i * TAU) / 12; ctx.beginPath(); ctx.moveTo(Math.cos(b) * r * 0.4, Math.sin(b) * r * 0.4); ctx.lineTo(Math.cos(b) * r * 0.5, Math.sin(b) * r * 0.5); ctx.stroke(); }
        ctx.strokeStyle = late ? '#ff4d66' : WHITE; ctx.lineWidth = 1.8; glow(ctx.strokeStyle, 8);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42); ctx.stroke(); noGlow();
        if (kw(look, 'doom')) core(() => { ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke(); }, 1);
      } else {
        ctx.fillStyle = eyeC; glow(eyeC, 10);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.32, r * 0.14, 0, 0, TAU); ctx.fill(); noGlow();
        ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.arc(0, 0, r * 0.08, 0, TAU); ctx.fill();
      }
    }
  }

  // ============================================================
  // 本体の道：本体の体（本体の中心が原点。r＝本体の半径。dir＝動く向き、aim＝狙う向き）
  // ============================================================
  // 色のセットで変わるので、使うたびに読む
  const B = { get fill() { return THEME.playerGlow; }, get edge() { return THEME.playerEdge; }, get light() { return THEME.playerLight; }, get deep() { return THEME.playerDeep; } };

  function bodyPath(type, r, dir) {
    ctx.beginPath();
    if (type === 'charge') {
      // 拳闘士：全方向に戦うので、どっしりした八角形
      for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8 + Math.PI / 8; if (i === 0) ctx.moveTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); else ctx.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2); }
      ctx.closePath();
    } else if (type === 'shoot') {
      // 射手：丸い体（砲台のように、砲身を付けるための形）
      ctx.arc(0, 0, r * 1.05, 0, TAU);
    } else if (type === 'dash') {
      // 疾風：動く向きに細長く、後ろへ流れる形
      const c = Math.cos(dir), s = Math.sin(dir);
      const P = [[1.6, 0], [0.3, 0.55], [-0.6, 0.45], [-1.5, 0.75], [-1.05, 0], [-1.5, -0.75], [-0.6, -0.45], [0.3, -0.55]];
      P.forEach(([x, y], i) => { const X = (x * c - y * s) * r, Y = (x * s + y * c) * r; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); });
      ctx.closePath();
    } else {
      ctx.arc(0, 0, r, 0, TAU);
    }
  }

  // 本体の体の形：衛星・収穫の道の型で、黄色い体そのものがこの形になる。原点が本体の中心、s＝大きさ
  //   浮遊＝丸い玉、衛星＝輪のある星、刃輪＝回る手裏剣、子機＝三角の司令塔、盾衛星＝紋章の盾
  //   拾い上手＝かけら、収穫者＝カットした宝石、錬金＝金貨、吸収＝緑のしずく
  function coreKind(p) {
    const o = p.olook, h = p.hlook;
    if (o) return o.type || (o.entry ? 'float' : null);
    if (h) return h.type || (h.entry ? 'keeper' : null);
    return null;
  }
  // 本体の体そのものを、型の形で描く（黄色い星の代わり。色は本体の金色のまま）
  function drawCore(kind, s, t) {
    ctx.save();
    ctx.lineJoin = 'round';
    const F = B.fill, E = B.edge, L = B.light;
    const body = () => { glow(F, 14); ctx.fillStyle = F; ctx.fill(); noGlow(); ctx.strokeStyle = E; ctx.lineWidth = 1.6; ctx.stroke(); };
    ctx.beginPath();
    if (kind === 'float') {
      // 丸い玉（上に光の照り返し）
      ctx.arc(0, 0, s, 0, TAU); body();
      ctx.fillStyle = L; ctx.beginPath(); ctx.ellipse(-s * 0.3, -s * 0.35, s * 0.32, s * 0.2, -0.6, 0, TAU); ctx.fill();
    } else if (kind === 'satellite') {
      // 帯の模様が流れる星（輪は付けない）
      ctx.arc(0, 0, s, 0, TAU); body();
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.clip();
      ctx.strokeStyle = B.deep; ctx.lineWidth = s * 0.22;
      for (const [y, sp] of [[-0.45, 1], [0.1, -0.7], [0.6, 0.5]]) { const off = Math.sin(t * sp) * s * 0.15; ctx.beginPath(); ctx.moveTo(-s * 1.2, y * s + off); ctx.quadraticCurveTo(0, y * s - s * 0.18 + off, s * 1.2, y * s + off); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = L; ctx.beginPath(); ctx.ellipse(-s * 0.35, -s * 0.5, s * 0.25, s * 0.12, -0.5, 0, TAU); ctx.fill();
    } else if (kind === 'blade') {
      // 4枚刃の手裏剣（回る）
      ctx.rotate(t * 4);
      for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4; ctx.lineTo(Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3); ctx.lineTo(Math.cos(a + 0.55) * s * 0.42, Math.sin(a + 0.55) * s * 0.42); }
      ctx.closePath(); body();
      ctx.fillStyle = E; ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, TAU); ctx.fill();
    } else if (kind === 'drone') {
      // 三角の船（窓が1つ）
      ctx.moveTo(0, -s * 1.25); ctx.lineTo(s * 1.1, s * 0.85); ctx.lineTo(0, s * 0.45); ctx.lineTo(-s * 1.1, s * 0.85); ctx.closePath(); body();
      ctx.fillStyle = L; ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 0.24, 0, TAU); ctx.fill();
    } else if (kind === 'shieldsat') {
      // 紋章の盾（十字の線）
      ctx.moveTo(-s, -s); ctx.lineTo(s, -s); ctx.lineTo(s, s * 0.1); ctx.quadraticCurveTo(s * 0.85, s * 0.9, 0, s * 1.3); ctx.quadraticCurveTo(-s * 0.85, s * 0.9, -s, s * 0.1); ctx.closePath(); body();
      ctx.strokeStyle = E; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, s * 0.9); ctx.moveTo(-s * 0.65, -s * 0.2); ctx.lineTo(s * 0.65, -s * 0.2); ctx.stroke();
    } else if (kind === 'keeper') {
      // かけら（ひし形）
      ctx.moveTo(0, -s * 1.35); ctx.lineTo(s * 0.9, 0); ctx.lineTo(0, s * 1.35); ctx.lineTo(-s * 0.9, 0); ctx.closePath(); body();
      ctx.strokeStyle = E; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -s * 1.35); ctx.lineTo(0, s * 1.35); ctx.stroke();
      ctx.fillStyle = L; ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.9); ctx.lineTo(-s * 0.55, -s * 0.05); ctx.lineTo(-s * 0.15, -s * 0.05); ctx.closePath(); ctx.fill();
    } else if (kind === 'shortcut') {
      // カットした宝石（上が平ら、下がとがる）
      ctx.moveTo(-s * 1.15, -s * 0.4); ctx.lineTo(-s * 0.6, -s * 1.0); ctx.lineTo(s * 0.6, -s * 1.0); ctx.lineTo(s * 1.15, -s * 0.4); ctx.lineTo(0, s * 1.25); ctx.closePath(); body();
      ctx.strokeStyle = E; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 1.15, -s * 0.4); ctx.lineTo(s * 1.15, -s * 0.4); ctx.moveTo(-s * 0.4, -s * 0.4); ctx.lineTo(0, s * 1.25); ctx.lineTo(s * 0.4, -s * 0.4); ctx.moveTo(-s * 0.6, -s * 1.0); ctx.lineTo(-s * 0.4, -s * 0.4); ctx.moveTo(s * 0.6, -s * 1.0); ctx.lineTo(s * 0.4, -s * 0.4); ctx.stroke();
    } else if (kind === 'alchemy') {
      // 金貨（ふちと、中の四角い穴）
      ctx.arc(0, 0, s * 1.05, 0, TAU); body();
      ctx.strokeStyle = E; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, s * 0.75, 0, TAU); ctx.stroke();
      ctx.fillStyle = E; ctx.fillRect(-s * 0.22, -s * 0.22, s * 0.44, s * 0.44);
    } else if (kind === 'absorb') {
      // しずく（上がとがる）
      ctx.moveTo(0, -s * 1.4); ctx.quadraticCurveTo(s * 1.15, s * 0.1, s * 0.75, s * 0.8); ctx.quadraticCurveTo(0, s * 1.4, -s * 0.75, s * 0.8); ctx.quadraticCurveTo(-s * 1.15, s * 0.1, 0, -s * 1.4); body();
      ctx.fillStyle = L; ctx.beginPath(); ctx.ellipse(-s * 0.3, s * 0.35, s * 0.18, s * 0.3, 0.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // 本体の形を描く（look がなければ false を返し、ふつうの星を描いてもらう）
  function drawBody(p, look, t) {
    now = t;
    if (!look || !look.type) return false;
    const r = p.r * 1.15, type = look.type;
    const dir = p.dir != null ? p.dir : -Math.PI / 4;
    const aim = p.aim != null ? p.aim : -Math.PI / 2;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // ---- うしろ側 ----
    if (type === 'charge') {
      // 連打：八角形のふちが、外へ次々に打ち出される（全方向へのラッシュ）
      if (has(look, 'rush')) {
        const n = kw(look, 'rush') ? 3 : 2;
        for (let i = 0; i < n; i++) {
          const ph = (t * 2.2 + i / n) % 1;
          ctx.save(); ctx.rotate(ph * 0.4);
          ctx.globalAlpha *= (1 - ph) * 0.8;
          ctx.strokeStyle = kw(look, 'rush') ? WHITE : B.fill; ctx.lineWidth = 2;
          bodyPath('charge', r * (1.05 + ph * 0.55), dir); ctx.stroke();
          ctx.restore();
        }
      }
    }
    if (type === 'shoot') {
      const barrel = (a, from, to, w, hot) => {
        ctx.save(); ctx.rotate(a);
        ctx.fillStyle = B.deep; ctx.strokeStyle = B.edge; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.rect(from, -w / 2, to - from, w); ctx.fill(); ctx.stroke();
        if (hot) core(() => { ctx.beginPath(); ctx.moveTo(from + 2, 0); ctx.lineTo(to, 0); ctx.stroke(); }, 1.2);
        ctx.restore();
      };
      // 弾幕：まわり全体に短い砲身
      if (has(look, 'barrage')) for (let i = 0; i < 8; i++) barrel(t * 0.6 + (i * TAU) / 8, r * 0.7, r * 1.55, r * 0.3);
      // 速射：砲身が2本並ぶ
      if (has(look, 'rapid')) { const o = r * 0.3; ctx.save(); ctx.rotate(aim); for (const y of [-o, o]) { ctx.fillStyle = B.deep; ctx.strokeStyle = B.edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(r * 0.6, y - r * 0.22, r * (kw(look, 'rapid') ? 1.35 : 1.15), r * 0.44); ctx.fill(); ctx.stroke(); } ctx.restore(); }
      // 狙撃：長い砲身と、のぞく筒
      else if (has(look, 'snipe')) {
        // 狙撃：細く長い砲身と、のぞく筒（射撃の太く短い砲身と見分ける）
        barrel(aim, r * 0.6, r * (kw(look, 'snipe') ? 3.3 : 2.9), r * 0.18, kw(look, 'snipe'));
        ctx.save(); ctx.rotate(aim); ctx.fillStyle = B.edge; ctx.fillRect(r * 0.95, -r * 0.42, r * 0.8, r * 0.2); ctx.fillRect(r * 2.6, -r * 0.2, r * 0.12, r * 0.4); ctx.restore();
      }
      // 射撃：太く短い砲身1本（狙撃手：長く、金のふち）。弾幕だけのときは、まわりの砲身から撃つので要らない
      else if (!has(look, 'barrage')) barrel(aim, r * 0.55, r * (kw(look, 'shoot') ? 2.0 : 1.6), r * 0.62);
    }
    if (type === 'dash') {
      // 疾走：うしろへ流れる風の線（風神：渦を巻く）
      ctx.strokeStyle = 'rgba(255,248,214,0.7)'; ctx.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) {
        const ox = -Math.cos(dir) * r * 1.3, oy = -Math.sin(dir) * r * 1.3, nx = -Math.sin(dir) * i * r * 0.5, ny = Math.cos(dir) * i * r * 0.5;
        const len = r * (1.4 + ((Math.floor(t * 8) + i + 3) % 3) * 0.25);
        ctx.beginPath(); ctx.moveTo(ox + nx, oy + ny); ctx.lineTo(ox + nx - Math.cos(dir) * len, oy + ny - Math.sin(dir) * len); ctx.stroke();
      }
      if (kw(look, 'dash')) {
        ctx.strokeStyle = 'rgba(255,248,214,0.6)'; ctx.lineWidth = 1.4;
        for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let i = 0; i <= 24; i++) { const s = i / 24, a = t * 5 + k * Math.PI + s * 5, d = r * (1.2 + s * 0.8); if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d); else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); } ctx.stroke(); }
      }
      // 瞬身：少し前に、もう一つの体がちらつく（瞬間移動の先）
      if (has(look, 'blink')) {
        ctx.save(); ctx.translate(Math.cos(dir) * r * 2.2, Math.sin(dir) * r * 2.2);
        ctx.globalAlpha *= 0.35 + 0.25 * Math.sin(t * 12);
        ctx.setLineDash([2, 2]); ctx.strokeStyle = B.light; ctx.lineWidth = 1.2; bodyPath('dash', r * 0.9, dir); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
      }
      // 突風：前に、風の弧が2本
      if (has(look, 'gust')) {
        ctx.strokeStyle = kw(look, 'gust') ? WHITE : B.light; ctx.lineWidth = kw(look, 'gust') ? 2.2 : 1.6;
        for (const k of [1.9, 2.4]) { ctx.beginPath(); ctx.arc(0, 0, r * k, dir - 0.6, dir + 0.6); ctx.stroke(); }
      }
    }

    // ---- 体 ----
    const small = type === 'dash' && has(look, 'nimble');   // 身軽：体が小さくなる
    const br = small ? r * 0.72 : r;
    glow(B.fill, 14);
    bodyPath(type, br, dir);
    ctx.fillStyle = B.fill; ctx.fill();
    noGlow();
    ctx.strokeStyle = B.edge; ctx.lineWidth = type === 'charge' ? 2.4 : 1.6; ctx.stroke();
    if (small) { ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(255,248,214,0.6)'; ctx.lineWidth = 1; bodyPath(type, r, dir); ctx.stroke(); ctx.setLineDash([]); }

    // ---- 前側・中身 ----
    if (type === 'charge') {
      // 重拳：八角形の角すべてに、太い拳のこぶ（極は大きく、白い芯）
      if (has(look, 'heavyfist')) {
        const k = kw(look, 'heavyfist') ? 0.36 : 0.28;
        ctx.fillStyle = B.deep; ctx.strokeStyle = B.edge; ctx.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8 + Math.PI / 8; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, r * k, 0, TAU); ctx.fill(); ctx.stroke(); if (kw(look, 'heavyfist')) { ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, r * 0.12, 0, TAU); ctx.fill(); ctx.fillStyle = B.deep; } }
      }
      // 内側にもう一段の八角形（どっしり見せる）
      ctx.strokeStyle = B.edge; ctx.lineWidth = 1.2; bodyPath('charge', r * 0.62, dir); ctx.stroke();
    }
    if (type === 'shoot') {
      // 追尾弾：まわりを、小さな弾が弧をえがいて回る
      if (has(look, 'homing')) {
        for (let i = 0; i < 3; i++) {
          const a = t * 2 + (i * TAU) / 3, d = r * 1.7;
          ctx.strokeStyle = 'rgba(255,248,214,0.5)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(0, 0, d, a - 0.6, a); ctx.stroke();
          ctx.fillStyle = kw(look, 'homing') ? WHITE : B.light; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.18, 0, TAU); ctx.fill();
        }
      }
      // 中心は照準のような二重の円
      ctx.strokeStyle = B.edge; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.stroke();
      ctx.fillStyle = B.light; ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, TAU); ctx.fill();
    }
    if (type === 'shoot' && kw(look, 'shoot')) {
      // 狙撃手：狙う向きへ、はるか先まで照準の光線がのび、先に照準の印。体のまわりに目盛りの輪が回り、のぞく筒がきらめく
      ctx.save(); ctx.rotate(aim);
      const from = r * (has(look, 'snipe') ? 3.3 : 2.0), to = r * 6.5;
      const lg = ctx.createLinearGradient(from, 0, to, 0);
      lg.addColorStop(0, 'rgba(255,90,90,0.9)'); lg.addColorStop(1, 'rgba(255,90,90,0)');
      ctx.strokeStyle = lg; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(from, 0); ctx.lineTo(to, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,120,120,0.9)'; ctx.lineWidth = 1.2; const cx = r * 4.6, cr = r * 0.45;
      ctx.beginPath(); ctx.arc(cx, 0, cr, 0, TAU); ctx.moveTo(cx - cr * 1.5, 0); ctx.lineTo(cx - cr * 0.5, 0); ctx.moveTo(cx + cr * 0.5, 0); ctx.lineTo(cx + cr * 1.5, 0); ctx.moveTo(cx, -cr * 1.5); ctx.lineTo(cx, -cr * 0.5); ctx.moveTo(cx, cr * 0.5); ctx.lineTo(cx, cr * 1.5); ctx.stroke();
      const gl = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.fillStyle = '#ffffff'; glow('#ffffff', 12 * gl);
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.08 : r * (0.25 + 0.2 * gl); ctx.lineTo(r * 1.3 + Math.cos(a) * rr, -r * 0.35 + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); noGlow();
      ctx.restore();
      ctx.save(); ctx.rotate(t * 0.8); ctx.strokeStyle = B.light; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = (i * TAU) / 12, L = i % 3 === 0 ? 0.32 : 0.15; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35); ctx.lineTo(Math.cos(a) * r * (1.35 + L), Math.sin(a) * r * (1.35 + L)); ctx.stroke(); }
      ctx.restore();
    }
    if (type === 'dash') {
      // 残像斬り：体の両わきに、鎌のような刃
      if (has(look, 'afterslash')) {
        ctx.save(); ctx.rotate(dir);
        ctx.fillStyle = kw(look, 'afterslash') ? WHITE : '#fff1b8'; ctx.strokeStyle = B.edge; ctx.lineWidth = 1;
        for (const sg of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(r * 0.2, sg * br * 0.5); ctx.quadraticCurveTo(-r * 0.1, sg * r * 1.5, -r * 1.2, sg * r * 1.25); ctx.quadraticCurveTo(-r * 0.2, sg * r * 1.0, -r * 0.3, sg * br * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.fillStyle = B.light; ctx.beginPath(); ctx.arc(0, 0, br * 0.26, 0, TAU); ctx.fill();
    }
    // 目覚めの進化：金のふち
    if (anyEvo(look)) goldRim(r * 1.7);
    ctx.restore();
    return true;
  }

  // ============================================================
  // 衛星の道：本体のまわりを回るもの（本体の中心が原点。R＝回る半径）
  // ============================================================
  const SAT = { orb: '#bfe6ff', orbEdge: '#3b7fc4', blade: '#e8ecff', drone: '#9fd4ff', plate: '#cfe0ff' };

  function orb(x, y, s, hot) {
    glow(SAT.orb, 10); ctx.fillStyle = hot ? WHITE : SAT.orb; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); noGlow();
    ctx.strokeStyle = SAT.orbEdge; ctx.lineWidth = 1; ctx.stroke();
  }
  function blade(x, y, a, s, hot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    glow(SAT.blade, 6);
    ctx.fillStyle = hot ? WHITE : SAT.blade; ctx.strokeStyle = '#5a6a9a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-s, s * 0.25); ctx.quadraticCurveTo(0, -s * 1.3, s, s * 0.25); ctx.quadraticCurveTo(0, -s * 0.35, -s, s * 0.25); ctx.closePath(); ctx.fill(); noGlow(); ctx.stroke();
    ctx.restore();
  }
  function drone(x, y, a, s, kind, hot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = hot ? WHITE : SAT.drone; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath();
    if (kind === 'ram') { ctx.moveTo(s * 1.5, 0); ctx.lineTo(-s * 0.6, s * 0.7); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.6, -s * 0.7); }
    else if (kind === 'mother') { ctx.moveTo(s * 1.4, 0); ctx.lineTo(s * 0.4, s * 0.8); ctx.lineTo(-s * 1.2, s * 0.8); ctx.lineTo(-s * 1.2, -s * 0.8); ctx.lineTo(s * 0.4, -s * 0.8); }
    else { ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.75); ctx.lineTo(-s * 0.7, -s * 0.75); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    if (kind === 'ram') { ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(-s * 1.3, s * 0.3); ctx.lineTo(-s * 1.1, 0); ctx.lineTo(-s * 1.3, -s * 0.3); ctx.fill(); }
    if (kind === 'gun') { ctx.fillStyle = INK; ctx.fillRect(s * 0.4, -s * 0.15, s * 1.0, s * 0.3); }
    if (kind === 'collect') { ctx.fillStyle = THEME.shard; ctx.beginPath(); ctx.moveTo(s * 1.4, -s * 0.45); ctx.lineTo(s * 1.75, 0); ctx.lineTo(s * 1.4, s * 0.45); ctx.lineTo(s * 1.05, 0); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke(); }
    ctx.restore();
  }
  function plate(a, R, w, hot) {
    ctx.strokeStyle = hot ? WHITE : SAT.plate; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    glow(SAT.plate, 6); ctx.beginPath(); ctx.arc(0, 0, R, a - w, a + w); ctx.stroke(); noGlow();
  }

  function drawOrbit(p, look, t) {
    now = t;
    if (!look) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.lineJoin = 'round';
    const R = p.r * 2.4;
    const ring = (rr, dash) => { ctx.strokeStyle = 'rgba(191,230,255,0.25)'; ctx.lineWidth = 1; if (dash) ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); ctx.setLineDash([]); };
    const type = look.type;
    if (!type && look.entry) {
      // 浮遊：光の玉が1つ回る（極：2つ）
      ring(R, true);
      const n = kw(look, 'float') ? 2 : 1;
      for (let i = 0; i < n; i++) { const a = t * 1.5 + (i * TAU) / n; orb(Math.cos(a) * R, Math.sin(a) * R, p.r * 0.38, kw(look, 'float')); }
      if (anyEvo(look)) goldRim(R + p.r * 0.7);
    }
    if (type === 'satellite') {
      if (has(look, 'orbitshift')) {
        // 軌道変化：だ円の軌道が2本、交わる
        for (const tilt of [0.5, -0.5]) {
          ctx.save(); ctx.rotate(tilt); ctx.strokeStyle = 'rgba(191,230,255,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.3, R * 0.6, 0, 0, TAU); ctx.stroke();
          const a = t * 1.4 + tilt * 3; orb(Math.cos(a) * R * 1.3, Math.sin(a) * R * 0.6, p.r * 0.34, kw(look, 'orbitshift')); ctx.restore();
        }
      } else ring(R);
      if (has(look, 'bigsat')) {
        // 大衛星：大きな玉が1つ、輪をまとう
        const a = t * 0.9, x = Math.cos(a) * R, y = Math.sin(a) * R, s = p.r * (kw(look, 'bigsat') ? 0.95 : 0.8);
        orb(x, y, s, false);
        // 玉そのものも回る（表面の帯が流れ、輪の向きが回る）
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.clip();
        ctx.strokeStyle = 'rgba(59,127,196,0.7)'; ctx.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) { const off = ((t * 1.2 + k / 3) % 1) * 2 - 1; ctx.beginPath(); ctx.moveTo(x + off * s * 1.4 - s, y - s); ctx.lineTo(x + off * s * 1.4 + s * 0.2, y + s); ctx.stroke(); }
        ctx.restore();
        ctx.strokeStyle = kw(look, 'bigsat') ? WHITE : SAT.orb; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y, s * 1.6, s * 0.45, t * 1.5, 0, TAU); ctx.stroke();
      } else if (!has(look, 'orbitshift')) {
        // 衛星：玉が3つ（惑星系：それぞれに小さな月）
        for (let i = 0; i < 3; i++) {
          const a = t * 1.5 + (i * TAU) / 3, x = Math.cos(a) * R, y = Math.sin(a) * R;
          orb(x, y, p.r * 0.34, false);
          if (kw(look, 'satellite')) { const b = t * 4 + i; ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x + Math.cos(b) * p.r * 0.65, y + Math.sin(b) * p.r * 0.65, 1.4, 0, TAU); ctx.fill(); }
        }
      }
      // 流星：玉の1つが外へ飛び出し、尾を引く
      if (has(look, 'meteor')) {
        const a = 0.6, d = R * (1.5 + 0.3 * Math.sin(t * 2)), x = Math.cos(a) * d, y = Math.sin(a) * d;
        const g = ctx.createLinearGradient(x, y, x - Math.cos(a) * R * 1.1, y - Math.sin(a) * R * 1.1);
        g.addColorStop(0, 'rgba(191,230,255,0.8)'); g.addColorStop(1, 'rgba(191,230,255,0)');
        ctx.strokeStyle = g; ctx.lineWidth = p.r * 0.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * R * 1.1, y - Math.sin(a) * R * 1.1); ctx.stroke();
        orb(x, y, p.r * 0.36, kw(look, 'meteor'));
      }
      // 星の雨：まわりに小さな星が降る
      if (has(look, 'starfall')) {
        for (let i = 0; i < 5; i++) {
          const ph = (t * 0.8 + i / 5) % 1, x = ([-0.8, 0.35, -0.2, 0.75, -0.55][i]) * R * 1.3, y = -R * 1.4 + ph * R * 2.6;
          ctx.save(); ctx.globalAlpha *= 1 - ph * 0.5; ctx.fillStyle = '#fff6c8'; ctx.translate(x, y);
          ctx.beginPath(); for (let k = 0; k < 10; k++) { const b = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 1.2 : 3; ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); } ctx.fill(); ctx.restore();
        }
      }
      if (anyEvo(look)) goldRim(R + p.r * 0.7);
    }
    if (type === 'blade') {
      const s = p.r * 0.95;
      if (has(look, 'twinblade')) {
        // 双刃：内と外の2つの輪が、逆向きに回る
        for (let i = 0; i < 3; i++) { const a = t * 2.4 + (i * TAU) / 3; blade(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, a + Math.PI / 2, s * 0.8, kw(look, 'twinblade')); }
        for (let i = 0; i < 3; i++) { const a = -t * 2.4 + (i * TAU) / 3; blade(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3, a - Math.PI / 2, s * 0.9, kw(look, 'twinblade')); }
      } else if (has(look, 'thousandblade')) {
        // 千刃：小さな刃がびっしり回る
        for (let i = 0; i < 12; i++) { const a = t * 3 + (i * TAU) / 12, d = R * (1 + 0.12 * (i % 2)); blade(Math.cos(a) * d, Math.sin(a) * d, a + Math.PI / 2, s * 0.6, false); }
      } else if (kw(look, 'blade')) {
        // 回転鋸：刃がつながって、歯のある丸のこになる
        ctx.save(); ctx.rotate(t * 3);
        ctx.fillStyle = SAT.blade; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        ctx.beginPath(); for (let i = 0; i < 24; i++) { const a = (i * TAU) / 24, rr = i % 2 ? R * 1.18 : R * 1.02; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath();
        ctx.arc(0, 0, R * 0.82, 0, TAU, true); ctx.fill('evenodd'); ctx.stroke(); ctx.restore();
      } else {
        // 刃輪：三日月の刃が3つ回る
        for (let i = 0; i < 3; i++) { const a = t * 2.4 + (i * TAU) / 3; blade(Math.cos(a) * R, Math.sin(a) * R, a + Math.PI / 2, s, false); }
      }
      // 研磨：刃が白く光り、火花が散る
      if (has(look, 'whet')) {
        ctx.fillStyle = WHITE;
        for (let i = 0; i < 6; i++) { const a = t * 2.4 + i * 1.05, d = R * 1.15 + (i % 3); ctx.fillRect(Math.cos(a) * d - 1, Math.sin(a) * d - 1, 2, 2); }
        if (kw(look, 'whet')) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); }
      }
      // 投げ刃：刃の1つが外へ飛んでいき、回転の跡を残す
      if (has(look, 'throw')) {
        const d = R * (1.7 + 0.2 * Math.sin(t * 3)), a = -0.5;
        ctx.strokeStyle = 'rgba(232,236,255,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R); ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); ctx.stroke(); ctx.setLineDash([]);
        blade(Math.cos(a) * d, Math.sin(a) * d, t * 10, s * 1.05, kw(look, 'throw'));
      }
      if (anyEvo(look)) goldRim(R * 1.18 + 3);
    }
    if (type === 'drone') {
      const s = p.r * 0.72;
      const kind = has(look, 'ramdrone') ? 'ram' : has(look, 'gundrone') ? 'gun' : 'plain';
      const hot = kw(look, 'ramdrone') || kw(look, 'gundrone');
      const fly = (a, d) => [Math.cos(a) * d, Math.sin(a) * d, a + Math.PI / 2];   // 回りながら、進む向きを向く
      let list;
      if (kw(look, 'drone')) {
        // 編隊：V字に並んだまま、本体のまわりを回る
        const a0 = t * 1.1;
        list = [[0, 0], [-0.32, 0.5], [-0.32, -0.5], [-0.64, 1.0], [-0.64, -1.0]].map(([da, dd]) => fly(a0 + da, R * (1.15 + dd * 0.22)));
      } else {
        // 子機：2機が、本体のまわりを別々に飛び回る（近づいたり離れたり）
        list = [0, 1].map((i) => fly(t * (1.4 + i * 0.3) + i * Math.PI, R * (1 + 0.18 * Math.sin(t * 2.3 + i * 2))));
      }
      if (has(look, 'mothership')) {
        // 母艦：本体の上に大きな船がとどまり、子機がそこから出入りする（出入りの線つき）
        const mx = 0, my = -R * 1.2;
        ctx.strokeStyle = 'rgba(159,212,255,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
        for (const [x, y] of list) { ctx.beginPath(); ctx.moveTo(mx, my + s * 0.6); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.setLineDash([]);
        ctx.save(); ctx.translate(mx, my);
        ctx.fillStyle = SAT.drone; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-s * 2.2, 0); ctx.lineTo(-s * 1.4, -s * 0.8); ctx.lineTo(s * 1.4, -s * 0.8); ctx.lineTo(s * 2.2, 0); ctx.lineTo(s * 1.4, s * 0.7); ctx.lineTo(-s * 1.4, s * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.fillRect(-s * 0.9, s * 0.25, s * 1.8, s * 0.3);   // 子機の出入り口
        ctx.fillStyle = WHITE; for (const x of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(x * s * 0.8, -s * 0.3, s * 0.12, 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      list.forEach(([x, y, a]) => drone(x, y, a, s, kind, hot));
      // 砲撃機：子機から外へ弾が出ている
      if (kind === 'gun') { ctx.fillStyle = WHITE; for (const [x, y, a] of list) { const ph = (t * 1.5) % 1, d = s * 1.6 + ph * R * 0.8; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.4, 0, TAU); ctx.fill(); } }
      // 回収機：かけらを持って、本体へ戻ってくる子機
      if (has(look, 'collector')) { const ph = (t * 0.6) % 1, d = R * (1.6 - ph * 0.9), a = 2.4; drone(Math.cos(a) * d, Math.sin(a) * d, a + Math.PI, s, 'collect', kw(look, 'collector')); }
      if (anyEvo(look)) goldRim(R * 0.75);
    }
    if (type === 'shieldsat') {
      const n = kw(look, 'shieldsat') ? 8 : 2;
      const w = kw(look, 'shieldsat') ? 0.36 : 0.5;
      const hot = kw(look, 'reflect') || kw(look, 'shockshield');
      if (has(look, 'sanctuary')) {
        // 聖域：白金色の光の円と、ゆっくり回る8本の光の筋、下からのぼる光の粒
        const RR = R * 1.1;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, RR);
        g.addColorStop(0, 'rgba(255,250,225,0.35)'); g.addColorStop(0.7, 'rgba(255,246,200,0.15)'); g.addColorStop(1, 'rgba(255,246,200,0.4)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, RR, 0, TAU); ctx.fill();
        glow('#fff6c8', 12); ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 1.6; ctx.stroke(); noGlow();
        ctx.save(); ctx.rotate(t * 0.3);
        for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; const L = i % 2 ? RR * 0.75 : RR * 1.3; const gg = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L); gg.addColorStop(0, 'rgba(255,250,225,0.7)'); gg.addColorStop(1, 'rgba(255,250,225,0)'); ctx.strokeStyle = gg; ctx.lineWidth = i % 2 ? 1.2 : 2.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = '#fffbe8';
        for (let i = 0; i < 5; i++) { const ph = (t * 0.5 + i / 5) % 1, x = ([-0.6, 0.2, -0.15, 0.55, -0.35][i]) * RR; ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(x, RR * 0.6 - ph * RR * 1.3, 1.3, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      for (let i = 0; i < n; i++) {
        const a = t * 1.2 + (i * TAU) / n;
        plate(a, R, w, hot);
        // 反射盾：盾の表面に白い光の筋
        if (has(look, 'reflect')) { ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, R + 1, a - w * 0.5, a - w * 0.1); ctx.stroke(); }
        // 衝撃盾：盾から外へ、衝撃の輪
        if (has(look, 'shockshield')) { const ph = (t * 1.5 + i * 0.5) % 1; ctx.strokeStyle = `rgba(207,224,255,${1 - ph})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(Math.cos(a) * R, Math.sin(a) * R, 3 + ph * p.r, 0, TAU); ctx.stroke(); }
      }
      // 護衛：近くの分身にも、盾が付く
      if (has(look, 'escort')) {
        const gx = R * 1.15, gy = R * 0.95;
        ctx.strokeStyle = '#3fe0ff'; ctx.fillStyle = 'rgba(63,224,255,0.35)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(gx, gy, p.r * 0.6, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(gx, gy); plate(t * 1.2, p.r * 1.15, 0.7, kw(look, 'escort')); ctx.restore();
      }
      if (anyEvo(look)) goldRim(R + 5);
    }
    ctx.restore();
  }

  // ============================================================
  // 収穫の道：かけらと、本体のかけらを吸う範囲（本体の中心が原点。R＝吸う範囲）
  // ============================================================
  function shard(x, y, s, mode, t) {
    if (mode === 'coin') {
      ctx.fillStyle = GOLD; ctx.strokeStyle = THEME.shardEdge; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y, s * 0.85, s * 0.85 * (0.6 + 0.4 * Math.abs(Math.cos(t * 3 + x))), 0, 0, TAU); ctx.fill(); ctx.stroke();
      return;
    }
    if (mode === 'green') {
      // 命のかけら：つるの輪に埋もれないよう、暗い台座の上に、明るく光る大きめのひし形と白い芯
      const S = s * 1.35;
      ctx.fillStyle = 'rgba(6,30,18,0.85)'; ctx.beginPath(); ctx.arc(x, y, S * 0.95, 0, TAU); ctx.fill();
      glow('#8dffb0', 10); ctx.fillStyle = '#9dffbe'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y - S); ctx.lineTo(x + S * 0.65, y); ctx.lineTo(x, y + S); ctx.lineTo(x - S * 0.65, y); ctx.closePath(); ctx.fill(); ctx.stroke(); noGlow();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y - S * 0.45); ctx.lineTo(x + S * 0.25, y); ctx.lineTo(x, y + S * 0.45); ctx.lineTo(x - S * 0.25, y); ctx.closePath(); ctx.fill();
      return;
    }
    ctx.fillStyle = mode === 'green' ? '#8dffb0' : THEME.shard; ctx.strokeStyle = mode === 'green' ? '#1d7a43' : THEME.shardEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.7, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.7, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  function drawHarvest(p, look, t) {
    now = t;
    if (!look) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.lineJoin = 'round';
    const R = p.r * 2.6, s = p.r * 0.45;
    const type = look.type;
    const coin = type === 'alchemy';
    const green = type === 'absorb';
    const mode = coin ? 'coin' : green ? 'green' : 'shard';
    // かけら：吸う範囲の輪の上に、等しい間隔で3つ（輪にそって、ゆっくり回る）
    const shards = [0, 1, 2].map((i) => { const a = -Math.PI / 2 + (i * TAU) / 3 + t * 0.25; return [Math.cos(a) / 0.55, Math.sin(a) / 0.55]; });

    // 吸う範囲の輪：型で変わる
    if (type === 'shortcut') {
      // 収穫者：目盛りの付いた二重の輪（豊年：4か所が金色に光る＝4枚から選べる）
      ctx.strokeStyle = `rgba(${THEME.playerRgb}, 0.55)`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) { const a = (i * TAU) / 12; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
      if (kw(look, 'shortcut')) { glow(GOLD, 8); ctx.fillStyle = GOLD; for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4 + Math.PI / 4; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93, 2.6, 0, TAU); ctx.fill(); } noGlow(); }
      // 宝探し：輪の中を、探る光がまわる
      if (has(look, 'treasure')) {
        const a = t * 2;
        ctx.fillStyle = `rgba(${THEME.playerRgb}, 0.25)`;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 0.86, a - 0.7, a); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(${THEME.playerRgb}, 0.8)`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86); ctx.stroke();
      }
    } else if (type === 'alchemy') {
      // 錬金：輪が錬金の円（円と三角）になる
      ctx.strokeStyle = `rgba(${THEME.playerRgb}, 0.55)`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
      ctx.save(); ctx.rotate(t * 0.3);
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * TAU) / 3; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); } ctx.closePath(); ctx.stroke();
      ctx.restore();
    } else if (type === 'absorb') {
      // 吸収：輪が、葉の芽吹くつるになる。輪から本体へ、命の光の粒が吸い込まれていく
      const k = 1 + 0.04 * Math.sin(t * 4);
      ctx.strokeStyle = 'rgba(141,255,176,0.65)'; ctx.lineWidth = 1.6; glow('#8dffb0', 6);
      ctx.beginPath(); for (let i = 0; i <= 72; i++) { const a = (i * TAU) / 72, rr = R * k * (1 + 0.035 * Math.sin(a * 9 + t * 2)); if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.stroke(); noGlow();
      ctx.fillStyle = 'rgba(141,255,176,0.85)';
      for (let i = 0; i < 9; i++) {
        const a = (i * TAU) / 9 + 0.2, x = Math.cos(a) * R * k, y = Math.sin(a) * R * k;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + (i % 2 ? 0.7 : -0.7)); ctx.beginPath(); ctx.ellipse(s * 0.55, 0, s * 0.55, s * 0.22, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = '#c8ffd9';
      for (let i = 0; i < 8; i++) { const ph = (t * 0.7 + i / 8) % 1, a = i * 2.4, d = R * (1 - ph) + p.r * ph; ctx.globalAlpha = 0.3 + 0.7 * ph; ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1.2 + ph, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      // 不老不死：本体のうしろに、光の翼が大きく開く（ゆっくり羽ばたく）
      if (has(look, 'immortal')) {
        const flap = 0.12 * Math.sin(t * 2.5);
        for (const sg of [-1, 1]) {
          ctx.save(); ctx.scale(sg, 1); ctx.rotate(-flap);
          for (let j = 0; j < 5; j++) {
            const a = -1.05 + j * 0.4, L = p.r * (3.9 - Math.abs(j - 1.2) * 0.45);
            const gr = ctx.createLinearGradient(0, 0, Math.cos(a) * L, Math.sin(a) * L);
            gr.addColorStop(0, 'rgba(235,255,242,1)'); gr.addColorStop(0.6, 'rgba(141,255,176,0.75)'); gr.addColorStop(1, 'rgba(141,255,176,0.05)');
            ctx.fillStyle = gr; glow('#8dffb0', 10);
            ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(p.r * 0.5, 0); ctx.quadraticCurveTo(L * 0.6, -p.r * 0.75, L, 0); ctx.quadraticCurveTo(L * 0.6, p.r * 0.45, p.r * 0.5, 0); ctx.fill(); ctx.restore();
          }
          noGlow(); ctx.restore();
        }
        // 頭上の光の輪
        ctx.strokeStyle = '#e8fff0'; ctx.lineWidth = 1.8; glow('#8dffb0', 10);
        ctx.beginPath(); ctx.ellipse(0, -p.r * 1.9, p.r * 0.75, p.r * 0.22, 0, 0, TAU); ctx.stroke(); noGlow();
      }
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    }

    // かけら
    shards.forEach(([x, y], i) => {
      const X = x * R * 0.55, Y = y * R * 0.55;
      // 拾い上手：かけらのまわりに、消えるまでの時間を示す輪（極：消えないので、ずっと満ちた金の輪）
      if (look.entry) {
        ctx.strokeStyle = kw(look, 'keeper') ? GOLD : 'rgba(255,226,122,0.6)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(X, Y, s * 1.7, -Math.PI / 2, -Math.PI / 2 + TAU * (kw(look, 'keeper') ? 1 : 0.75 - i * 0.15)); ctx.stroke();
      }
      // 黄金時代：かけらが大きく、金色に光る
      const big = has(look, 'goldenage');
      if (big) glow(GOLD, 10);
      shard(X, Y, s * (big ? 1.5 : 1), mode, t);
      noGlow();
      // 二重取り：かけらが2つ重なって見える
      if (has(look, 'double')) shard(X + s * 0.8, Y - s * 0.5, s * 0.85, mode, t);
    });
    // 連鎖回収：かけら同士が細い鎖でつながる
    if (has(look, 'chainpick')) {
      ctx.strokeStyle = kw(look, 'chainpick') ? WHITE : 'rgba(255,226,122,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); shards.forEach(([x, y], i) => { const X = x * R * 0.55, Y = y * R * 0.55; if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }); ctx.lineTo(0, 0); ctx.stroke(); ctx.setLineDash([]);
    }
    // 金の弾：本体から、金貨の弾が飛ぶ
    if (has(look, 'goldshot')) {
      for (let i = 0; i < 2; i++) { const ph = (t * 1.2 + i / 2) % 1, a = -0.9 + i * 0.5, d = p.r * 1.3 + ph * R; ctx.strokeStyle = `rgba(${THEME.playerRgb}, 0.4)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (d - 8), Math.sin(a) * (d - 8)); ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); ctx.stroke(); shard(Math.cos(a) * d, Math.sin(a) * d, s * 0.8, 'coin', t); }
    }
    // 変換：かけらが、くるくる回りながら金貨に変わっていく（半分かけら、半分金貨）
    if (has(look, 'convert')) {
      const x = -R * 0.2, y = R * 0.75;
      ctx.strokeStyle = `rgba(${THEME.playerRgb}, 0.7)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, s * 1.7, t * 3, t * 3 + 4.5); ctx.stroke();
      shard(x - s * 0.6, y, s * 0.8, 'shard', t); shard(x + s * 0.7, y, s * 0.8, 'coin', t);
    }
    // 貯金：本体のまわりに、金貨が積み重なって回る
    if (has(look, 'savings')) {
      const n = kw(look, 'savings') ? 8 : 5;
      for (let i = 0; i < n; i++) { const a = t * 0.8 + (i * TAU) / n; shard(Math.cos(a) * p.r * 1.75, Math.sin(a) * p.r * 1.75, s * 0.6, 'coin', t); }
    }
    // 黄金の雨：金貨が上から降る
    if (has(look, 'goldrain')) {
      for (let i = 0; i < 5; i++) { const ph = (t * 0.9 + i / 5) % 1, x = (((i * 37) % 10) / 10 - 0.5) * R * 2; shard(x, -R * 1.3 + ph * R * 2.4, s * 0.7, 'coin', t); }
    }
    // 吸血：近くの敵から、赤い命の粒がうねる流れになって本体へ吸い込まれる（敵はしぼんで明滅）
    if (has(look, 'vampire')) {
      const ex = -R * 1.05, ey = -R * 0.85, kv = kw(look, 'vampire');
      const shrink = 0.8 + 0.2 * Math.sin(t * 6);
      glow(THEME.enemy, 10); ctx.fillStyle = THEME.enemy; ctx.beginPath(); ctx.arc(ex, ey, s * 1.1 * shrink, 0, TAU); ctx.fill(); noGlow();
      for (const o of [-1, 1]) {
        const cx = ex * 0.5 + o * R * 0.35, cy = ey * 0.5 - o * R * 0.25;
        ctx.strokeStyle = kv ? 'rgba(255,208,216,0.7)' : 'rgba(255,59,92,0.5)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.quadraticCurveTo(cx, cy, 0, 0); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const u = (t * 1.1 + i / 4 + (o > 0 ? 0.12 : 0)) % 1, v = 1 - u;
          const x = v * v * ex + 2 * v * u * cx, y = v * v * ey + 2 * v * u * cy;
          glow(THEME.enemy, 8); ctx.fillStyle = kv ? '#ffd0d8' : THEME.enemy;
          ctx.beginPath(); ctx.arc(x, y, 1.4 + u * 1.4, 0, TAU); ctx.fill(); noGlow();
        }
      }
    }
    ctx.restore();
  }

  // 収穫の道で、本体そのものに重ねるもの（体のあとに描く）
  function drawHarvestOnBody(p, look, t) {
    now = t;
    if (!look) return;
    ctx.save(); ctx.translate(p.x, p.y);
    const r = p.r * 1.25;
    // 賢者の石：本体の中心に、赤い宝石
    if (look.type === 'alchemy' && kw(look, 'alchemy')) {
      glow('#ff4a6a', 10); ctx.fillStyle = '#ff4a6a'; ctx.strokeStyle = '#6b0018'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -r * 0.45); ctx.lineTo(r * 0.38, 0); ctx.lineTo(0, r * 0.45); ctx.lineTo(-r * 0.38, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); noGlow();
    }
    if (look.type === 'absorb') {
      // 過剰回復：本体を包む、ゆれる緑の水の玉。あふれた分が、ふちからしずくになってこぼれ落ちる
      if (has(look, 'overheal')) {
        ctx.fillStyle = 'rgba(141,255,176,0.16)'; ctx.strokeStyle = 'rgba(170,255,200,0.85)'; ctx.lineWidth = 1.4; glow('#8dffb0', 8);
        ctx.beginPath(); for (let i = 0; i <= 48; i++) { const a = (i * TAU) / 48, rr = r * 1.5 * (1 + 0.06 * Math.sin(a * 4 + t * 3)); if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.fill(); ctx.stroke(); noGlow();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-r * 0.7, -r * 0.85, r * 0.35, r * 0.12, -0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b8ffd0';
        for (const [sx, d] of [[-1, 0], [1, 0.5]]) {
          const ph = (t * 0.9 + d) % 1, x = sx * r * 1.25, y = -r * 0.6 + ph * r * 2.8;
          ctx.globalAlpha = 1 - ph * 0.7; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.quadraticCurveTo(x + 2.6, y + 1, x, y + 2.6); ctx.quadraticCurveTo(x - 2.6, y + 1, x, y - 4); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // 生命力：心臓の鼓動のように、本体が2回打って、緑の波が広がる。十字の光がのぼる
      if (has(look, 'vitality')) {
        const kv = kw(look, 'vitality'), ph = (t * 1.1) % 1;
        const beat = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) : ph > 0.2 && ph < 0.32 ? 0.6 * Math.sin(((ph - 0.2) / 0.12) * Math.PI) : 0;
        ctx.strokeStyle = kv ? WHITE : '#8dffb0'; ctx.lineWidth = 2.4 - ph * 2; glow('#8dffb0', 10);
        ctx.globalAlpha = 1 - ph; ctx.beginPath(); ctx.arc(0, 0, r * (1.05 + ph * 1.4), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * (1.05 + beat * 0.25), 0, TAU); ctx.stroke(); noGlow();
        ctx.fillStyle = kv ? WHITE : '#8dffb0';
        for (let i = 0; i < 3; i++) { const q = (t * 0.6 + i / 3) % 1, x = (i - 1) * r * 0.9, y = -r * 0.6 - q * r * 1.6, c = 1.6 + (1 - q) * 1.2; ctx.globalAlpha = 1 - q; ctx.fillRect(x - c * 0.35, y - c, c * 0.7, c * 2); ctx.fillRect(x - c, y - c * 0.35, c * 2, c * 0.7); }
        ctx.globalAlpha = 1;
      }
      // 生命の泉：本体のてっぺんから、緑の光が噴水のように吹き上がり、弧を描いてまわりに降る
      if (kw(look, 'absorb')) {
        for (let i = 0; i < 10; i++) {
          const ph = (t * 0.9 + i / 10) % 1, sg = i % 2 ? 1 : -1, vx = sg * (0.6 + (i % 5) * 0.25) * r, vy = -3.4 * r;
          const x = vx * ph * 1.6, y = -r * 0.5 + vy * ph + 4.2 * r * ph * ph;
          ctx.globalAlpha = ph < 0.8 ? 1 : (1 - ph) * 5; glow('#8dffb0', 8); ctx.fillStyle = i % 3 ? '#c8ffd9' : WHITE;
          ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill();
        }
        noGlow(); ctx.globalAlpha = 1;
      }
    }
    if (anyEvo(look)) goldRim(p.r * 2.6 + 4);
    ctx.restore();
  }

  // ============================================================
  // 罠の道：軌跡の上に置かれる罠（見本用。line：軌跡の点の列、中心はずらさない）
  // ============================================================
  function caltrop(x, y, s, a, look) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    const hot = kw(look, 'caltrop') || kw(look, 'barb');
    ctx.fillStyle = hot ? WHITE : '#c9d3ff'; ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
    ctx.beginPath(); for (let i = 0; i < 8; i++) { const b = (i * Math.PI) / 4, rr = i % 2 ? s * 0.35 : s; ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); } ctx.closePath(); ctx.fill(); ctx.stroke();
    // 返し針：とげの先に、かえし
    if (has(look, 'barb')) { ctx.strokeStyle = hot ? WHITE : '#c9d3ff'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const b = (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(Math.cos(b) * s, Math.sin(b) * s); ctx.lineTo(Math.cos(b + 0.6) * s * 0.75, Math.sin(b + 0.6) * s * 0.75); ctx.stroke(); } }
    ctx.restore();
  }
  function mine(x, y, s, look, t, ghostIdx) {
    ctx.save(); ctx.translate(x, y);
    // 吸着地雷：まわりに吸いつく足
    if (has(look, 'sticky')) { ctx.strokeStyle = '#ff9a5a'; ctx.lineWidth = 1.4; for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4 + Math.PI / 4 + 0.15 * Math.sin(t * 4 + i); ctx.beginPath(); ctx.moveTo(Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8); ctx.quadraticCurveTo(Math.cos(a + 0.4) * s * 1.4, Math.sin(a + 0.4) * s * 1.4, Math.cos(a) * s * 1.7, Math.sin(a) * s * 1.7); ctx.stroke(); } }
    ctx.fillStyle = '#3a3550'; ctx.strokeStyle = has(look, 'rig') ? '#3fe0ff' : '#ff9a5a'; ctx.lineWidth = has(look, 'rig') ? 2 : 1.4;
    ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.stroke();
    const blink = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(255,90,60,${0.5 + 0.5 * blink})`; glow('#ff5a3c', 8); ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, TAU); ctx.fill(); noGlow();
    // 時限爆弾：まわりに、残り時間の輪
    if (has(look, 'timebomb')) { ctx.strokeStyle = kw(look, 'timebomb') ? WHITE : '#ffd84a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, s * 1.45, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - ((t * 0.4) % 1))); ctx.stroke(); }
    // 暴発：導火線から火花
    if (has(look, 'misfire')) { ctx.strokeStyle = '#c9b8a0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(s * 0.6, -s * 0.6); ctx.quadraticCurveTo(s * 1.2, -s * 1.3, s * 0.9, -s * 1.7); ctx.stroke(); ctx.fillStyle = '#fff1a8'; for (let i = 0; i < 4; i++) { const a = flick(t, i) * 2 + i; ctx.fillRect(s * 0.9 + Math.cos(a) * 3 - 1, -s * 1.7 + Math.sin(a) * 3 - 1, 2, 2); } }
    ctx.restore();
  }
  function flame(x, y, s, t, k, hot) {
    const h = s * (1 + 0.25 * Math.sin(t * 10 + k));
    ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(x - s * 0.6, y); ctx.quadraticCurveTo(x - s * 0.5, y - h * 0.9, x, y - h * 1.6); ctx.quadraticCurveTo(x + s * 0.5, y - h * 0.9, x + s * 0.6, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hot ? WHITE : '#ffe14a'; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.quadraticCurveTo(x - s * 0.25, y - h * 0.5, x, y - h * 0.9); ctx.quadraticCurveTo(x + s * 0.25, y - h * 0.5, x + s * 0.3, y); ctx.closePath(); ctx.fill();
  }

  // 罠の見本を1つ描く（中心が原点。見本のマス用）
  function drawTrapCell(look, t, w) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const pts = []; for (let i = 0; i <= 8; i++) { const k = i / 8; pts.push([(-0.5 + k) * w, Math.sin(k * Math.PI * 1.5) * w * 0.12]); }
    const path = (P) => { ctx.beginPath(); P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    const type = look.type;
    // 軌跡の線（うすい白）
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5; path(pts); ctx.stroke();

    if (!type && look.entry) {
      // 置き土産：押し出された分身の場所に、光の罠（魔法陣）（極：とげが付き、爆発する）
      const s = w * 0.2;
      ctx.strokeStyle = '#3fe0ff'; ctx.lineWidth = 1.4; glow('#3fe0ff', 8);
      ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.stroke();
      ctx.save(); ctx.rotate(t * 0.8); ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * TAU) / 6; ctx.lineTo(Math.cos(a) * s * 0.75, Math.sin(a) * s * 0.75); } ctx.closePath(); ctx.stroke(); ctx.restore();
      noGlow();
      if (kw(look, 'keepsake')) { ctx.fillStyle = WHITE; for (let i = 0; i < 8; i++) { const a = (i * TAU) / 8; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * s, Math.sin(a - 0.12) * s); ctx.lineTo(Math.cos(a) * s * 1.45, Math.sin(a) * s * 1.45); ctx.lineTo(Math.cos(a + 0.12) * s, Math.sin(a + 0.12) * s); ctx.fill(); } }
    }
    if (type === 'caltrop') {
      const s = w * 0.1;
      // 剣山：上から長いとげが一面に降る
      if (has(look, 'spikebed')) {
        for (let i = 0; i < 7; i++) { const x = (i / 6 - 0.5) * w, ph = (t * 1.1 + i * 0.37) % 1, y = -w * 0.55 + ph * w * 0.5; ctx.fillStyle = '#c9d3ff'; ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x - 2.2, y - 9); ctx.lineTo(x + 2.2, y - 9); ctx.lineTo(x, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
      // マキビシ：線の上にまきびしが並ぶ
      const on = pts.filter((_, i) => i % 2 === 1);
      on.forEach(([x, y], i) => caltrop(x, y, s, i * 0.7 + t * 0.2, look));
      // 足止め：まきびし同士が、網の糸でつながる
      if (has(look, 'snare')) { ctx.strokeStyle = kw(look, 'snare') ? WHITE : 'rgba(201,211,255,0.7)'; ctx.lineWidth = 1; for (let i = 0; i < on.length - 1; i++) { ctx.beginPath(); ctx.moveTo(on[i][0], on[i][1]); ctx.lineTo(on[i + 1][0], on[i + 1][1] - 6); ctx.lineTo(on[i + 1][0], on[i + 1][1]); ctx.moveTo(on[i][0], on[i][1] - 6); ctx.lineTo(on[i + 1][0], on[i + 1][1]); ctx.stroke(); } }
      // ばらまき：分身の通り道（下の点線）にも落ちる
      if (has(look, 'scatter')) {
        const P2 = pts.map(([x, y]) => [x, y + w * 0.3]);
        ctx.strokeStyle = 'rgba(63,224,255,0.4)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; path(P2); ctx.stroke(); ctx.setLineDash([]);
        P2.filter((_, i) => i % 2 === 0).forEach(([x, y], i) => caltrop(x, y, s * 0.85, i, look));
      }
      // 千本針：まきびしから、針が飛び散る
      if (kw(look, 'caltrop')) { ctx.strokeStyle = WHITE; ctx.lineWidth = 1; on.forEach(([x, y], i) => { for (let k = 0; k < 3; k++) { const a = i + k * 2.1 + t * 0.5, d = s * (1.6 + ((t * 2 + k) % 1) * 1.5); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.lineTo(x + Math.cos(a) * (d + 3), y + Math.sin(a) * (d + 3)); ctx.stroke(); } }); }
    }
    if (type === 'mine') {
      const s = w * 0.09;
      const ends = [pts[0], pts[pts.length - 1]];
      // 連鎖爆雷：地雷どうしが、光る線でつながる
      if (kw(look, 'mine')) { ctx.strokeStyle = 'rgba(255,154,90,0.8)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(ends[0][0], ends[0][1]); ctx.lineTo(0, w * 0.32); ctx.lineTo(ends[1][0], ends[1][1]); ctx.stroke(); ctx.setLineDash([]); mine(0, w * 0.32, s, look, t); }
      ends.forEach(([x, y]) => mine(x, y, s, look, t));
      // 仕込み：押し出された分身の場所が、分身色のふちの地雷になる
      if (has(look, 'rig')) mine(0, -w * 0.28, s, { parts: { rig: true } }, t);
    }
    if (type === 'flamepath') {
      const s = w * 0.06;
      const evo = kw(look, 'flamepath');
      if (has(look, 'firesea')) {
        // 火の海：軌跡が輪になり、その内側いっぱいに炎の波がうねる
        const rx = w * 0.42, ry = w * 0.28;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(0, -w * 0.02, rx, ry, 0, 0, TAU); ctx.clip();
        const g = ctx.createLinearGradient(0, -ry, 0, ry);
        g.addColorStop(0, 'rgba(255,90,40,0.55)'); g.addColorStop(1, 'rgba(255,200,60,0.85)');
        ctx.fillStyle = g; ctx.fillRect(-rx, -ry * 1.2, rx * 2, ry * 2.4);
        for (let row = 0; row < 3; row++) {   // 炎の波（横にうねりながら上へ揺れる）
          ctx.fillStyle = row % 2 ? 'rgba(255,225,74,0.9)' : 'rgba(255,138,31,0.9)';
          ctx.beginPath(); const y0 = -ry * 0.6 + row * ry * 0.55;
          ctx.moveTo(-rx, y0 + ry);
          for (let x = -rx; x <= rx; x += 3) ctx.lineTo(x, y0 + Math.sin(x * 0.35 + t * 6 + row) * 3 - Math.abs(Math.sin(x * 0.18 + t * 3 + row * 2)) * 6);
          ctx.lineTo(rx, y0 + ry); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = '#ff8a1f'; ctx.lineWidth = 2; glow('#ff8a1f', 10); ctx.beginPath(); ctx.ellipse(0, -w * 0.02, rx, ry, 0, 0, TAU); ctx.stroke(); noGlow();
      } else if (evo) {
        // 業火：線の上が、ひとつながりの太い炎の壁になる（小さな炎の列ではなく）
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,90,40,0.5)'; ctx.lineWidth = w * 0.22; glow('#ff5a28', 14); path(pts); ctx.stroke(); noGlow();
        ctx.strokeStyle = 'rgba(255,170,40,0.85)'; ctx.lineWidth = w * 0.12; path(pts); ctx.stroke();
        ctx.strokeStyle = WHITE; ctx.lineWidth = w * 0.035; path(pts); ctx.stroke();
        // 壁の上の、高く揺れる炎の先
        pts.forEach(([x, y], i) => { const h = w * (0.14 + 0.06 * Math.sin(t * 9 + i * 1.3)); ctx.fillStyle = 'rgba(255,200,60,0.9)'; ctx.beginPath(); ctx.moveTo(x - w * 0.05, y - w * 0.04); ctx.quadraticCurveTo(x, y - h * 1.2, x + Math.sin(t * 6 + i) * 2, y - h * 1.6); ctx.quadraticCurveTo(x + w * 0.02, y - h * 0.7, x + w * 0.05, y - w * 0.04); ctx.fill(); });
        ctx.restore();
      } else if (!has(look, 'ember')) {
        // 炎の道：線の上に、小さな炎が並ぶ
        pts.forEach(([x, y], i) => flame(x, y, s, t, i, false));
      }
      // 延焼：炎が、線から横へ燃え広がっていく（広がる先ほど小さく、薄い）
      if (has(look, 'spread')) {
        [2, 6].forEach((j) => { const [x, y] = pts[j]; for (let k = 1; k <= 3; k++) { for (const sg of [-1, 1]) { ctx.save(); ctx.globalAlpha *= 1 - k * 0.25; flame(x + sg * k * 4, y + sg * k * w * 0.1, s * (1 - k * 0.18), t, j + k + (sg > 0 ? 5 : 0), kw(look, 'spread')); ctx.restore(); } } });
      }
      // 火柱：線の折れ曲がりから、高い火の柱が立ちのぼる（まわりの炎より何倍も高い）
      if (has(look, 'pillar')) {
        const [x, y] = pts[4], H = w * 0.95, bw = w * 0.13;
        const g = ctx.createLinearGradient(0, y, 0, y - H);
        g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(0.4, 'rgba(255,150,40,0.9)'); g.addColorStop(1, 'rgba(255,80,30,0)');
        ctx.fillStyle = g; glow('#ff8a1f', 14);
        ctx.beginPath(); ctx.moveTo(x - bw, y);
        for (let k = 0; k <= 10; k++) { const yy = y - (H * k) / 10; ctx.lineTo(x - bw * (1 - k * 0.06) + Math.sin(t * 8 + k) * 2, yy); }
        for (let k = 10; k >= 0; k--) { const yy = y - (H * k) / 10; ctx.lineTo(x + bw * (1 - k * 0.06) + Math.sin(t * 8 + k + 2) * 2, yy); }
        ctx.closePath(); ctx.fill(); noGlow();
        ctx.strokeStyle = 'rgba(255,200,80,0.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(x, y, bw * 1.6, bw * 0.5, 0, 0, TAU); ctx.stroke();
        if (kw(look, 'pillar')) core(() => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - H * 0.7); ctx.stroke(); }, 1.5);
      }
      // 残り火：炎が消えたあとに、赤い火の粉だけが点々と残り、ゆっくり明滅する
      if (has(look, 'ember')) {
        pts.forEach(([x, y], i) => { const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7); ctx.fillStyle = `rgba(255,${70 + 60 * a},40,${0.55 + 0.45 * a})`; glow('#ff5a3c', 6 * a); ctx.beginPath(); ctx.arc(x, y, 2 + a * 0.8, 0, TAU); ctx.fill(); noGlow(); });
      }
    }
    ctx.restore();
  }

  return { phenomBack, phenomFront, drawBody, drawOrbit, drawHarvest, drawHarvestOnBody, drawTrapCell, coreKind, drawCore };
}
