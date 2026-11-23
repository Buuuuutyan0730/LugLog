// 調整用の数値。ゲームの計算は毎回ここを読むので、調整パネルで変えるとすぐ反映される

export const CONFIG = {
  // 遊ぶ範囲の論理サイズ。画面全体は 9:16 固定で、そこから下の枠（横幅の30%）を除いた部分
  view: { width: 360, height: 532 },

  // 試作で比べる切り替え項目
  experiments: {
    control: {
      label: '操作方式',
      value: 'stick',      // スティック：触れた所が中心の見えないスティック／相対：指を動かした分だけ動く／追従：指の位置へ向かう
      options: [
        { value: 'stick', label: 'スティック' },
        { value: 'follow', label: '追従' },
        { value: 'relative', label: '相対' },
      ],
    },
    playerAttack: {
      label: '本体の攻撃',
      value: 'off',      // 本体は基本攻撃しない
      options: [
        { value: 'on', label: 'あり' },
        { value: 'off', label: 'なし' },
      ],
    },
    enemyPlan: {
      label: '敵の種類',
      value: 'progress',
      options: [
        { value: 'progress', label: 'フェーズで増える' },
        { value: 'all', label: '最初から全部' },
      ],
    },
    ghostAttack: {
      label: '分身の攻撃',
      value: 'shot',
      options: [
        { value: 'shot', label: '弾' },
        { value: 'ram', label: '体当たり' },
      ],
    },
  },

  // その場で変えられる数値
  tuning: {
    dragLimit: { label: '1回で描ける長さ', min: 100, max: 1200, step: 20, value: 400, unit: '' },
    trailBudget: { label: '軌跡の総量', min: 300, max: 4000, step: 100, value: 1000, unit: '' },
    ghostSpeed: { label: '分身の速さ', min: 40, max: 600, step: 10, value: 150, unit: '' },
    moveSpeed: { label: '移動速度の上限', min: 200, max: 2000, step: 10, value: 400, unit: '' },   // 本体の最高速度（450→380→400）（1秒に動ける距離）。動きに関わるスキルの基準
    sensitivity: { label: '指の感度（相対のとき）', min: 0.6, max: 2.5, step: 0.1, value: 1.0, unit: 'x' },   // 指を動かした量の何倍、本体が動くか（1.2は高すぎたので1.0に戻した）
    touchOffset: { label: '指からのずらし（追従のとき）', min: 0, max: 100, step: 5, value: 45, unit: '' },
    contactDamage: { label: '敵に触れた時のダメージ', min: 5, max: 50, step: 5, value: 20, unit: '' },
    regenDelay: { label: '回復が始まるまで', min: 0.5, max: 8, step: 0.5, value: 3, unit: 's' },
    regenRate: { label: '1秒あたりの回復（最大HPの割合）', min: 1, max: 40, step: 1, value: 10, unit: '%' },
    enemyRate: { label: '敵の出る量', min: 0.2, max: 3, step: 0.1, value: 1, unit: 'x' },
    enemySpeed: { label: '敵の速さ', min: 0.3, max: 2, step: 0.1, value: 1, unit: 'x' },
  },

  // ===== ここから下は仮の数値。遊びながら調整する =====

  // 大きさ＝強さ：半径 = sizeK × √パワー（見た目の面積がパワーに比例）。本体・分身・弾・敵すべて共通
  power: { sizeK: 2.2, minRadius: 4 },
  ally: { damageMul: 1.8 },             // 味方（分身・スキル）が与えるダメージの倍率
  enemySize: 1.15,                      // ふつうの敵の見た目と当たりの大きさの倍率（中ボス・ボスは変えない）   // 攻撃力10→半径7、20→約10、80→約20

  // 描く／動くモード：タップで切り替える。描くモードのときだけ軌跡を描けて、指を離すと分身が生まれる
  //   描いている間は、動きが遅くなり、受けるダメージが増える。分身の弾は、線がまっすぐなほどよく当たる（曲がった線ほど左右にぶれる）
  drawMode: { start: true, speed: 0.6, damage: 1.5, spread: 30, aimMin: 0.5, aimMax: 1.2 },   // 始めは描くモード／動きの速さの倍率／受けるダメージの倍率／ぐにゃぐにゃな線の分身の弾のぶれ（左右に最大何度）／命中率0%と100%の弾の威力の倍率
  player: {
    stickAccelTime: 0.12,  // スティック：止まった状態から最高速度になるまでの秒数（0.35→0.12：もっさりしないように）
    maxHp: 100,
    power: 20,             // 本体の強さ（今は攻撃しないので大きさだけに使う。半径 約10）
    fireInterval: 0.4,
    hitRatio: 0.5,         // 当たり判定の半径 = 見た目の半径 × この値（大きくなると当たりやすくなる）
    invincibleTime: 0.6,
    knockback: 36,
  },

  ghost: {
    sizeMul: 1.9,          // 分身の大きさの倍率（1.2→1.9）。形は render.js でこの割合のまま丸ごと大きく描く（見た目と当たりの大きさ。攻撃力から決まる大きさに掛ける）
    powerUnit: 20,         // 軌跡の長さ20ごとに攻撃力1（＝長さ100ごとに5）
    fireInterval: 1.0,
    ramInterval: 0.5,      // 体当たり型：同じ敵に当たり直せる間隔
    ramMultiplier: 2,      // 体当たり型は当てにくいぶん威力2倍
    ramReach: 4,
  },

  shot: { speed: 460, range: 250 },
  record: { minStroke: 50 },

  // フェーズ
  phase: {
    // クリアに必要なかけら＝「そのフェーズで約 needSec 秒の間に出てくる敵が落とすかけら」× needRatio
    //   （出てきた敵のおよそ6割を倒せば次へ進む。敵の量が増えれば必要な数も同じ割合で増える）
    needSec: 40, needRatio: 0.6,   // 28→40：1フェーズを長くして、中ボスをかけらだけで越えにくく
    baseNeed: 15,          // （古い決め方。今は使わない）
    needStep: 10,
    hpRateBase: 40,        // フェーズ1で1秒あたりに出てくる敵の体力の合計
    // 1フェーズごとの倍率（時期で変える）。序盤は自分が強くなる実感、後半はじわじわ押し負ける
    hpRateGrowth: [
      { until: 2, rate: 1.12 },    // フェーズ1→2
      { until: 10, rate: 1.07 },   // フェーズ3〜10は増え方をゆるやかに
      { until: 30, rate: 1.16 },
      { until: Infinity, rate: 1.08 },   // 1.2→1.08：フェーズ60〜100の新しいボスまで届くように（10フェーズで約6.2倍→約2.2倍）
    ],
    // 敵の数の伸び：フェーズ11からは、数はこの倍率までしか増やさず、残りは1体ずつの体力で伸ばす（多すぎて逃げ回るだけになるため）
    countFrom: 3, countGrowth: 1.03,   // 11→3：大きい敵の割合で強くするより、どの敵も少しずつ硬くする
    zoomEvery: 0,          // 何フェーズごとにステージが広がるか（0＝広げない。敵の数を抑えたので、引いて見せる必要がなくなった）
    zoomFactor: 1.25,      // 1回で広がる倍率
    clearBonus: 100,       // フェーズクリアのスコア（× フェーズ数）
  },

  // かけら
  shard: {
    // 落とす数は敵の種類ごとに決まっている（enemyTypes の shards）。2倍・4倍の大きい敵はその倍
    life: 10,
    blinkAt: 3,
    magnet: 50,            // 吸い寄せ始める距離（本体の半径に足す）
    flySpeed: 380,
  },

  // 敵の種類。強さの違いは大きさ（＝体力）で表す。体力から半径が決まる。倒したときのスコア＝体力
  //   unlockPhase：出始めるフェーズ、weight：出やすさ、damage：触れた時のダメージの倍率
  enemies: {
    drift:   { name: '漂い', shards: 1, hp: 15, sizeMul: 1.25, speed: 40, damage: 0,    unlockPhase: 1, weight: 6,
               wander: [1.5, 3] },                              // 行き先を変えるまでの秒数（攻撃しない）
    chaser:  { name: '追跡', shards: 1, hp: 20, sizeMul: 1.25, speed: 70, damage: 1.0,  unlockPhase: 1, weight: 12 },
    shooter: { name: '射撃', shards: 2, hp: 30, sizeMul: 1.25, speed: 55, damage: 0.75, unlockPhase: 3, weight: 2,
               keepDistance: 170, fireInterval: 2.4, windup: 0.4 },
    swarm:   { name: '群れ', shards: 1, packShards: 3, hp: 4,  speed: 85, damage: 0.4,  unlockPhase: 6, weight: 2,
               group: 10, spread: 26, sizeMul: 1.4 },          // 1回に固まって出る数と、散らばる広さ。sizeMul：見た目と当たりの大きさの倍率（ほかの敵も同じ）
    shield:  { name: '盾持ち', shards: 2, hp: 40, speed: 45, damage: 1.0, unlockPhase: 16, weight: 2,
               shield: 1.0, guard: 60 },                       // 盾の耐久（体力に対する割合）／防げる向き（正面から左右に何度まで）
    thief:   { name: 'かけら泥棒', shards: 2, hp: 25, sizeMul: 1.25, speed: 80, damage: 0.5, unlockPhase: 18, weight: 1,
               wander: [1.5, 3], escape: 30 },                 // かけらがないときのふらつき／画面の外へこれだけ出たら逃げ切り
    bomber:  { name: '自爆', shards: 2, hp: 30, sizeMul: 1.25, speed: 75, damage: 0, unlockPhase: 23, weight: 2,
               trigger: 40, windup: 0.8, blast: 65, blastDamage: 2 }, // 止まる距離／点滅する秒数／爆発の広さ／本体へのダメージ（ぶつかったときの何倍か）。ほかの敵には当たらない
    tank:    { name: '重量', shards: 4, hp: 80, sizeMul: 1.25, speed: 35, damage: 1.5,  unlockPhase: 8, weight: 1 },
    dasher:  { name: '突進', shards: 2, hp: 30, speed: 45, damage: 1.25, unlockPhase: 13, weight: 2,
               triggerDistance: 210, windup: 0.6, dashSpeed: 430, dashTime: 0.5, recover: 0.8 },
    // ボス（ふつうには出てこない：weight 0）。動き方は boss の設定
    core:    { name: 'コア', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    hunter:  { name: 'ハンター', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    shade:   { name: '影', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    echo:    { name: '影の分身', hp: 0, speed: 0, damage: 1, unlockPhase: Infinity, weight: 0 },
    clock:   { name: '時計', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    twin:    { name: '双子', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    comet:   { name: '彗星', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    mirage:  { name: '蜃気楼', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    eclipse: { name: '日蝕', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    abyss:   { name: '深淵', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    shuhitsu: { name: '終筆', hp: 0, speed: 0, damage: 1.5, unlockPhase: Infinity, weight: 0 },
    inkghost: { name: '墨の分身', hp: 0, speed: 0, damage: 1, unlockPhase: Infinity, weight: 0 },
  },
  // ボス：10フェーズごと。かけらではなくボスを倒すとクリア。60フェーズより後は、5体が強くなってもう一周
  // 中ボス：出始めるフェーズ／フェーズのどこまで進んだら出るか（必要なかけらの割合）／体力（同じ種類の何倍）／大きさ（何倍）
  //   かけら（何体分）／倒すとはじけ出る小さい敵の数／中ボスにしない種類
  // 敵の割合（%）。フェーズごとに、どの敵がどれくらいの割合で出るか（群れは1つの固まりを1回と数える）
  //   from：このフェーズから。fixed：その時期の割合（合計100）。漂いがいちばん多く、追跡・重量が続く
  enemyMix: [
    { from: 1,  fixed: { drift: 60, chaser: 40 } },
    { from: 3,  fixed: { drift: 55, chaser: 35, shooter: 10 } },
    { from: 6,  fixed: { drift: 45, chaser: 40, shooter: 10, swarm: 5 } },
    { from: 8,  fixed: { drift: 40, chaser: 30, tank: 15, shooter: 10, swarm: 5 } },
    { from: 13, fixed: { drift: 35, chaser: 30, tank: 15, shooter: 8, swarm: 5, dasher: 7 } },
    { from: 16, fixed: { drift: 35, chaser: 28, tank: 15, shooter: 7, swarm: 5, dasher: 5, shield: 5 } },
    { from: 18, fixed: { drift: 33, chaser: 27, tank: 15, shooter: 7, swarm: 5, dasher: 5, shield: 5, thief: 3 } },
    { from: 23, fixed: { drift: 30, chaser: 27, tank: 15, shooter: 6, swarm: 5, dasher: 5, shield: 5, thief: 2, bomber: 5 } },
  ],
  elite: { from: 12, at: 0.5, hp: 6.4, size: 1.5, shards: 5, burst: [5, 6], skip: ['thief', 'bomber', 'drift', 'swarm'] },
  boss: {
    every: 10,
    order: ['core', 'hunter', 'twin', 'clock', 'shade', 'comet', 'mirage', 'eclipse', 'abyss', 'shuhitsu'],   // 6〜10体目は見た目だけ（ready に入るまで、ふつうのフェーズのまま）
    ready: ['core', 'hunter', 'twin', 'clock', 'shade', 'comet', 'mirage', 'eclipse', 'abyss', 'shuhitsu'],          // 仕組みができているボス（ほかはまだ通常のフェーズのまま）
    hpList: [4300, 5600, 7200],   // 1〜3体目のボスの体力
    hpPow: 1.8,               // 4体目からは 3体目の体力 ×（何体目 − 2）のこの乗。前のボスとの伸びが 3.5倍→2.1倍→1.7倍… と、だんだん小さくなる
    eliteCap: 0.3,            // 中ボスの体力の上限＝次に出てくるボスの体力のこの割合
    // ボスのねらい撃ち：動いている間も、決まった間隔で本体をねらって撃つ（何もしてこない時間をなくす）
    pressure: { every: 1.4, rageEvery: 0.9, speed: 150, ways: 1, rageWays: 3, spread: 0.22 },
    normalRate: 0.3,          // ボスのフェーズでの、ふつうの敵の出る勢い（倍）
    appear: 1.5,              // フェーズが始まってから、ボスが現れるまでの秒数
    clearDelay: 1.2,          // ボスを倒してから、カード選びになるまでの秒数
    // どのボスも「動く→予告→技→すき」をくり返す。すきの秒数（怒ると短い）／怒ったときの予告の秒数の倍／すきの間に受けるダメージの倍
    rest: 1.6, rageRest: 1.1, rageWarn: 0.8, vulnMul: 1.5,
    core: { name: 'コア', radius: 42, y: 0.32, spin: 0.9, arms: 3, fireEvery: 0.16, bulletSpeed: 110, callEvery: 8, callCount: 3,
            rageAt: 0.5, rageSpin: 1.5, rageArms: 5,
            moveSpeed: 55, moveTime: 1.6, spiralTime: 2.2, rageSpiralTime: 2.8, ringWays: 16, rageRingWays: 22, ringCount: 3, ringGap: 0.45, ringSpeed: 95, rageCallCount: 5, blastR: 120, blastDamage: 1.5, blastWays: 14 },   // 回る速さ／渦の本数／撃つ間隔／弾の速さ／追跡を呼ぶ間隔と数／HPがこの割合を切ると怒る（回る速さの倍・渦の本数）
    hunter: { name: 'ハンター', radius: 30, y: 0.3, speed: 150, keep: 120, every: 3, windup: 1, rageWindup: 0.5, dashSpeed: 600, over: 60, maxLen: 340, recover: 0.8, rageAt: 0.5,
              moveTime: 1.6, tripleWindup: 0.45, tripleLen: 0.6, fanWays: 5, fanSpread: 0.9, fanVolleys: 3, fanGap: 0.35, fanSpeed: 170,
              landWays: 8, rageLandWays: 12, landSpeed: 130 },   // 突進して止まったとき、まわりにばらまく弾の数／怒ったとき／速さ
    twin: { name: '双子', radius: 32, orbit: 150, spin: 0.45, follow: 60, every: 4, fan: 5, fanSpread: 0.55, bulletSpeed: 150,
            rageSpin: 1.5, rageEvery: 2, rageWays: 8, revive: 8, reviveHp: 0.3,
            tetherOff: 1.7, tetherWarn: 0.8, tetherOn: 1.5, tetherWidth: 6, tetherDamage: 1.2,
            moveTime: 1.8, pincerSpeed: 480, pincerOver: 90 },
    clock: { name: '時計', radius: 36, y: 0.25, drift: 0.25, driftSpeed: 0.4, every: 5, windup: 1, sweep: 2, hand: 260, rageHand: 150, handWidth: 5, handDamage: 1.5,
             stopEvery: 15, rageStopEvery: 10, stop: 2, ways: 12, rings: [70, 140, 210], bulletSpeed: 130, rageAt: 0.5,
             moveTime: 1.6, warpChance: 0.35, warpY: 0.4, tickRounds: 2, rageTickRounds: 3, tickGap: 0.09, tickSpeed: 120 },
    // 彗星：画面を大きく回り、燃える尾を残す（尾は数秒残り、触れるとダメージ）／流星雨／近日点（真ん中ではじける）
    comet: { name: '彗星', radius: 30, y: 0.3, moveSpeed: 90, moveTime: 1.5, rageAt: 0.5,
             orbitTime: 2.4, orbitRx: 0.4, orbitRy: 0.4, tailLife: 5, rageTailLife: 7, tailWidth: 6, tailDamage: 1.0, innerScale: 0.55,
             rainCount: 5, rageRainCount: 8, rainR: 34, rainSpread: 140, rainDamage: 1.2,
             periWays: 20, ragePeriWays: 28, periSpeed: 150 },
    // 蜃気楼：本物1体と偽物に分かれる（偽物には弾がすり抜ける・偽物も撃つ）／熱波（横の帯）／みんなで撃つ。近づくと逃げる
    mirage: { name: '蜃気楼', radius: 32, y: 0.3, moveSpeed: 80, moveTime: 1.6, rageAt: 0.5, copies: 3, rageCopies: 5,
              fleeDist: 150, fleeSpeed: 170, heatW: 22, heatOn: 0.6, heatDamage: 1.2, volleySpeed: 150, volleySpread: 0.3 },
    // 日蝕：暗転（自分とボスのまわりしか見えない）／コロナ（回る光線）／月の影（大きな円が横切る）
    eclipse: { name: '日蝕', radius: 40, y: 0.32, moveSpeed: 50, moveTime: 1.8, rageAt: 0.5, darkTime: 4.5, rageDarkTime: 6.5, seePlayer: 90, seeBoss: 120,
               beams: 4, rageBeams: 6, beamLen: 440, beamW: 7, beamTime: 2.6, beamTurn: 1.2, beamDamage: 1.2, moonR: 80, moonTime: 3.0, moonDamage: 1.5 },
    // 深淵：吸い込み（自分・弾・かけらを引き寄せる）／境界（近づきすぎると大ダメージの輪）／吐き出し（吸い込んだ弾の数だけ吐く）
    abyss: { name: '深淵', radius: 38, y: 0.35, moveSpeed: 40, moveTime: 1.8, rageAt: 0.5, pullTime: 3, ragePullTime: 4, pullSpeed: 70, ragePullSpeed: 100, shotPull: 160,
             horizonR: 95, horizonTime: 2.5, horizonDamage: 1.5, spitMin: 16, spitMax: 48, spitSpeed: 140 },
    // 終筆（ラスボス）：体力で3段階。1 書く（墨の線が黒い分身になる）→ 2 塗りつぶす（分身を消す）→ 3 結び（大きな円を書き終えると画面全体に攻撃）
    shuhitsu: { name: '終筆', radius: 44, y: 0.28, moveSpeed: 70, moveTime: 1.5, stage2: 0.66, stage3: 0.33, shiftTime: 1.6,
                strokeLen: 260, strokeTime: 1.2, inkMax: [3, 4, 4], inkHp: 0.6, inkR: 12, inkSpeed: 90, inkFireEvery: 2.2, inkShotSpeed: 130,
                blotR: 70, blotDamage: 1.0, splashWays: 7, splashSpread: 1.0, splashSpeed: 160, ensoTime: 7, ensoR: 0.36, ensoDamage: 3 },
    shade: { name: '影', radius: 34, y: 0.3, delay: 2, speed: 200, every: 6, copy: 3, wait: 0.6, echoRadius: 11, echoHp: 0.5, rageEvery: 3, rageAt: 0.5,
             moveTime: 1.8, traceTime: 1.6, traceWidth: 7, traceOn: 0.5, traceDamage: 1.0, blinkDist: 110, blinkWays: 10, blinkSpeed: 120 },
    // 影：本体の何秒前の場所を追うか・追う速さの上限／影の分身：間隔・なぞる秒数・動き出すまでの秒数・大きさ・体力（1秒に出る敵の体力の何倍）
    //   怒り：分身の間隔（2体ずつ。2体目は、さらにその前の同じ秒数をなぞる）／怒るHPの割合
    // 時計：左右にゆっくり動く幅（画面の幅の割合）と速さ／針：間隔・予告の秒数・1周の秒数・長さ（怒ると逆回りの短針も）・当たる太さ・ダメージ（体当たりの何倍）
    //   時間停止：間隔（怒ると短く）・止まる秒数・弾の方向の数・弾を置く距離・動き出したときの弾の速さ／怒るHPの割合
    // 双子：本体のまわりを回る半径／回る速さ（1秒の角度）／回る中心が本体を追う速さ／扇の弾の間隔・数・広がり・速さ
    //   怒り（片方が倒れた後）：回る速さの倍・全方向の弾の間隔と数／復活までの秒数・復活したときの体力
    //   光の線：消えている秒数→予告（細く薄い）の秒数→当たる秒数／当たる太さ／ダメージ（体当たりの何倍）
    // 飛び回る速さ／本体から離れておく距離／突進の間隔／予告の秒数（怒ると2回目は短い）／突進の速さ／本体の先まで突き抜ける長さ／突進の長さの上限／突進のあとのすき／怒るHPの割合
  },
  // 大きい個体（体力2倍・4倍）が出る割合。フェーズが進むほど増える
  enemyTiers: {
    x2: { from: 3, perPhase: 0.06, max: 0.3 },   // 大きい敵の割合の上限：合わせて70%→40%（強さは基本の体力で上げる）
    x4: { from: 7, perPhase: 0.05, max: 0.1 },
    noBig: ['drift', 'swarm'],   // 大きくならない種類（漂い・群れ）
  },
  enemyBullet: { speed: 140, radius: 5, damage: 10, life: 6 },

  // ===== 才能（ブースト・カース）。効果の上がり幅は talents.js、ここは抽選と仮の数値 =====
  talent: {
    // レアリティの出やすさ（%）
    rarity:      { normal: 62, rare: 30, super: 7, mythic: 1 },   // 1枚あたり。3枚ならふつうはノーマル2枚とレア1枚、SRの枠（カースを含む）は9枚に1枚ほど
    rarityAbyss: { normal: 40, rare: 38, super: 18, mythic: 4 },   // 絶望の淵を持っているとき
    curseChance: 0.03,     // カードの枠1つがカースになる確率（1回に出すのは1枚まで）
    skillChance: 0.5,      // カースでない枠が、スキルになる確率（出せるスキルがあるとき）
  },

  // 最大ボーナスの強さ（仮）。「繰り返し」でLv5に何度も達すると、add の分ずつ強くなる
  bonus: {
    crit:       { chance: 0.10, add: 0.05, mult: 2 },             // 会心の一撃
    combo:      { perHit: 0.03, add: 0.01, maxStacks: 10, keep: 1.5 }, // 連撃ブースト：当てるたびに攻撃回数+3%、1.5秒当てないと消える
    shockwave:  { radius: 45, base: 10, ofHp: 0.25 },              // 衝撃波：倒した敵の体力の25%＋10 を周りに
    lastStand:  { time: 3 },                                       // ラストスタンド：押し出された分身が戦い続ける秒数
    fullCharge: { mult: 1.3 },                                     // フルチャージ：上限まで描いた分身の攻撃力
    turnBurst:  { radius: 35, ofPower: 0.5 },                      // ターンバースト：折り返しで分身の攻撃力の50%
    blackHole:  { every: 10, pull: 0.35 },                         // ブラックホール：間隔（秒）／画面中のかけらが、本体までの距離のこの割合だけ寄ってくる
    goldRush:   { worth: 5, minTier: 2 },                          // ゴールドラッシュ：大きな敵が落とす金のかけら（5個分）
  },

  // カースの数値（仮）
  curse: {
    hourglassLife: 20,     // 死の砂時計：分身が消えるまでの秒数
    reaperChance: 0.04,    // 死神の契約：1回当てたときの即死の確率（体力40の敵で。大きいほど効きにくい）
    reaperRefHp: 40,
    ramInterval: 0.3,      // 失われた影：同じ敵に体当たりし直せる間隔
    brushStraight: 0.8,    // 呪われた筆：分身になる線のまっすぐさ（命中）の下限
    triggerBase: 30,       // 狂った引き金：まっすぐな線でも左右にぶれる最大の角度（曲がった線はこの2倍まで）
  },

  // スキルの強さ（仮）。「一番大きい分身」＝今いる分身のうち、軌跡がいちばん長いもの
  skill: {
    volley: { shots: [1, 1, 2, 2, 3], power: 1, wait: [8, 7, 6, 5, 4] },   // 一斉射撃：Lvごとの1体あたりの弾数／弾の強さ（分身の攻撃力に対する割合）／Lvごとの待ち時間（秒。撃ったら、この間は撃てない）
    giant: { per: 0.3, titanMult: 2 },                        // 巨大化：1Lvで攻撃力 +30%／タイタン：1体だけのとき2倍・貫通
    crush: { base: 0.5, per: 0.25, kiwamiMult: 2, push: 40 }, // 押しつぶし：触れた敵へ毎秒（攻撃力×割合）。極は2倍で、はじく
    cannon: { base: 0.3, per: 0.1, radius: 40, radiusPer: 5, kiwamiRadius: 1.6 }, // 重砲：爆発の強さ（弾の強さに対する割合）と広さ
    awe: { per: 0.1, reach: 50, reachPer: 10, kiwamiReach: 1.5 },  // 威圧：1Lvで10%遅く／分身のふちから届く距離
    swarm: { per: 0.015, perLv: 0.005, legion: 0.02, maxCount: 10 }, // 群れ：分身1体ごとの攻撃速度（Lv1 +1.5%、1Lvごとに +0.5%）／レギオン：1体ごとの攻撃力／数える分身の上限（上限なしだと分身が多いほど際限なく強くなる）
    split: { count: 2, kiwamiCount: 3, life: [3, 3.5, 4, 4.5, 5], power: 0.5 }, // 分裂：分かれる数と、戦う秒数（Lvごと）／分かれた分身の攻撃力の倍率
    focus: { perHit: 0.05, cap: [0.2, 0.3, 0.4, 0.5, 0.6], kiwamiCap: 1.4, keep: 2 }, // 集中砲火：1回ごと +5%、上限（Lvごと）、当てないと消えるまでの秒数
    mark: { time: 3, per: 0.1, jump: 120 },                  // 目印：印の秒数／1Lvで受けるダメージ +10%／極：印が移る距離
    thousand: { count: 3, power: 0.35 },                       // 千の影：1回で生まれる数／写しの攻撃力の倍率（そのままだと火力が3倍になる）
    turret: { per: 0.1 },                                     // 固定砲台：動く速さの倍率をそのまま攻撃速度に。さらに1Lvで +10%
    laser: { base: 0.5, per: 0.1, width: 5, kiwamiWidth: 2.2, life: 0.18 }, // レーザー：1体あたりの威力（攻撃力に対する割合）／光の太さ／見える秒数
    shotgun: { pellets: [3, 4, 5, 6, 7], gap: 0.22, power: 0.4 },        // 散弾：Lvごとの方向の数／1発ごとの角度の差／1発の威力
    intercept: { every: [2, 1.6, 1.25, 0.9, 0.6], reach: 70, burst: 30, burstPower: 0.5 }, // 迎撃：撃ち落とす間隔（Lvごと）／分身のふちから届く距離／極の衝撃波
    heaven: { max: 3, every: 8, width: 26, warn: 0.5, life: 0.4 },       // 天の光：本数の上限／間隔／柱の半分の太さ／予告の秒数／光る秒数
    decoy: { hpPerPower: 8, per: 0.25, reach: 80, bite: 0.5, burst: 70, burstPower: 1 }, // おとり：分身のHP（攻撃力×8）、1Lvで +25%／引きつける距離（分身のふちから）／同じ敵にかまれる間隔／身代わりの衝撃波
    taunt: { per: 0.3, kiwami: 0.2 },                         // 挑発：1Lvで範囲 +30%／極：引きつけた敵が受けるダメージ +20%
    counter: { ratio: [0.5, 0.75, 1, 1.25, 1.5], burst: 40, burstPower: 0.5 }, // 反撃：受けたダメージに対して返す割合（Lvごと）／極の衝撃波
    repair: { base: 0.05, per: 0.03, share: 0.2 },            // 修復：毎秒、最大HPの5%（1Lvで +3%）／極：回復量の20%を本体も
    // ---- 本体の道（本体の攻撃力＝本体の強さ20 × 攻撃力の倍率。攻撃力が上がるほど本体も当たり判定も大きくなる） ----
    aura: { radius: [6, 7, 8, 9, 10], base: 0.2, per: 0.15, push: 70 },    // 闘気：膜の大きさ（本体の半径の倍。Lv1〜5）／触れた敵へ毎秒（本体の攻撃力×割合）、1Lvで +15%／極：はじく強さ
    charge: { move: 0.15, mult: [2, 2.5, 3, 3.5, 4], again: 0.4, bossAgain: 1.2, push: 140, // 突撃：動いているとみなす速さ（最高速度に対する割合。0.15＝最高速度の15%以上）／1回のダメージ（本体の攻撃力×倍）／同じ敵に当たり直す間隔／押し返す強さ
              kingPush: 320, kingRadius: 55, kingPower: 0.5 },    // 覇王：吹き飛ばす強さ／巻き込む広さ／巻き込んだ敵へのダメージ（突撃のダメージに対する割合）
    heavyfist: { radius: [30, 34, 38, 42, 46], power: 0.5, kiwamiRadius: 1.3 }, // 重拳：衝撃波の広さ（Lvごと）／強さ（突撃のダメージに対する割合）
    rush: { per: [0.1, 0.15, 0.2, 0.25, 0.3], max: 5, kiwamiMax: 10, keep: 3 }, // 連打：1段ごとのダメージ（Lvごと）／段の上限／途切れるまでの秒数
    shield: { back: [23, 21, 19, 17, 15], burst: 70, burstPower: 1 },   // シールド：破れてから戻るまでの秒数（Lvごと）／極の衝撃波の広さと強さ（本体の攻撃力×倍）
    shoot: { interval: 0.4, power: 0.5, kingLife: 3 },        // 射撃：撃つ間隔（秒）／1発の威力（本体の攻撃力×割合）／狙撃手：弾が飛び続ける秒数（画面の端まで届く）
    rapid: { per: 0.12, spread: 0.1, kiwamiPower: 0.5 },      // 速射：1Lvで撃つ速さ +12%／極：2発目のずれ（ラジアン）・2発目の威力（1発目に対する割合）
    snipe: { slow: 2, mult: 3, kiwamiMult: 1.5 },             // 狙撃：撃つ間隔の倍／威力の倍（貫通）／極：さらに威力の倍
    homing: { turn: 7, life: 1.4, bounce: 140 },              // 追尾弾：曲がる強さ／弾が飛ぶ時間の倍／極：はね返る先を探す距離
    barrage: { every: 1, count: 8, power: 0.5 },              // 弾幕：間隔／方向の数／1発の威力（本体の攻撃力×割合）
    dash: { life: 0.5, width: 6, power: 1, again: 0.3, windLife: 1.5, windWidth: 10, pull: 50 }, // 疾走：跡が残る秒数／跡の太さ／触れた敵へのダメージ（本体の攻撃力×倍）／同じ敵に当たり直す間隔／風神：竜巻が残る秒数・太さ・引き寄せる強さ
    afterslash: { every: 0.5, delay: 0.15, radius: 35, power: 0.8 }, // 残像斬り：残像が出る間隔／切るまでの間／切る広さ／ダメージ（本体の攻撃力×倍）
    gust: { still: 0.25, again: 0.8, radius: 60, power: 1, push: 260, kiwamiRadius: 1.5 }, // 突風：止まっているとみなす秒数／出直せる間隔／広さ／ダメージ／吹き飛ばす強さ
    nimble: { base: 0.3, per: 0.05 },                         // 身軽：動いている間、当たり判定が小さくなる割合（Lv1 30%、1Lvで +5%）
    blink: { every: 4, dist: 80, power: 3, width: 14 },       // 瞬身：間隔／瞬間移動する距離／通り道の敵へのダメージ（本体の攻撃力×倍）／通り道の太さ
    demon: { every: 20, time: 2, power: 3, again: 0.3, reach: 1.9 }, // 鬼神
    // ---- 罠の道（罠は踏まれるまでその場に残る。数は max まで、超えたら古いものから消える） ----
    trap: { life: 8, max: 200, reach: 5, slow: 0.5, slowTime: 0.5 }, // 罠が残る秒数／罠の数の上限／踏んだとみなす距離（敵のふちから）／スロウフィールド：遅くする倍率と秒数
    keepsake: { power: 2, per: 0.25, blast: 45, blastPower: 1 },     // 置き土産：時間で消えない。踏んだ敵へ（押し出された分身の攻撃力×倍）、1Lvで +25%／極の爆発の広さと強さ
    caltrop: { gap: 30, power: 0.3, per: 0.15, burst: 30 },         // マキビシ：軌跡の上の間隔／1個の強さ（分身の攻撃力×割合）、1Lvで +15%／千本針：飛び散る広さ
    barb: { hits: 3, grow: [0.3, 0.4, 0.5, 0.6, 0.7], growMax: 10, again: 0.5 }, // 返し針：刺さる回数／刺さるたびに上がる威力（Lvごと、1回ごとに足す）／極で上がり続ける回数の上限／同じ敵に刺さり直す間隔
    snare: { stop: [0.5, 0.6, 0.7, 0.8, 0.9], kiwamiMult: 2 },      // 足止め：止まる秒数（Lvごと）／極の倍
    scatter: { every: 2, kiwamiEvery: 1 },                          // ばらまき：往復中の分身1体が落とす間隔（秒）
    spikebed: { every: 10, count: 30 },                             // 剣山：間隔／降る数
    mine: { power: 1.5, per: 0.15, radius: 45, chainDelay: 0.12 },  // 地雷：爆発の強さ（分身の攻撃力×倍）、1Lvで +15%／広さ／連鎖爆雷：誘爆までの間
    timebomb: { time: 3, radiusMul: 1.5, kiwamiMult: 2 },           // 時限爆弾：置いてから爆発するまで／広さの倍／極：威力の倍
    sticky: { delay: 1, kiwamiRadius: 1.5 },                        // 吸着地雷：くっついてから爆発するまで／極：広さの倍
    rig: { power: 4, kiwamiMult: 2 },                               // 仕込み：時間で消えない。押し出された分身の地雷の強さ（分身の攻撃力×倍）／極：さらに倍
    misfire: { every: 2 },                                          // 暴発：勝手に爆発する間隔
    flamepath: { life: 3, width: 8, power: 0.5, per: 0.1, gap: 8, hellMult: 2 }, // 炎の道：燃える秒数／炎の太さ（中心から）／毎秒（分身の攻撃力×割合）、1Lvで +10%／炎の点の間隔／業火：太さと時間の倍
    spread: { time: 2, reach: 30, power: 0.5, kiwamiMult: 2 },     // 延焼：燃え続ける秒数／燃え移る距離／燃えている間の毎秒（炎の強さに対する割合）／極：時間の倍
    pillar: { turn: 1.05, look: 10, gap: 40, radius: 28, every: 0.5, power: 1, kiwamiRadius: 1.5 }, // 火柱：折れ曲がりとみなす角度（60度）／角度を見る幅／火柱どうしの間／広さ／当たる間隔／強さ（分身の攻撃力×倍）
    ember: { life: 5, gap: 24, kiwamiMult: 2 },                     // 残り火：火の粉が残る秒数／間隔／極：時間の倍
    firesea: { close: 40, minLen: 150 },
    // ---- 現象の道 ----
    thunder: { power: 0.4, per: 0.1, width: 4, maxGhosts: 12 },   // 雷：線に触れた敵へ毎秒（分身の攻撃力の平均×割合）、1Lvで +10%／線の太さ／雷網でつなぐ分身の数の上限
    chainbolt: { count: 2, kiwamiCount: 4, reach: 100, power: 0.5 }, // 連鎖雷：飛び移る数／極／届く距離／威力（当たった弾のダメージに対する割合）
    strike: { every: 2, near: 40, power: 2, kiwamiCount: 2 },     // 落雷：間隔／雷の線からこの距離までの敵／威力（分身の攻撃力の平均×倍）／極：落ちる数
    charged: { stop: 0.3, kiwamiMult: 2, again: 1 },              // 帯電：止まる秒数／極の倍／同じ敵がまた止まるまでの間
    skybolt: { every: 8, power: 1 },                              // 天雷：間隔／威力（分身の攻撃力の平均×倍）
    freeze: { time: 2, base: 0.5, per: 0.05, hits: 3, freezeTime: 1.5 }, // 氷結：遅くなる秒数／遅くなる割合（Lv1 50%、1Lvで +5%）／絶対零度：凍るまでの当てる回数と凍る秒数
    shatter: { count: 4, kiwamiCount: 8, power: 0.5, life: 0.35 },  // 砕氷：破片の数／極／威力（分身の攻撃力の平均×倍）／破片が飛ぶ秒数
    chill: { reach: 40, slow: 0.2, kiwamiReach: 1.5 },            // 冷気：分身のふちから届く距離／遅くなる割合／極
    frostpath: { slow: 0.2, width: 6, gap: 10, kiwamiDamage: 0.2 }, // 霜の道：遅くなる割合／霜の太さ／霜を調べる間隔／極：受けるダメージ↑
    iceage: { every: 15, time: 5, bossTime: 1.5, power: 0.6 },   // 氷河期：間隔／凍る秒数／ボスが凍る秒数（ダメージはふつうの敵と同じ秒数受ける）／凍っている間の毎秒ダメージ（分身の攻撃力の平均×割合）
    pull: { reach: 100, speed: 40, per: 0.1, holeReach: 1.5, core: 20, corePower: 0.5, bossSlow: 0.3 }, // 引力：分身のふちから届く距離／吸い寄せる速さ、1Lvで +10%／特異点：範囲の倍・中心からの距離・毎秒（分身の攻撃力×割合）／ボスは引き寄せられない代わりに、範囲の中でこの割合だけ遅くなる
    compress: { per: 0.05, cap: 0.5, kiwamiCap: 1 },              // 圧縮：中の敵1体ごと／上限／極の上限
    repel: { reach: 60, every: 3, push: 420, power: 1.5 },        // 斥力：本体のふちから届く距離／押し返す波の間隔（秒）／押し返す強さ／極：波が当たった敵へのダメージ（分身の攻撃力の平均×倍）
    gravshot: { time: 1, radius: 50, speed: 80, kiwamiMult: 2 },  // 重力弾：小さな引力が残る秒数／広さ／寄せる速さ／極の倍
    collapse: { every: 20, time: 2, speed: 160 },                 // 重力崩壊：間隔／吸い寄せる秒数／速さ
    poison: { cap: 5, kiwamiCap: 10, time: 3, power: 0.1, per: 0.1 }, // 毒：重なる上限／猛毒の上限（上限なしだと分身が多いほど際限なく強くなる）／続く秒数／毒1つの毎秒（分身の攻撃力の平均×割合）、1Lvで +10%
    contagion: { reach: 60, share: 0.5, kiwamiShare: 0.75, count: 2, kiwamiCount: 4 }, // 伝染：うつる距離／うつる割合／極／うつる相手の数（近い順）／極の数
    corrode: { per: 0.03, cap: 0.3, kiwamiCap: 0.6 },             // 腐食：毒1つごとの被ダメージ↑／上限／極の上限
    fog: { every: 0.25, life: 1.5, radius: 16, again: 0.5, kiwamiMult: 2, max: 200 }, // 毒霧：分身が霧を残す間隔／残る秒数／広さ／同じ敵に重ね直す間隔／極：時間の倍／霧の数の上限
    pandemic: { every: 12 },                                      // パンデミック：間隔
    reaper: { chance: 0.03, per: 0.005, hellReach: 50, bossCut: 0.005 }, // 死神：即死の確率、1Lvで +0.5%（敵の大きさに関係なく同じ）／冥府：道連れの距離／ボス・中ボスは即死しない代わりに、最大体力のこの割合を削る（死の連鎖の段は上がらない）／冥府：道連れの距離
    execute: { per: [0.004, 0.005, 0.006, 0.008, 0.01], max: 10, kiwamiMax: 20, keep: 3, kiwamiKeep: 5 }, // 死の連鎖：即死が起きるたびに即死の確率が上がる（1段ごと、Lvごと）／段の上限／極の上限／途切れるまでの秒数／極
    doom: { every: 10, time: 5, kiwamiCount: 2 },                 // 死の宣告：間隔／倒れるまで／極：印の数
    soulreap: { mult: 2, kiwamiMult: 3 },                         // 魂の収穫：即死で倒した敵のかけらの倍
    scythe: { every: 15, time: 1.2, height: 160, power: 5 },      // 大鎌：間隔／画面を横切る秒数／刃の高さ／威力（分身の攻撃力の平均×倍）
    // ---- 衛星の道 ----
    float: { radius: 7.2, size: 0.38, speed: 1.5, power: 0.5, per: 0.15, again: 0.3 }, // 浮遊：回る輪の大きさ（本体の半径の倍）／玉の大きさ（同）／回る速さ（1秒の角度）／触れた敵へ（本体の攻撃力×割合）、1Lvで +15%／同じ敵に当たり直す間隔
    satellite: { planet: 1.6 },                                   // 衛星：玉の数は Lv+1／惑星系：外側の輪の大きさ（内側の輪の倍）
    bigsat: { kiwamiSize: 1.5 },                                  // 大衛星：極の大きさの倍
    meteor: { every: 3, kiwamiEvery: 5, time: 0.6, reach: 160 },  // 流星：間隔／極（全部の玉が飛ぶ）の間隔／飛び出して戻るまでの秒数／届く距離
    orbitshift: { min: 0.8, max: 1.8, period: 2, kiwamiSpeed: 2 }, // 軌道変化：輪の大きさの最小・最大（倍）／1回伸び縮みする秒数／極：回る速さの倍
    starfall: { every: 10, count: 20, delay: 0.4, radius: 22, power: 1.5 }, // 星の雨：間隔／数／落ちるまで／当たる広さ／威力（本体の攻撃力×倍）
    blade: { gap: 12, size: 6, speed: 4, power: 0.3, per: 0.1, again: 0.3, sawMult: 2 }, // 刃輪：分身のふちからの距離／刃の大きさ／回る速さ／威力（分身の攻撃力×割合）、1Lvで +10%／同じ敵に当たり直す間隔／回転鋸：大きさの倍（間隔は半分）
    throw: { every: 2, kiwamiEvery: 1, time: 0.6, reach: 150 },   // 投げ刃：間隔／極／飛んで戻るまで／届く距離
    twinblade: { count: 2, kiwamiCount: 4 },                      // 双刃：刃の枚数／極
    whet: { per: 0.02, cap: 1, kiwamiCap: 2, keep: 5 },           // 研磨：1回ごと／上限／極の上限／当たらないと戻るまでの秒数
    thousandblade: { every: 12, count: 30, power: 1 },            // 千刃：間隔／枚数／威力（分身の攻撃力の平均×倍）
    drone: { count: [2, 2, 3, 3, 4], squad: 2, speed: 260, size: 5, reach: 260, power: 0.1, again: 0.4 }, // 子機：数（Lvごと）／編隊で増える数／速さ／大きさ／敵を探す距離（本体から）／体当たり（本体の攻撃力×割合）／同じ子機が当たり直す間隔
    ramdrone: { mult: 1.2, push: 120 },                             // 突撃機：ダメージの倍／押し返す強さ
    gundrone: { keep: 80, every: 0.8 },                           // 砲撃機：敵から離れる距離／撃つ間隔
    collector: { count: 1, kiwamiCount: 2 },                      // 回収機：かけらを拾う子機の数／極
    mothership: { every: 10, count: 2, life: 10 },                // 母艦：間隔／出す数／出した子機が消えるまで
    shieldsat: { count: 2, ring: 2.8, speed: 2, size: 9, per: 0.15, wallPush: 260 }, // 盾衛星：盾の数／回る輪の大きさ（本体の半径の倍）／回る速さ／盾の大きさ、1Lvで +15%
    reflect: { power: 0.5 },                                      // 反射盾：跳ね返した弾の威力（本体の攻撃力×割合）
    shockshield: { radius: 30, power: 0.5, kiwamiMult: 2 },       // 衝撃盾：衝撃波の広さ／強さ（本体の攻撃力×割合）／極：広さの倍
    escort: { gap: 10, count: 1, kiwamiCount: 2 },                // 護衛：分身のふちからの距離／盾の数／極
    sanctuary: { radius: 70, slow: 0.3 },                         // 聖域：弾が遅くなる広さ（本体の中心から）／遅くなった弾の速さ（元の何倍か）
    // ---- 収穫の道 ----
    keeper: { per: 2 },                                           // 拾い上手：かけらが消えるまでの時間が、1Lvで +2秒（極：消えない）
    shortcut: { base: 0.1, per: 0.05, floor: 0.5, cards: 4 },     // 近道：必要なかけらが減る割合（Lv1 10%、1Lvで +5%）／これより少なくならない（元の半分）／豊年：カードの枚数
    double: { base: 0.2, per: 0.05, kiwamiMult: 2 },              // 二重取り：2個分になる確率（Lv1 20%、1Lvで +5%）／極：確率の倍
    treasure: { every: 30, kiwamiEvery: 15, worth: 10 },          // 宝探し：間隔／極／金のかけら1個の価値
    chainpick: { reach: 60, kiwamiMult: 2 },                      // 連鎖回収：一緒に飛んでくる範囲／極の倍
    goldenage: { every: 20, time: 5, mult: 3 },                   // 黄金時代：間隔／続く秒数／かけらの倍
    alchemy: { power: 0.5, per: 0.1, stone: 35, stonePower: 0.5 }, // 錬金：光の弾（本体の攻撃力×割合）、1Lvで +10%／賢者の石：爆発の広さと強さ（弾の威力×割合）
    goldshot: { mult: 2, kiwamiMult: 3 },                         // 金の弾：威力の倍／極
    convert: { every: 10, time: 5, buff: 0.3, kiwamiBuff: 0.6 },  // 変換：何個拾うごとか／続く秒数／分身の攻撃力↑／極
    savings: { rate: 0.2, kiwamiRate: 0.4 },                      // 貯金：たまる割合／極
    goldrain: { every: 15, delay: 0.4, power: 2 },                // 黄金の雨：間隔／降るまで／威力（本体の攻撃力×倍）
    absorb: { base: 0.01, per: 0.005, shieldCap: 0.2 },           // 吸収：かけら1個の回復（最大HPの割合）、1Lvで +0.5%／生命の泉：シールドの上限（最大HPの割合）
    overheal: { rate: 0.1, kiwamiRate: 0.2, cap: 0.5 },           // 過剰回復：回復しきれなかった分のうち最大HPに足す割合／極／上限（+50%）
    vitality: { hp: 0.2, kiwamiHp: 0.4, regen: 0.5 },             // 生命力：最大HP↑／極／回復が始まるまでの時間の倍
    vampire: { heal: 0.01, kiwamiHeal: 0.02 },                    // 吸血：敵を倒すたびの回復（最大HPの割合）／極
    immortal: { hp: 0.5, inv: 2 },                                // 不老不死：復活したときのHP（最大HPの割合）／無敵の秒数                            // 火の海：始めと終わりがこれより近く、長さがこれ以上なら輪とみなす：間隔／無敵の秒数／触れた敵へのダメージ（本体の攻撃力×倍）／当たり直す間隔／届く広さ（膜の大きさの倍）
  },
};
