// アイコン枠（着せ替え）。プロフィールのアイコンを囲む輪。見た目だけで、強さは変わらない
//   ring：輪の模様（CSS の背景）、w：輪の太さ（アイコンの半径に対する割合）、glow：外側の光、spin：回る秒数
//   orn：飾り（猫耳・王冠・天使の輪・翼・角）、orb：輪のまわりを回る光の玉の色、after：残像のようにずれた輪
const solid = (c) => `${c}`;
const grad = (...c) => `conic-gradient(from 200deg, ${c.join(', ')}, ${c[0]})`;
export const FRAMES = [
  { id: 'f_none', name: 'なし', rarity: 'start' },
  // N：1色の輪・点線・二重線
  ...[['白', '#f3f6ff'], ['灰', '#8a93b8'], ['赤', '#ff4a5a'], ['橙', '#ff9a2a'], ['黄', '#ffd84a'], ['黄緑', '#a8f05a'], ['緑', '#3fcf6a'], ['水色', '#3fe0ff'],
    ['青', '#3f7cff'], ['紺', '#2a3a9a'], ['紫', '#a46bff'], ['桃', '#ff8fc8'], ['茶', '#a8703a'], ['黒', '#14141c']]
    .map(([name, c], i) => ({ id: `f_n${i + 1}`, name, rarity: 'N', ring: solid(c) })),
  { id: 'f_dot', name: '点線', rarity: 'N', ring: 'repeating-conic-gradient(#f3f6ff 0 7deg, transparent 7deg 18deg)' },
  { id: 'f_dbl', name: '二重線', rarity: 'N', ring: 'radial-gradient(closest-side, transparent 0 80%, #f3f6ff 81% 87%, transparent 88% 93%, #f3f6ff 94% 100%)', w: 24, raw: true },
  // R：2色以上・金属・光る輪
  { id: 'f_r1', name: '夕焼け', rarity: 'R', ring: grad('#ff9a2a', '#ff5f8f', '#ffd84a') },
  { id: 'f_r2', name: '海', rarity: 'R', ring: grad('#3fe0ff', '#2a5aff', '#9ff0ff') },
  { id: 'f_r3', name: '森', rarity: 'R', ring: grad('#3fcf6a', '#d8f05a', '#1f7a4a') },
  { id: 'f_r4', name: '紅白', rarity: 'R', ring: 'repeating-conic-gradient(#ff4a5a 0 22.5deg, #ffffff 22.5deg 45deg)' },
  { id: 'f_r5', name: '市松', rarity: 'R', ring: 'repeating-conic-gradient(#14141c 0 15deg, #e8ecff 15deg 30deg)' },
  { id: 'f_r6', name: '金', rarity: 'R', ring: 'conic-gradient(from 30deg, #fff2a8, #c08a2a, #ffd84a, #8a5a1a, #fff2a8, #c08a2a, #ffd84a)' },
  { id: 'f_r7', name: '銀', rarity: 'R', ring: 'conic-gradient(from 30deg, #ffffff, #8a93b8, #e8ecff, #5a6388, #ffffff, #8a93b8, #ffffff)' },
  { id: 'f_r8', name: '銅', rarity: 'R', ring: 'conic-gradient(from 30deg, #ffc8a0, #a8582a, #e8904a, #6a3418, #ffc8a0, #a8582a, #ffc8a0)' },
  { id: 'f_r9', name: 'ネオン', rarity: 'R', ring: solid('#3fe0ff'), glow: '#3fe0ff', w: 10 },
  { id: 'f_r10', name: '炎', rarity: 'R', ring: grad('#ff3a2a', '#ffd84a', '#ff7a2a'), glow: '#ff7a2a' },
  { id: 'f_r11', name: 'ドット', rarity: 'R', ring: 'repeating-conic-gradient(#ffd84a 0 10deg, #ff5f8f 10deg 20deg, #3fe0ff 20deg 30deg, #5fd36a 30deg 40deg)' },
  { id: 'f_r12', name: '光の輪', rarity: 'R', ring: solid('#ffffff'), glow: '#ffffff', w: 8 },
  // SR：動く・飾りがつく
  { id: 'f_sr1', name: '回る虹', rarity: 'SR', ring: 'conic-gradient(#ff5f8f, #ffcf3a, #5fffa8, #3fe0ff, #c08bff, #ff5f8f)', spin: 4, glow: '#c08bff' },
  { id: 'f_sr2', name: '衛星', rarity: 'SR', ring: solid('#3a4a9a'), orb: '#ffd84a', w: 9 },
  { id: 'f_sr3', name: '猫耳', rarity: 'SR', ring: solid('#ff8fc8'), orn: 'ears' },
  { id: 'f_sr4', name: '王冠', rarity: 'SR', ring: 'conic-gradient(from 30deg, #fff2a8, #c08a2a, #ffd84a, #8a5a1a, #fff2a8)', orn: 'crown' },
  { id: 'f_sr5', name: '天使の輪', rarity: 'SR', ring: solid('#ffffff'), glow: '#fff2a8', orn: 'halo', w: 10 },
  { id: 'f_sr6', name: '稲妻', rarity: 'SR', ring: 'repeating-conic-gradient(#ffe14a 0 14deg, transparent 14deg 24deg)', spin: 3, glow: '#ffe14a' },
  // SSR：軌道（水色の輪がずれて重なりながら回り、金の光が軌跡を描いて一周する）
  { id: 'f_ssr1', name: '軌道', rarity: 'SSR', ring: 'conic-gradient(from 0deg, rgba(63,224,255,0), #3fe0ff 70%, #ffffff)', spin: 2.4, glow: '#3fe0ff', orb: '#ffd84a', after: true, w: 12 },
];
const BY_ID = Object.fromEntries(FRAMES.map((f) => [f.id, f]));
export const frameOf = (id) => BY_ID[id] || BY_ID.f_none;

