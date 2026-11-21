// 画面上の表示（HTML部分）を状態に合わせて書き換える担当

import { ghostColor } from './theme.js?v=20261122025244';
import { choiceView, ownedViews } from './talents.js?v=20261122025244';
import { iconSvg, snapIcons } from './icons.js?v=20261122025244';

const $ = (id) => document.getElementById(id);

// 取得した才能の一覧で使う色。レベルをレア度に対応させる
//   （そのレア度のカード1枚で届くレベル：N＝+1、R＝+2、SR＝+3、MR＝最大／進化）
//   Lv1＝N、Lv2＝R、Lv3〜4＝SR、Lv5（最大）と進化＝MR。レベルのない奥義とカースはSR
export function rarityOfLevel(lv, max, evolved = false) {
  if (evolved) return 'mythic';
  if (max <= 1) return 'super';
  if (lv >= max) return 'mythic';
  if (lv >= 3) return 'super';
  if (lv >= 2) return 'rare';
  return 'normal';
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function createHud() {
  const el = {
    score: $('score'),
    time: $('time'),
    phase: $('phase'),
    shardNum: $('shard-num'),
    shardFill: $('shard-fill'),
    banner: $('banner'),
    bannerText: $('banner-text'),
    bannerSub: $('banner-sub'),
    skill: $('skill'),
    skillTitle: $('skill-title'),
    skillCards: $('skill-cards'),
    rPhase: $('r-phase'),
    ownedCount: $('owned-count'),
    owned: $('owned'),
    ownedBody: $('owned-body'),
    talent: $('talent'),
    talentCard: $('talent-card'),
    bar: $('budget-bar'),
    budgetNum: $('budget-num'),
    recLabel: $('record-label'),
    recText: $('record-text'),
    recHint: $('record-hint'),
    count: $('ghost-count'),
    hint: $('hint'),
    result: $('result'),
    rTime: $('r-time'),
    rKills: $('r-kills'),
    rBest: $('r-best'),
    rScore: $('r-score'),
    rNew: $('r-new'),
    boss: $('boss'),
    bossName: $('boss-name'),
    bossFill: $('boss-fill'),
    bossLag: $('boss-lag'),
  };
  let bossLag = 1; // ボスのHPバーで、減った分が少し遅れて減る白い部分
  let lastPhase = null;
  // 最大ボーナスの札を押すと、その説明を吹き出しで出す（カードを選んだことにはしない）。
  // 次にどこかを押すと閉じる
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.getElementById('stage').appendChild(tip);
  const hideTip = () => tip.classList.remove('show');
  document.addEventListener('click', (e) => {
    const tag = e.target.closest('.bonus-tag');
    if (!tag) { hideTip(); return; }
    e.stopPropagation();
    e.preventDefault();
    const stage = document.getElementById('stage').getBoundingClientRect();
    const r = tag.getBoundingClientRect();
    tip.textContent = tag.dataset.tip;
    tip.style.left = `${r.left - stage.left}px`;
    tip.style.top = `${r.bottom - stage.top + 6}px`;
    tip.classList.add('show');
  }, true);

  // カードが動いて出てくる演出が終わったら、アイコンの位置をもう一度画素に合わせる
  el.skillCards.addEventListener('animationend', () => snapIcons(el.skillCards));
  el.talentCard.addEventListener('transitionend', () => snapIcons(el.talentCard));

  // 才能カードの小窓は、どこを押しても閉じる
  document.getElementById('talent').addEventListener('click', () => hideTalent());

  function update(state) {
    el.score.textContent = state.score.toLocaleString('en-US'); // 3桁ごとに区切る
    el.hint.style.display = state.mode === 'ready' ? '' : 'none'; // 操作待ちの間だけ出す
    el.ownedCount.textContent = Object.keys(state.owned).length + Object.keys(state.skills).length + state.curses.length;  // 取った才能の数
    el.time.textContent = fmtTime(state.time);
    el.phase.textContent = `PHASE ${state.phase}`;
    // ボスのフェーズは、かけらではなくボスを倒すとクリア
    el.shardNum.textContent = state.bossPhase ? 'BOSS' : `${Math.min(state.shards, state.need)}/${state.need}`;
    el.shardFill.style.width = state.bossPhase ? '0%' : `${Math.min(1, state.shards / state.need) * 100}%`;

    // フェーズ開始の表示（最初と最後は少しずつ消える）
    const bt = state.banner.t;
    if (bt > 0) {
      el.bannerText.textContent = state.banner.text;
      el.bannerSub.textContent = state.banner.sub;
      el.banner.style.opacity = String(Math.min(1, bt / 0.4, (1.6 - bt) / 0.15 + 0.3));
    } else {
      el.banner.style.opacity = '0';
    }

    // 軌跡の総量ゲージ
    //   左から古い順に分身の長さを色で並べ、右端に今描いている軌跡（白）を足す。
    //   総量を超えた分は左へ押し出され、押し出される分身は点滅する。
    const r = state.record;
    const budget = state.budget;
    const rec = r.active ? r.length : 0;
    // 「ここまで描けば分身を作れる」目印も、ゲージの中に収まるようにずらす
    const offset = Math.max(0, state.used + Math.max(rec, r.minLength) - budget);
    let html = '';
    let pos = -offset;
    state.ghosts.forEach((g, i) => {
      const left = (pos / budget) * 100;
      const width = (g.len / budget) * 100;
      if (left + width > 0) {
        html += `<div class="seg-ghost${i < state.evict ? ' evict' : ''}" style="left:${left}%;width:${width}%;background:${ghostColor(g.idx)}"></div>`;
      }
      pos += g.len;
    });
    if (rec > 0) {
      html += `<div class="seg-rec${r.enough ? '' : ' short'}" style="left:${(pos / budget) * 100}%;width:${(rec / budget) * 100}%"></div>`;
    }
    const minPos = ((pos + r.minLength) / budget) * 100;
    html += `<div class="bar-min${r.enough ? ' reached' : ''}" style="left:${minPos}%"></div>`;
    el.bar.innerHTML = html;
    el.budgetNum.textContent = `${Math.round(state.used + rec)}/${budget}`;

    const phase = !r.active ? 'idle' : r.enough ? 'ok' : 'short';
    if (phase !== lastPhase) {
      el.recLabel.classList.toggle('on', r.active);
      el.recText.textContent = r.active ? '軌跡を紡ぐ' : '待機中';
      el.recHint.textContent = phase === 'idle' ? 'ドラッグで軌跡を描く'
        : phase === 'short' ? 'もっと長く描くと分身が作れる'
        : '指を離すと分身が生まれる';
      lastPhase = phase;
    }
    el.count.textContent = `分身 ${state.ghosts.length}体`;

    // ボスのHPバー（ボスがいるときだけ）
    const boss = state.boss;
    el.boss.classList.toggle('show', !!boss);
    if (boss) {
      const ratio = Math.max(0, boss.hp / boss.maxHp);
      bossLag = boss.lag != null ? boss.lag : ratio < bossLag ? Math.max(ratio, bossLag - 0.006) : ratio;
      el.bossName.textContent = boss.name;
      el.bossFill.style.width = `${ratio * 100}%`;
      el.bossLag.style.width = `${bossLag * 100}%`;
    }
  }

  // ---------- 新しい才能カード（見本用。仕組みをつなぐときに showSkills もこちらへ移す） ----------
  //   v.kind   … 'boost' | 'skill' | 'curse'
  //   v.sub    … スキルの種類（入口・目覚め・分岐・両立・奥義）
  //   v.road   … 道の名前（ブーストは「共通」）
  //   v.color  … アイコンとタグの色（'boost' | 'ghost' | 'player' | 'curse'）
  //   v.rarity … 'normal' | 'rare' | 'super' | 'mythic'
  //   v.lv / v.gain / v.max … 今のレベル／このカードで上がる数／最大
  //   v.maxOut … いきなり最大（ミシックのブースト）、v.bonus … 最大ボーナスの説明
  //   v.kiwami … 名前の先頭に虹色の「極」、v.evolved … 進化のしるし、v.from … 進化前の名前
  //   v.bind / v.reward … カースの縛りと、引き換えに得るもの
  const RARITY_LABEL = { normal: 'N', rare: 'R', super: 'SR', mythic: 'MR' };
  const KIND_LABEL = { boost: 'ブースト', skill: 'スキル', curse: 'カース' };

  // 最大ボーナス：「名前：説明」の名前だけを出す
  //   説明はカードの一番下に置き（下の余白を上と同じにする）、札を押したときにも吹き出しで出す
  function bonusHtml(text) {
    const [name, desc] = text.split('：');
    return `<div class="card-bonus"><button class="bonus-tag" data-tip="${desc || ''}">最大ボーナス</button>${name}</div>`
      + (desc ? `<div class="card-bonus-desc">${desc}</div>` : '');
  }

  function cardView(v) {
    const curse = v.kind === 'curse';
    let badge = '';
    if (v.evolved) {
      badge = '<span class="card-evo rainbow">進化</span>';
    } else if (v.max > 1) {
      const gain = v.owned ? 0 : v.gain;
      for (let i = 0; i < v.max; i++) {
        const cls = v.maxOut ? ' max' : i < v.lv ? ' on' : i < v.lv + gain ? ' next' : '';
        badge += `<span class="lv${cls}"></span>`;
      }
    } else if (!curse && !v.owned) {
      badge = '<span class="card-new">NEW</span>';
    }
    let lvText = '';
    if (v.maxOut) lvText = ' <small class="card-up">MAX</small>';
    else if (v.max > 1 && !v.evolved && v.owned) lvText = ` <small>Lv${v.lv}</small>`;
    else if (v.max > 1 && !v.evolved) {
      const to = v.lv + v.gain;
      // 持っているものは「Lv1→2」、初めて取るものは「Lv1」（上がった先の数字は金色）
      lvText = v.lv > 0 ? ` <small>Lv${v.lv}→<span class="card-up">${to}</span></small>` : ` <small>Lv<span class="card-up">${to}</span></small>`;
    }
    const name = (v.kiwami ? '<span class="kiwami">極</span>' : '') + v.name + lvText;
    const type = KIND_LABEL[v.kind] + (v.sub ? `<i>｜</i>${v.sub}` : '');
    const body = curse
      ? `<div class="curse-line bind"><b>縛り</b>${v.bind}</div><div class="curse-line gain"><b>代わりに</b>${v.reward}</div>`
      : `<div class="card-desc">${v.desc}</div>${v.bonus ? bonusHtml(v.bonus) : ''}`;
    const html = `
      <span class="card-sheen"></span><span class="card-gem"></span>
      <div class="card-icon">${iconSvg(v.icon)}<span class="card-rarity">${RARITY_LABEL[curse ? 'super' : v.rarity]}</span></div>
      <div class="card-body">
        <div class="card-head">
          <span class="card-type">${type}</span>
          ${v.road ? `<span class="card-target">${v.road}</span>` : ''}
          <span class="card-lv">${badge}</span>
        </div>
        <div class="card-name">${name}${v.from ? `<small class="card-from">${v.from}から進化</small>` : ''}</div>
        ${body}
      </div>`;
    const cls = `card rarity tc-${v.color} type-${v.kind}${curse ? '' : ` r-${v.rarity}`}${v.bonus ? ' has-bonus' : ''}`;
    return { cls, html };
  }

  // 説明の行（ふつうの説明・ボーナスの説明・カースの縛りと代わりに）は、1行に収める。
  //   長いときは、決めた大きさから少しずつ文字を小さくして、横幅に収まったところで止める。
  //   いちばん小さくしても収まらないときだけ、元の大きさに戻して折り返す（小さい字の2行は読みにくいため）
  const ONE_LINE = [
    ['.card-desc', 2.9],
    ['.card-bonus-desc', 2.7],
    ['.curse-line', 2.7],
  ];
  const MIN_SIZE = 2.1;
  function fitLines(root) {
    for (const [sel, base] of ONE_LINE) {
      root.querySelectorAll(sel).forEach((d) => {
        d.style.whiteSpace = 'nowrap';
        let size = base;
        d.style.fontSize = `${size}cqw`;
        while (size > MIN_SIZE && d.scrollWidth > d.clientWidth + 0.5) {
          size = Math.round((size - 0.1) * 10) / 10;
          d.style.fontSize = `${size}cqw`;
        }
        if (d.scrollWidth > d.clientWidth + 0.5) {   // 収まらない：元の大きさに戻して2行にする
          d.style.whiteSpace = '';
          d.style.fontSize = `${base}cqw`;
        }
      });
    }
  }
  // 文字（フォント）の読み込みが終わったら、もう一度合わせる
  if (document.fonts) document.fonts.ready.then(() => fitLines(document));

  // 見本：カードを並べるだけ（押しても何も起きない）
  function showSample(title, sub, views) {
    el.skillTitle.textContent = title;
    el.skill.querySelector('.skill-sub').textContent = sub;
    el.skillCards.innerHTML = '';
    for (const v of views) {
      const { cls, html } = cardView(v);
      const card = document.createElement('div');
      card.className = cls;
      card.innerHTML = html;
      el.skillCards.appendChild(card);
    }
    el.skill.classList.add('show', 'sample');
    fitLines(el.skillCards);
    snapIcons(el.skillCards);
    el.skill.setAttribute('aria-hidden', 'false');
  }

  // 見本：取得した才能の一覧（アイコンの背景はレベルに対応したレア度の色）
  function showOwnedSample(items) {
    el.ownedBody.innerHTML = `<div class="owned-grid">${items.map((v, i) => {
      const r = v.kind === 'curse' || v.sub === '奥義' ? 'super' : rarityOfLevel(v.lv || 0, v.max || 1, v.evolved);   // 奥義とカースはスーパーレアの色
      const num = v.evolved ? '<span class="owned-lvnum evo" aria-label="極"><span class="kiwami-mark rainbow"></span></span>'
        : v.max > 1 ? `<span class="owned-lvnum">${v.lv}</span>` : '';
      return `<button class="owned-tile tc-${v.color} r-${r}${v.kind === 'curse' ? ' curse' : ''}" data-i="${i}">${iconSvg(v.icon)}${num}</button>`;
    }).join('')}</div>`;
    el.ownedBody.querySelectorAll('.owned-tile').forEach((t) => t.addEventListener('click', () => {
      const v = items[t.dataset.i];
      const r = v.kind === 'curse' || v.sub === '奥義' ? 'super' : rarityOfLevel(v.lv || 0, v.max || 1, v.evolved);   // 奥義とカースはスーパーレアの色
      const { cls, html } = cardView({ ...v, owned: true, gain: 0, rarity: r });
      el.talentCard.className = cls;
      el.talentCard.innerHTML = html;
      el.talent.classList.add('show');
      el.talent.setAttribute('aria-hidden', 'false');
      fitLines(el.talentCard);
      snapIcons(el.talentCard);
    }));
    el.owned.classList.add('open');
    el.owned.setAttribute('aria-hidden', 'false');
    snapIcons(el.ownedBody);
  }

  // 見本：才能のアイコンの一覧（名前つき）
  function showIconSample(boosts, curses, roads = []) {
    const total = boosts.length + curses.length + roads.reduce((n, r) => n + r.skills.length, 0);
    el.owned.querySelector('.sheet-title').textContent = `アイコン（${total}）`;
    const cell = (icon, name, color) => `<div class="icon-cell"><div class="owned-tile tc-${color}">${iconSvg(icon)}</div><span class="icon-name">${name}</span></div>`;
    const group = (title, items) => `<div class="icon-group">${title}（${items.length}）</div><div class="icon-grid">${items.join('')}</div>`;
    el.ownedBody.innerHTML =
      group('ブースト', boosts.map((d) => cell(d.id, d.name, 'boost')))
      + group('カース', curses.map((d) => cell(d.id, d.name, 'curse')))
      + roads.map((r) => group(r.name, r.skills.map((k) => cell(`sk_${k.id}`, k.name, 'ghost')))).join('');
    el.owned.classList.add('open');
    el.owned.setAttribute('aria-hidden', 'false');
    snapIcons(el.ownedBody);
  }

  function hideSample() {
    el.skill.classList.remove('show', 'sample');
    el.skill.querySelector('.skill-sub').textContent = '才能を1つ選ぼう';
    el.skill.setAttribute('aria-hidden', 'true');
  }


  // 才能の選択：カードを出し、選ばれたら onPick(番号) を呼ぶ
  function showSkills(state, onPick) {
    el.skillTitle.textContent = `PHASE ${state.phase} CLEAR!`;
    el.skillCards.innerHTML = '';
    state.choices.forEach((ch, i) => {
      const { cls, html } = cardView(choiceView(state, ch));
      const card = document.createElement('button');
      card.className = cls;
      card.innerHTML = html;
      card.addEventListener('click', () => onPick(i), { once: true });
      el.skillCards.appendChild(card);
    });
    el.skill.classList.add('show');
    el.skill.setAttribute('aria-hidden', 'false');
    fitLines(el.skillCards);
    snapIcons(el.skillCards);
  }

  function hideSkills() {
    el.skill.classList.remove('show');
    el.skill.setAttribute('aria-hidden', 'true');
  }

  // 取得した才能の一覧（ゲームの状態から）
  function showOwned(state) {
    showOwnedSample(ownedViews(state));
  }

  function hideTalent() {
    el.talent.classList.remove('show');
    el.talent.setAttribute('aria-hidden', 'true');
  }

  function hideOwned() {
    hideTalent();
    el.owned.querySelector('.sheet-title').textContent = '取得した才能';
    el.owned.classList.remove('open');
    el.owned.setAttribute('aria-hidden', 'true');
  }

  function showResult({ score, time, kills, best, isNew, phase }) {
    el.rPhase.textContent = phase;
    el.rScore.textContent = score;
    el.rNew.classList.toggle('hide', !isNew);
    el.rTime.textContent = fmtTime(time);
    el.rKills.textContent = kills;
    el.rBest.textContent = best;
    el.result.classList.add('show');
    el.result.setAttribute('aria-hidden', 'false');
  }

  function hideResult() {
    el.result.classList.remove('show');
    el.result.setAttribute('aria-hidden', 'true');
  }

  return { update, showOwned, hideOwned, showResult, hideResult, showSkills, hideSkills, showSample, hideSample, showOwnedSample, showIconSample };
}
