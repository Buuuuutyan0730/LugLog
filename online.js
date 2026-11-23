// ランキング（Firebase）。みんなの記録を Firestore の scores に1人1つずつ残す
//   人の見分け：名前の登録なしで端末ごとに見分ける「匿名ログイン」
//   全期間の最高は scores/<見分けの番号>、その週の最高は weeks/<週の番号>/scores/<見分けの番号> に1つずつ
//   つながらないとき（電波がない・読みこめない）は、ゲームはそのまま遊べる。ランキングだけ「つながりません」と出す
import { CONFIG as GAME } from './config.js?v=20261123154553';
const CONFIG = {
  apiKey: 'AIzaSyA9JWRT-1pPiMH4wnL78nrt_7icvCd_v7M',
  authDomain: 'luglog.firebaseapp.com',
  projectId: 'luglog',
  storageBucket: 'luglog.firebasestorage.app',
  messagingSenderId: '1095451978628',
  appId: '1:1095451978628:web:a8711e45bace2775aa8bd1',
};
// ありえない記録ははじく（サーバー側のきまりでも同じようにはじく）
export const LIMITS = { phase: 150, name: 12 };

// 週の番号：月曜の朝4時で区切る（日本の時刻で数える）。例：2026-11-16 の週 → "20261116"
export function weekKey(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000 - 4 * 3600 * 1000);   // 日本時間の朝4時を日付の区切りにする
  const day = (jst.getUTCDay() + 6) % 7;                                        // 月曜=0
  const mon = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - day));
  return `${mon.getUTCFullYear()}${String(mon.getUTCMonth() + 1).padStart(2, '0')}${String(mon.getUTCDate()).padStart(2, '0')}`;
}
export function weekLabel(now = new Date()) {
  const k = weekKey(now), y = +k.slice(0, 4), mo = +k.slice(4, 6) - 1, d = +k.slice(6);
  const a = new Date(Date.UTC(y, mo, d)), b = new Date(Date.UTC(y, mo, d + 6));
  const W = '日月火水木金土', f = (x) => `${x.getUTCMonth() + 1}/${x.getUTCDate()}（${W[x.getUTCDay()]}）`;
  return `${f(a)}〜 ${f(b)}`;
}

let ready = null;   // つなぐ処理（1回だけ）
function connect() {
  if (ready) return ready;
  ready = (async () => {
    // Firebaseの部品はゲームに同梱（外のサイトから読みこまない）。ランキングを使うときだけ読みこむ
    const fs = await import('./firebase.js');
    const app = fs.initializeApp(CONFIG);
    const auth = fs.getAuth(app);
    const cred = auth.currentUser ? { user: auth.currentUser } : await fs.signInAnonymously(auth);
    return { fs, db: fs.getFirestore(app), uid: cred.user.uid };
  })();
  ready.catch(() => { ready = null; });   // 失敗したら、次にまた試す
  return ready;
}
const withTimeout = (p, ms = 15000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);

// ありえない記録かどうか（サーバー側のきまりと同じ考え方）
//   スコア＝倒した敵の体力の合計。敵は「1秒に出る体力の合計」（フェーズごとに増える）ずつ出てくるので、
//   スコアは「今のフェーズの1秒の量 ×（遊んだ秒数×4 ＋ 120）＋ 5万」を超えない（ボス・中ボスの分も含めた余裕）
//   ※前はフェーズだけで上限を決めていたが、敵を増やしたあと、ふつうの記録まではじいていた
export const RATE = GAME.phase;
export function rateAt(phase) {
  let k = 1;
  for (let n = 2; n <= phase; n++) k *= RATE.hpRateGrowth.find((g) => n <= g.until).rate;
  return Math.ceil(RATE.hpRateBase * k);
}
export const scoreCap = (phase, sec) => (sec * 4 + 120) * rateAt(phase) + 50000;
export function plausible(run) {
  const score = Math.floor(run.score), phase = run.phase, sec = Math.floor(run.time);
  return score > 0 && phase >= 1 && phase <= LIMITS.phase && score <= scoreCap(phase, sec) && sec >= phase * 8 && sec <= 6 * 3600;
}