// 飾りの絵（アイコンの大きさに合わせて伸び縮みする）
const ORN = {
  ears: '<svg viewBox="0 0 100 40" class="avf-orn ears"><path d="M14 38 L22 4 L40 30 Z M86 38 L78 4 L60 30 Z" fill="#ff8fc8" stroke="#0a0a14" stroke-width="3" stroke-linejoin="round"/><path d="M22 14 L32 30 L20 32 Z M78 14 L68 30 L80 32 Z" fill="#ffd0e6"/></svg>',
  crown: '<svg viewBox="0 0 100 44" class="avf-orn crown"><path d="M18 40 L14 10 L34 26 L50 4 L66 26 L86 10 L82 40 Z" fill="#ffd84a" stroke="#0a0a14" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="28" r="5" fill="#ff5a7a"/><circle cx="31" cy="33" r="3.4" fill="#3fe0ff"/><circle cx="69" cy="33" r="3.4" fill="#3fe0ff"/></svg>',
  halo: '<svg viewBox="0 0 100 30" class="avf-orn halo"><ellipse cx="50" cy="15" rx="34" ry="9" fill="none" stroke="#fff2a8" stroke-width="5"/></svg>',
};
// アイコン（inner）を枠で囲んだ HTML
export function frameHtml(f, inner, cls = '') {
  if (!f || f.id === 'f_none') return inner;
  const st = `--fr:${f.ring};--fw:${f.w || 14}%;${f.glow ? `--fg:${f.glow};` : ''}${f.spin ? `--fs:${f.spin}s;` : ''}${f.orb ? `--fo:${f.orb};` : ''}`;
  return `<span class="avf ${f.raw ? 'raw' : ''} ${f.glow ? 'glow' : ''} ${f.spin ? 'spin' : ''} ${f.after ? 'after' : ''} ${cls}" style="${st}">${inner}${f.after ? '<i class="avf-gh g1"></i><i class="avf-gh g2"></i>' : ''}${f.orb ? '<i class="avf-orb"><b></b></i>' : ''}${f.orn ? ORN[f.orn] : ''}</span>`;
}
