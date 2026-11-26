// フェーズの合間のできごと（ボス以外のフェーズをクリアしたとき、5回に1回、カード選びの代わりに起きる）
//   kind：good（良い）| luck（運しだい）| bad（悪い）。rar：common | uncommon | rare | super
//   mark：紋章の1文字。line：始まるときの一言
//   ※ いまは見た目だけ（中身の動きはまだ）
export const EVENTS = [
  // 良いできごと
  { id: 'stall', kind: 'good', rar: 'common', name: '屋台', mark: '店', line: 'コメットで、カードを買える' },
  { id: 'minigacha', kind: 'good', rar: 'common', name: 'ミニガチャ', mark: '引', line: 'コメットを払って、カードを引こう' },
  { id: 'altar', kind: 'good', rar: 'common', name: '呪いの祭壇', mark: '呪', line: '呪いを受ければ、レアなカードを2枚' },
  { id: 'spring', kind: 'good', rar: 'common', name: '泉', mark: '泉', line: '最大HP・全回復・コメットから1つ' },
  { id: 'trial', kind: 'good', rar: 'uncommon', name: '腕試し', mark: '試', line: '強い中ボスを、時間内に倒せ' },
  { id: 'hoard', kind: 'good', rar: 'uncommon', name: '宝の山', mark: '宝', line: '宝箱と金色の敵があふれ出す' },
  { id: 'stray', kind: 'good', rar: 'uncommon', name: '迷子の分身', mark: '迷', line: 'ふしぎな分身が、ついてきたそうにしている' },
  { id: 'shooting', kind: 'good', rar: 'rare', name: '流れ星', mark: '星', line: 'スキルを1つ、一気に最大レベルへ' },
  { id: 'blackmarket', kind: 'good', rar: 'rare', name: '闇市', mark: '闇', line: '極みも、最高のカードも、金しだい' },
  { id: 'slot', kind: 'good', rar: 'rare', name: 'スロット', mark: '七', line: '3つそろえば、大当たり' },
  { id: 'golden', kind: 'good', rar: 'super', name: '黄金の時間', mark: '金', line: '次のフェーズ、敵が全部金色に' },
  { id: 'traveler', kind: 'good', rar: 'super', name: '時の旅人', mark: '時', line: 'スキルを1つ、別のスキルに取りかえられる' },
  { id: 'fortune', kind: 'good', rar: 'super', name: '七福神', mark: '福', line: '最高のカード3枚から、好きなものを' },
  // 運しだい
  { id: 'chests', kind: 'luck', rar: 'common', name: '宝箱えらび', mark: '箱', line: '3つのうち1つは、ミミック' },
  { id: 'omikuji', kind: 'luck', rar: 'common', name: 'おみくじ', mark: '籤', line: '大吉か、それとも…' },
  { id: 'potion', kind: 'luck', rar: 'common', name: 'ふしぎな薬', mark: '薬', line: '飲んでみる？　何が起きるかは分からない' },
  { id: 'coin', kind: 'luck', rar: 'uncommon', name: 'コイントス', mark: '銭', line: '表ならレアなカード、裏ならHPが半分' },
  { id: 'roulette', kind: 'luck', rar: 'uncommon', name: 'ルーレット', mark: '輪', line: '回して、止まった場所で運命が決まる' },
  { id: 'dice', kind: 'luck', rar: 'uncommon', name: '丁半ばくち', mark: '丁', line: 'コメットを賭けて、丁か半か' },
  // 悪いできごと
  { id: 'thief', kind: 'bad', rar: 'common', name: '盗っ人', mark: '盗', line: 'コメットを半分、盗まれた' },
  { id: 'ambush', kind: 'bad', rar: 'common', name: '待ち伏せ', mark: '伏', line: '次のフェーズ、中ボスが2体待ちかまえている' },
  { id: 'seal', kind: 'bad', rar: 'common', name: '封印', mark: '封', line: 'スキルが1つ、次のフェーズの間だけ使えない' },
  { id: 'kyo', kind: 'bad', rar: 'rare', name: '大凶', mark: '凶', line: '盗っ人・待ち伏せ・封印が、まとめて来る' },
];
export const EVENT_BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export const KIND_LABEL = { good: '良いできごと', luck: '運しだい', bad: '悪いできごと' };
export const RAR_LABEL = { common: '', uncommon: 'たまに', rare: 'レア', super: '超レア' };

// ---------- コメット（ゲーム中だけのお金） ----------
//   小さなとげが何本も出た、ころんとした星形の結晶。面ごとに明るさを変えて、キャンディのように見せる
export const COMET_HUES = [200, 48, 352, 140, 285];
export function drawComet(ctx, x, y, r, hue, t = 0, spin = 0) {
  const N = 7, a0 = spin + t * 0.6;
  ctx.save();
  ctx.translate(x, y);
  // 外の光
  const halo = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.6);
  halo.addColorStop(0, `hsla(${hue},95%,70%,0.45)`); halo.addColorStop(1, `hsla(${hue},95%,60%,0)`);
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
  // とげ：1本ずつ、左半分を明るく・右半分を暗く塗って、面に見せる
  const base = r * 0.52;
  for (let k = 0; k < N; k++) {
    const a = a0 + (k / N) * Math.PI * 2, w = (Math.PI / N) * 0.82;
    const tx = Math.cos(a) * r, ty = Math.sin(a) * r;
    const lx = Math.cos(a - w) * base, ly = Math.sin(a - w) * base, rx = Math.cos(a + w) * base, ry = Math.sin(a + w) * base;
    const lit = 0.5 + 0.5 * Math.cos(a + 2.2);   // 左上から光が当たる
    ctx.fillStyle = `hsl(${hue},85%,${48 + lit * 26}%)`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(lx, ly); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `hsl(${hue},80%,${34 + lit * 20}%)`;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tx, ty); ctx.lineTo(rx, ry); ctx.closePath(); ctx.fill();
    // とげの先は丸く
    ctx.fillStyle = `hsl(${hue},90%,${60 + lit * 20}%)`;
    ctx.beginPath(); ctx.arc(tx * 0.97, ty * 0.97, r * 0.09, 0, Math.PI * 2); ctx.fill();
  }
  // まんなかの玉
  const core = ctx.createRadialGradient(-r * 0.18, -r * 0.2, r * 0.05, 0, 0, base * 1.05);
  core.addColorStop(0, `hsl(${hue},100%,88%)`); core.addColorStop(0.5, `hsl(${hue},90%,62%)`); core.addColorStop(1, `hsl(${hue},85%,40%)`);
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, base * 1.02, 0, Math.PI * 2); ctx.fill();
  // つやの光
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.24, r * 0.16, r * 0.09, -0.6, 0, Math.PI * 2); ctx.fill();
  // ときどきキラッ
  const tw = Math.max(0, Math.sin(t * 3 + hue));
  if (tw > 0.85) {
    const L = r * 0.7 * (tw - 0.85) / 0.15;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath(); ctx.moveTo(r * 0.35 - L, -r * 0.35); ctx.lineTo(r * 0.35 + L, -r * 0.35); ctx.moveTo(r * 0.35, -r * 0.35 - L); ctx.lineTo(r * 0.35, -r * 0.35 + L); ctx.stroke();
  }
  ctx.restore();
}