// 記録の置き場所：全期間＝scores/<番号>、今週＝weeks/<週の番号>/scores/<番号>
//   どちらも「名前・アイコン・枠・称号・スコア・フェーズ・遊んだ秒数・送った時刻」だけを入れる
async function put(fs, ref, prof, run, old) {
  const data = { ...prof, score: Math.floor(run.score), phase: run.phase, sec: Math.floor(run.time), at: fs.serverTimestamp() };
  if (old && old.score >= data.score) { Object.assign(data, { score: old.score, phase: old.phase, sec: old.sec }); }
  await withTimeout(fs.setDoc(ref, data));
}
// 1回遊び終えたとき：自分の記録より良ければ送る（今週と全期間の、それぞれの最高だけ残す）
export async function submitScore(save, run) {
  if (!plausible(run)) return false;
  const { fs, db, uid } = await withTimeout(connect());
  const prof = profile(save), score = Math.floor(run.score);
  let sent = false;
  for (const ref of [fs.doc(db, 'scores', uid), fs.doc(db, 'weeks', weekKey(), 'scores', uid)]) {
    const snap = await withTimeout(fs.getDoc(ref));
    const old = snap.exists() ? snap.data() : null;
    if (old && old.score >= score) continue;
    await put(fs, ref, prof, run, old);
    sent = true;
  }
  return sent;
}
// 名前・アイコン・枠・称号だけ変わったとき（記録はそのまま）
export async function syncProfile(save) {
  const { fs, db, uid } = await withTimeout(connect());
  for (const ref of [fs.doc(db, 'scores', uid), fs.doc(db, 'weeks', weekKey(), 'scores', uid)]) {
    const snap = await withTimeout(fs.getDoc(ref));
    if (snap.exists()) await withTimeout(fs.updateDoc(ref, { ...profile(save), at: fs.serverTimestamp() }));
  }
}
function profile(save) {
  return { name: String(save.name || '名無し').slice(0, LIMITS.name), icon: String(save.equip.icon || 'a0').slice(0, 20), frame: String(save.equip.frame || 'f_none').slice(0, 20), title: String(save.equip.title || '').slice(0, 20) };
}

// ランキングを読む。tab：'week'（今週）・'all'（全期間）。上位50人と自分の順位
export async function loadRanking(tab) {
  const { fs, db, uid } = await withTimeout(connect());
  const col = tab === 'week' ? fs.collection(db, 'weeks', weekKey(), 'scores') : fs.collection(db, 'scores');
  const top = await withTimeout(fs.getDocs(fs.query(col, fs.orderBy('score', 'desc'), fs.limit(50))));
  const list = top.docs.map((d, i) => ({ rank: i + 1, uid: d.id, ...pick(d.data()) })).filter((e) => e.score > 0);
  let me = list.find((e) => e.uid === uid) || null;
  if (!me) {
    const mine = await withTimeout(fs.getDoc(fs.doc(col, uid)));
    const d = mine.exists() ? mine.data() : null;
    if (d && d.score > 0) {
      const above = await withTimeout(fs.getCountFromServer(fs.query(col, fs.where('score', '>', d.score))));
      me = { rank: above.data().count + 1, uid, ...pick(d) };
    }
  }
  return { list, me };
}
function pick(d) {
  return { name: d.name || '名無し', icon: d.icon || 'a0', frame: d.frame || 'f_none', title: d.title || '', score: d.score || 0, phase: d.phase || 0 };
}

// ---------- 開発者（1人だけ） ----------
//   dev/owner に「開発者の端末の番号」を1つだけ置く。最初に合言葉を入れた端末が開発者になり、あとから書きかえられない
//   合言葉が正しいかはサーバー側のきまりで確かめる。開発者の情報を読めるのは、開発者の端末だけ
// 戻り値：'ok'（開発者になった・もうなっている）／'taken'（ほかの端末が開発者）／'offline'（つながらない）
export async function claimDev(key) {
  try {
    const { fs, db, uid } = await withTimeout(connect());
    const ref = fs.doc(db, 'dev', 'owner');
    const snap = await withTimeout(fs.getDoc(ref)).catch(() => null);
    if (snap && snap.exists()) return snap.data().uid === uid ? 'ok' : 'taken';
    if (!snap) return 'taken';   // 読めない＝ほかの端末が開発者
    await withTimeout(fs.setDoc(ref, { uid, key }));
    return 'ok';
  } catch (e) {
    return e && e.code === 'permission-denied' ? 'taken' : 'offline';
  }
}
// この端末が開発者か：'yes'／'no'／'offline'
export async function checkDev() {
  try {
    const { fs, db, uid } = await withTimeout(connect());
    const snap = await withTimeout(fs.getDoc(fs.doc(db, 'dev', 'owner')));
    return snap.exists() && snap.data().uid === uid ? 'yes' : 'no';
  } catch (e) {
    return e && e.code === 'permission-denied' ? 'no' : 'offline';
  }
}

// 開発者だけ：ランキングの記録を直す・消す（サーバー側のきまりで、開発者の端末でなければはじかれる）
//   tab：'week'（今週）・'all'（全期間）。v：{ name, score, phase }
const rankRef = (fs, db, tab, uid) => (tab === 'week' ? fs.doc(db, 'weeks', weekKey(), 'scores', uid) : fs.doc(db, 'scores', uid));
export async function adminSetScore(tab, uid, v) {
  const { fs, db } = await withTimeout(connect());
  await withTimeout(fs.updateDoc(rankRef(fs, db, tab, uid), v));
}
export async function adminDeleteScore(tab, uid) {
  const { fs, db } = await withTimeout(connect());
  await withTimeout(fs.deleteDoc(rankRef(fs, db, tab, uid)));
}

// データを全部消すとき：ランキングの自分の記録（全期間・今週）も消す
export async function wipeRemote() {
  const { fs, db, uid } = await withTimeout(connect());
  for (const ref of [fs.doc(db, 'scores', uid), fs.doc(db, 'weeks', weekKey(), 'scores', uid)]) await withTimeout(fs.deleteDoc(ref)).catch(() => {});
}
