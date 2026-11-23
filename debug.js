// 試作用の調整パネル。CONFIG の項目から自動で組み立てる。
// 値は CONFIG を直接書き換えるので、ゲームにはすぐ反映される。

export function setupDebugPanel(config, { onChange, onOpen, onClose, onRestart, onClearPhase, onPreview, coins }) {
  const sheet = document.getElementById('debug');
  const body = document.getElementById('debug-body');

  const open = () => {
    if (coins) showCoins();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    onOpen();
  };
  const close = () => {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    onClose();
  };
  document.getElementById('open-debug').addEventListener('click', open);
  document.getElementById('close-debug').addEventListener('click', close);
  document.getElementById('restart').addEventListener('click', () => { onRestart(); close(); });
  document.getElementById('open-preview').addEventListener('click', () => { close(); onPreview(); });
  document.getElementById('debug-clear').addEventListener('click', () => { close(); onClearPhase(); });

  // ---- 上のタブ：調整｜記録 ----
  //   記録：遊んだ人のプレイの記録をまとめて見る（今は見た目だけ。数字は見本）
  const tabs = document.createElement('div');
  tabs.className = 'seg dbg-tabs';
  tabs.innerHTML = '<button class="active" data-t="tune">調整</button><button data-t="rec">プレイの記録</button>';
  body.appendChild(tabs);
  const tune = document.createElement('div');
  const rec = document.createElement('div');
  rec.className = 'dbg-rec';
  rec.hidden = true;
  body.appendChild(tune);
  body.appendChild(rec);
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    tune.hidden = b.dataset.t !== 'tune';
    rec.hidden = b.dataset.t !== 'rec';
    if (!rec.hidden) renderRecords(rec, REC_MOCK, recRange);
  });
  let recRange = 'all';
  rec.addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]'); if (!b) return;
    recRange = b.dataset.range; renderRecords(rec, REC_MOCK, recRange);
  });

  const title = (text) => {
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = text;
    tune.appendChild(h);
  };

  // コイン（ガチャを試すため）
  let showCoins = () => {};
  if (coins) {
    title('▼ コイン（ガチャを試す）');
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="row-label"><span>持っているコイン</span><span class="row-value"></span></div>`;
    const val = row.querySelector('.row-value');
    showCoins = () => { val.textContent = coins.get().toLocaleString(); };
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [label, fn] of [['+1,000', () => coins.add(1000)], ['+10,000', () => coins.add(10000)], ['+100,000', () => coins.add(100000)], ['0にする', () => coins.set(0)]]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { fn(); showCoins(); });
      seg.appendChild(b);
    }
    row.appendChild(seg);
    const row2 = document.createElement('div');
    row2.className = 'row';
    row2.innerHTML = `<div class="row-label"><span>着せ替えの持ち物</span></div>`;
    const seg2 = document.createElement('div');
    seg2.className = 'seg';
    const rb = document.createElement('button');
    rb.textContent = '最初の状態に戻す';
    rb.addEventListener('click', () => { coins.resetSkins(); rb.textContent = '戻しました'; setTimeout(() => { rb.textContent = '最初の状態に戻す'; }, 1200); });
    seg2.appendChild(rb);
    row2.appendChild(seg2);
    tune.appendChild(row);
    tune.appendChild(row2);
    showCoins();
  }

  title('▼ 比べる項目');
  for (const [key, item] of Object.entries(config.experiments)) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<div class="row-label"><span>${item.label}</span></div>`;
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const opt of item.options) {
      const b = document.createElement('button');
      b.textContent = opt.label;
      if (opt.value === item.value) b.classList.add('active');
      b.addEventListener('click', () => {
        item.value = opt.value;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        onChange(key, opt);
      });
      seg.appendChild(b);
    }
    row.appendChild(seg);
    tune.appendChild(row);
  }

  title('▼ 数値');
  for (const [key, item] of Object.entries(config.tuning)) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-label"><span>${item.label}</span><span class="row-value"></span></div>
      <input class="slider" type="range" min="${item.min}" max="${item.max}" step="${item.step}" value="${item.value}">`;
    const val = row.querySelector('.row-value');
    const input = row.querySelector('input');
    const show = () => { val.textContent = `${item.value}${item.unit}`; };
    show();
    input.addEventListener('input', () => {
      item.value = Number(input.value);
      show();
      onChange(key, item);
    });
    tune.appendChild(row);
  }
}

// ---------- プレイの記録（見た目） ----------
// 見本の数字（あとでデータベースから読んだものに置きかえる）
const REC_MOCK = {
  all: {
    plays: 128, since: '11/23',
    bosses: [
      { n: 1, name: 'コア', phase: 10, tries: 96, wins: 81, winSec: 212, loseSec: 140 },
      { n: 2, name: 'ハンター', phase: 20, tries: 64, wins: 42, winSec: 248, loseSec: 171 },
      { n: 3, name: '双子', phase: 30, tries: 31, wins: 14, winSec: 301, loseSec: 205 },
      { n: 4, name: '時計', phase: 40, tries: 6, wins: 1, winSec: 388, loseSec: 240 },
      { n: 5, name: '影', phase: 50, tries: 0, wins: 0, winSec: 0, loseSec: 0 },
    ],
    ends: [[1, 10, 32], [11, 20, 33], [21, 30, 46], [31, 40, 12], [41, 50, 5], [51, 999, 0]],
    elite: { seen: 74, killed: 51, sec: 21, skipped: 23 },
    control: { drag: 102, stick: 26 },
  },
  week: {
    plays: 41, since: '11/17',
    bosses: [
      { n: 1, name: 'コア', phase: 10, tries: 30, wins: 26, winSec: 205, loseSec: 150 },
      { n: 2, name: 'ハンター', phase: 20, tries: 21, wins: 15, winSec: 240, loseSec: 160 },
      { n: 3, name: '双子', phase: 30, tries: 11, wins: 5, winSec: 290, loseSec: 199 },
      { n: 4, name: '時計', phase: 40, tries: 2, wins: 0, winSec: 0, loseSec: 233 },
      { n: 5, name: '影', phase: 50, tries: 0, wins: 0, winSec: 0, loseSec: 0 },
    ],
    ends: [[1, 10, 9], [11, 20, 10], [21, 30, 16], [31, 40, 4], [41, 50, 2], [51, 999, 0]],
    elite: { seen: 25, killed: 18, sec: 19, skipped: 7 },
    control: { drag: 33, stick: 8 },
  },
};
const mmss = (sec) => (sec > 0 ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '—');
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
function renderRecords(root, all, range) {
  const d = all[range];
  const maxEnd = Math.max(1, ...d.ends.map((x) => x[2]));
  const ctl = d.control.drag + d.control.stick;
  root.innerHTML = `
    <div class="dbg-rec-top">
      <div class="seg dbg-range">
        <button data-range="all" class="${range === 'all' ? 'active' : ''}">全部</button>
        <button data-range="week" class="${range === 'week' ? 'active' : ''}">今週</button>
      </div>
      <div class="dbg-rec-count"><b>${d.plays.toLocaleString()}</b>回のプレイ<small>${d.since}から</small></div>
    </div>
    <div class="dbg-rec-note">見本の数字です（まだ記録していません）</div>

    <div class="group-title">▼ ボス</div>
    <table class="dbg-tbl">
      <thead><tr><th>ボス</th><th>挑戦</th><th>倒せた</th><th>倒すまで</th><th>やられるまで</th></tr></thead>
      <tbody>${d.bosses.map((b) => `<tr class="${b.tries ? '' : 'none'}"><td><b>${b.n}</b> ${b.name}<small>P${b.phase}</small></td><td>${b.tries}</td><td class="${b.tries && b.wins / b.tries < 0.3 ? 'bad' : ''}">${pct(b.wins, b.tries)}</td><td>${mmss(b.winSec)}</td><td>${mmss(b.loseSec)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="dbg-rec-hint">時間は、真ん中の値（半分の人がこれより早い）</div>

    <div class="group-title">▼ やられたフェーズ</div>
    <div class="dbg-bars">${d.ends.map(([a, b, n]) => `<div class="dbg-bar"><span>${b > 900 ? `${a}〜` : `${a}〜${b}`}</span><i><em style="width:${(n / maxEnd) * 100}%"></em></i><b>${n}</b></div>`).join('')}</div>

    <div class="group-title">▼ 中ボス</div>
    <div class="dbg-kv">
      <div><span>出てきた</span><b>${d.elite.seen}回</b></div>
      <div><span>倒した</span><b>${pct(d.elite.killed, d.elite.seen)}</b></div>
      <div><span>倒すまで</span><b>${mmss(d.elite.sec)}</b></div>
      <div><span>倒さずに次へ</span><b class="${d.elite.skipped / Math.max(1, d.elite.seen) > 0.25 ? 'bad' : ''}">${pct(d.elite.skipped, d.elite.seen)}</b></div>
    </div>

    <div class="group-title">▼ 操作方法</div>
    <div class="dbg-split"><i style="width:${(d.control.drag / Math.max(1, ctl)) * 100}%"></i></div>
    <div class="dbg-split-label"><span>ドラッグ ${pct(d.control.drag, ctl)}</span><span>スティック ${pct(d.control.stick, ctl)}</span></div>
    <button class="btn btn-small btn-sub wide dbg-reload">読み込み直す</button>`;
}
