// 操作の受け付け担当。
// ・追従：本体が指／カーソルの位置へ向かう（スマホは指で隠れないよう少し上にずらす）
// ・相対：指を動かした分だけ本体が動く
// ・パソコンのキー操作：矢印キー / WASD

// target：遊ぶ範囲（canvas）。extra：ここで触れても操作できる場所（軌跡のバーの枠など）
export function createInput(target, extra = []) {
  let pointerId = null;
  let pointerType = 'mouse';
  let lastX = 0, lastY = 0;   // 直前の位置（画面上のピクセル）
  let curX = 0, curY = 0;     // 今の位置（画面上のピクセル）
  let dragX = 0, dragY = 0;   // 前回から動いた量
  const keys = new Set();
  // スティック：触れた所が中心（離すまで動かない）。中心から指までのずれで進む
  //   外の輪の半径は画面の横幅の14%。中の丸は大きめ（外の輪の70%）で、中の丸のふちが外の輪に届くと最高速度。
  //   動かす距離は「外の輪の半径 − 中の丸の半径」なので、少し動かすだけで最高速度になる
  let stickOX = 0, stickOY = 0;
  const KNOB = 0.7;
  const DEAD = 0.08;   // 止まっている扱いにする範囲（動かす距離の8%。指のごく小さなぶれだけ動かない）
  // 画面の幅は大きさが変わったときだけ測る（毎フレーム測ると重くなる）
  let widthCache = 0;
  window.addEventListener('resize', () => { widthCache = 0; });
  const stickR = () => Math.max(30, (widthCache || (widthCache = target.getBoundingClientRect().width)) * 0.14);
  const stickTravel = () => stickR() * (1 - KNOB);
  const listeners = [];
  // タップ（短く触れて、ほとんど動かさずに離す）：描く／動くモードの切り替えに使う
  const TAP_TIME = 220, TAP_MOVE = 12;   // ミリ秒／画面上のピクセル
  let downAt = 0, moved = 0, tapPending = false;

  const release = () => { pointerId = null; cancelAt = 0; };
  // iPhone などが途中で指を横取りした（pointercancel）ときは、すぐ「離した」にせず少し待つ。
  //   その間にまた触れたら、同じ指の続きとして扱う（本体が止まらず、描いている線も切れない）
  const CANCEL_WAIT = 250;   // ミリ秒
  // 画面の端：指が端からこの幅の中に入ると、その向きへ進み続ける（触れ始めた場所がもう端なら、その向きは使わない）
  const EDGE = 96;   // 画面上のピクセル（40→64→96：端に着く前から早めに受け付ける）
  let startX = 0, startY = 0;
  const edgeOf = (v, size, start) => {
    const lo = v < EDGE && start >= EDGE ? -(EDGE - v) / EDGE : 0;
    const hi = v > size - EDGE && start <= size - EDGE ? (v - (size - EDGE)) / EDGE : 0;
    const k = lo || hi;
    return k ? Math.sign(k) : 0;   // 入ったらすぐ最高速度
  };
  let cancelAt = 0;

  const onDown = (e) => {
    // 離した合図を取りこぼしていても、新しく触れたらその指／ボタンで操作を始め直す
    const resumed = cancelAt > 0;   // 横取りされたあと、待っている間にまた触れた
    cancelAt = 0;
    pointerId = e.pointerId;
    pointerType = e.pointerType || 'mouse';
    lastX = curX = e.clientX;
    lastY = curY = e.clientY;
    stickOX = curX; stickOY = curY;
    if (!resumed) { downAt = performance.now(); moved = 0; startX = curX; startY = curY; } else moved = TAP_MOVE;   // 続きのときはタップにしない
    try { target.setPointerCapture(e.pointerId); } catch (_) { /* 何もしない */ }
    listeners.forEach((fn) => fn());
    e.preventDefault();
  };
  target.addEventListener('pointerdown', onDown);
  // 軌跡のバーの枠の上でも操作できる（ボタンの上は除く）
  for (const el of extra) el.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) onDown(e); });
  // iPhone：長押しや、すばやいタップの重なりで出る「拡大鏡（透明な丸い虫めがね）」と拡大を止める（ボタンの上は除く）
  for (const el of [target, ...extra]) el.addEventListener('touchstart', (e) => { if (!e.target.closest('button')) e.preventDefault(); }, { passive: false });

  target.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return;
    curX = e.clientX;
    curY = e.clientY;
    dragX += curX - lastX;
    dragY += curY - lastY;
    moved = Math.max(moved, Math.hypot(curX - stickOX, curY - stickOY));
    lastX = curX;
    lastY = curY;
    e.preventDefault();
  });

  const end = (e) => {
    if (e.pointerId !== pointerId) return;
    if (e.type === 'pointercancel' || e.type === 'lostpointercapture') { if (!cancelAt) cancelAt = performance.now(); return; }
    if (e.type === 'pointerup' && performance.now() - downAt < TAP_TIME && moved < TAP_MOVE) tapPending = true;
    release();
  };
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
  target.addEventListener('lostpointercapture', end);
  window.addEventListener('pointerup', end);
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  const KEYMAP = {
    ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
    ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
  };
  window.addEventListener('keydown', (e) => {
    // スペースキー：描く／動くモードの切り替え（パソコン用）
    if (e.code === 'Space' && !e.repeat) { tapPending = true; listeners.forEach((fn) => fn()); e.preventDefault(); return; }
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); listeners.forEach((fn) => fn()); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  window.addEventListener('blur', () => { keys.clear(); release(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); release(); } });

  return {
    // toWorld(clientX, clientY) → ゲーム内の座標、scale：画面1ピクセルのゲーム内での長さ
    consume(toWorld, scale) {
      if (cancelAt && performance.now() - cancelAt > CANCEL_WAIT) release();   // 待っても戻ってこなかった：離したことにする
      let x = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
      let y = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
      const len = Math.hypot(x, y);
      if (len > 0) { x /= len; y /= len; }

      const touching = pointerId !== null;
      // スティックの向きと強さ（-1〜1）。中心のすぐ近くは止まっている扱い
      let sx = 0, sy = 0;
      if (touching) {
        const R = stickTravel(), vx = (curX - stickOX) / R, vy = (curY - stickOY) / R, m = Math.hypot(vx, vy);
        if (m > DEAD) { const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m; sx = vx * k; sy = vy * k; }   // 輪の外は最高速度のまま
      }
      // 画面の端（ドラッグのとき）：横・縦それぞれ -1〜1
      let ex = 0, ey = 0;
      if (touching && pointerType !== 'mouse') {
        ex = edgeOf(curX, window.innerWidth, startX);
        ey = edgeOf(curY, window.innerHeight, startY);
      }
      const out = {
        edgeX: ex,
        edgeY: ey,
        stickX: sx,
        stickY: sy,
        dx: dragX * scale,
        dy: dragY * scale,
        keyX: x,
        keyY: y,
        pointer: touching ? toWorld(curX, curY) : null,
        isTouch: pointerType === 'touch' || pointerType === 'pen',
        // held：指が触れている、またはキーが押されている（＝軌跡を描いている）
        held: touching || keys.size > 0,
        tap: tapPending,   // この刻みでタップがあった（描く／動くの切り替え）
      };
      dragX = 0; dragY = 0; tapPending = false;
      return out;
    },
    onFirstAction(fn) { listeners.push(fn); },
    // スティックを描くための位置（画面上のピクセル）
    stickView() {
      if (pointerId === null) return null;
      // つまみは輪の中にとどめて描く
      const L = stickTravel(), vx = curX - stickOX, vy = curY - stickOY, d = Math.hypot(vx, vy), k = d > L ? L / d : 1;
      return { ox: stickOX, oy: stickOY, cx: stickOX + vx * k, cy: stickOY + vy * k, R: stickR() };
    },
  };
}
