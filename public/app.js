// 散樱乱武组牌助手：单机页面。选女神 → 对手女神（可跳过）→ 眼前构筑 7+3 → 完成（保存、分享、开局清单）。
import { MEGAMI, CARDS } from './data.js';
import { BOXES, TYPE_NAMES, NORMAL, SPECIAL, bansFor, variant, label, pool, checkPair, deckPool, checkDeck, encodeDeck, decodeDeck, stats } from './logic.js';
import { SETUP_COMMON, setupFor } from './setup.js';
import { DECKS } from './decks.js';
import { morph, esc } from './dom.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('sk.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sk.' + k, JSON.stringify(v)); } catch { notify('浏览器不让保存，刷新后会丢失'); } },
};

const draft = store.get('draft', { mine: [], opp: [], picked: [] });
const ui = {
  boxes: new Set(store.get('boxes', BOXES.map((b) => b[0]))),
  decks: store.get('decks', []),
  mine: draft.mine, opp: draft.opp, picked: draft.picked,
  three: draft.three || false,   // 三拾一捨：先登记 3 柱，对手去掉 1 柱
  reg: draft.reg || [], cut: draft.cut || null,
  quick: [],            // 速查页单独选的对手女神
  quickDone: false,     // 速查页选好并点了“看对手的牌”
  quickPick: false,     // 点了“换人”：不再用构筑时填的对手
  filter: 'all',
  deckName: '',
  savedId: null,        // 当前牌组已存进“我的卡组”时的 id
  sheet: null,          // { id, old }
  extrasOpen: false,
  review: { stars: 5, text: '', name: store.get('name', ''), sent: false },
  shared: null,         // 打开别人分享的牌组
  rec: { keys: [], open: null, from: '' },   // 推荐卡组：按女神筛选、展开的卡组、从哪一页进来
  busy: false,
};
const saveDraft = () => store.set('draft', { mine: ui.mine, opp: ui.opp, picked: ui.picked, three: ui.three, reg: ui.reg, cut: ui.cut });
// 三拾一捨：对手去掉一柱后，剩下的两柱就是自己的
const applyCut = () => { ui.mine = ui.cut ? ui.reg.filter((s) => s.key !== ui.cut).map((s) => ({ ...s })) : []; ui.picked = []; };

let noticeTimer;
function notify(msg) {
  const n = $('#notice');
  n.textContent = msg; n.classList.add('show');
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => n.classList.remove('show'), 2600);
}

const route = () => location.hash.replace(/^#\/?/, '') || '';
const go = (r) => { if (route() === r) render(); else location.hash = '#/' + r; scrollTo(0, 0); };

// ---------- 小部件 ----------
const tarot = (sel) => {
  const { m, v } = variant(sel);
  const name = { '02-o': 'tarot_02_s6_2', '02-a1': 'tarot_02_a1_s6_2', '02-a2': 'tarot_02_a2_s6_2', '08-o': 'tarot_08_s9_2' }[`${m.key}-${v.code}`]
    || `tarot_${m.key}${v.code === 'o' ? '' : '_' + v.code}`;
  return `/img/tarot/${name}.webp`;
};
const typeTags = (c) => c.types.filter((t) => TYPE_NAMES[t]).map((t) => `<i class="tg t-${t}">${TYPE_NAMES[t]}</i>`).join('');
const kindName = { normal: '通常牌', special: '王牌', poison: '毒', transform: 'TransForm', soldier: '兵员' };
const owner = (id, sels) => sels.findIndex((s) => { const p = pool(s); return [...p.normal, ...p.special, ...p.extra.map((e) => e.id)].includes(id); });

function cardRow(id, { sels, pick = false, picked = false, banned = false, count = 0 } = {}) {
  const c = CARDS[id], who = owner(id, sels);
  const shared = id.startsWith('shared-');
  const tag = shared ? '共用' : who >= 0 ? esc(label(sels[who])) : '';
  return `<div class="crd ${pick ? 'pickable' : ''} ${picked ? 'on' : ''} ${banned ? 'ban' : ''} side${shared ? 2 : who}" data-k="c-${esc(id)}">
    ${pick ? `<button class="crd-hit" data-act="toggle" data-id="${esc(id)}" aria-pressed="${picked}" ${banned ? 'disabled' : ''} aria-label="${picked ? '取消' : '选择'}${esc(c.name)}"></button>` : ''}
    <div class="crd-main">
      <div class="crd-top"><b>${esc(c.name)}</b>${count > 1 ? `<em class="cnt">×${count}</em>` : ''}<span class="who">${tag}</span></div>
      <div class="crd-meta">${typeTags(c)}${stats(c).map((s) => `<span class="st">${esc(s)}</span>`).join('')}${c.updated ? `<span class="upd">${esc(c.updated)} 更新</span>` : ''}${banned ? '<span class="bn">禁止</span>' : ''}</div>
      ${c.summary ? `<p class="crd-sum">${esc(c.summary)}</p>` : ''}
    </div>
    <button class="crd-more" data-act="detail" data-id="${esc(id)}" aria-label="${esc(c.name)} 详情">详情</button>
  </div>`;
}

function sheetHtml() {
  if (!ui.sheet) return '';
  const c = CARDS[ui.sheet.id], old = ui.sheet.old && c.oldImage;
  return `<div class="sheet-bg" data-act="close-sheet"></div>
  <div class="sheet" role="dialog" aria-label="${esc(c.name)}">
    <button class="sheet-x" data-act="close-sheet" aria-label="关闭">×</button>
    <figure class="sheet-img"><img src="/img/cards/${esc(old ? c.oldImage : c.image)}.webp" alt="${esc(c.nameJp)} 卡图" loading="lazy">
      <figcaption>${old ? '中文版印刷时的旧版卡面（日文）' : '最终版卡面（日文）'} · ふるよにコモンズ/BakaFire,TOKIAME</figcaption></figure>
    <h2>${esc(c.name)} <small>${esc(c.nameJp)}</small></h2>
    <div class="crd-meta">${typeTags(c)}${stats(c).map((s) => `<span class="st">${esc(s)}</span>`).join('')}<span class="st">${kindName[c.kind] || ''}</span></div>
    ${c.summary ? `<p class="sheet-sum">${esc(c.summary)}</p>` : '<p class="note">没有额外效果。</p>'}
    ${c.updated ? `<div class="sheet-upd"><b>${esc(c.updated)} 更新</b><p>${esc(c.changeNote)}</p><p class="note">中文版约在 S5 时印刷，你手里的卡面可能还是旧版。本站按最终版 S10-2 写。</p>
      ${c.oldImage ? `<button class="small" data-act="old">${old ? '看最终版卡面' : '看中文版时的旧卡面'}</button>` : ''}</div>` : ''}
    <p class="note">效果为本站自行概括，以实物卡面和官方规则为准。<a href="https://main-bakafire.ssl-lolipop.jp/furuyoni/na/card.html" target="_blank" rel="noopener">官方卡表</a></p>
  </div>`;
}

const steps = (n) => `<ol class="steps">${['我的女神', '对手女神', '构筑'].map((s, i) => `<li class="${i + 1 === n ? 'cur' : i + 1 < n ? 'done' : ''}">${s}</li>`).join('')}</ol>`;
const header = (title, back = '') => `<header class="bar"><button class="back" data-act="go" data-to="${back}" aria-label="返回">‹</button><h1>${title}</h1></header>`;

// ---------- 首页 ----------
// 首页立绘：正在组牌就用自己选的两柱，否则每次打开随机两位
const heroPair = () => {
  const keys = ui.mine.length === 2 ? ui.mine.map((s) => s.key) : [];
  if (!keys.length) {
    const all = MEGAMI.map((m) => m.key);
    while (keys.length < 2) { const k = all[Math.floor(Math.random() * all.length)]; if (!keys.includes(k)) keys.push(k); }
  }
  return keys;
};
let HERO = null;
const PETALS = Array.from({ length: 12 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${7 + (i * 5) % 7}s;--t:-${(i * 13) % 11}s;--s:${0.6 + ((i * 7) % 5) / 10}"></i>`).join('');

function home() {
  const has = ui.mine.length || ui.picked.length;
  HERO ||= heroPair();
  const name = (k) => MEGAMI.find((m) => m.key === k).name;
  return `<section class="hero">
    <div class="petals" aria-hidden="true">${PETALS}</div>
    <a class="back-nav" href="https://boardgame.leisurecat.cloud">‹ 全部游戏</a>
    <a class="rate-nav" href="https://boardgame.leisurecat.cloud/?rate=sakura-arms&back=${encodeURIComponent(location.href)}">★ 写评价</a>
    <div class="hero-title">
      <p class="kicker">桜降る代に決闘を・新幕</p>
      <h1>散樱乱武<span class="seal">组牌<br>助手</span></h1>
    </div>
    <div class="hero-art" aria-hidden="true">
      <img class="girl left" src="/img/megami/${HERO[0]}.webp" alt="">
      <img class="girl right" src="/img/megami/${HERO[1]}.webp" alt="">
    </div>
    <p class="hero-who">今日立绘：${esc(name(HERO[0]))}、${esc(name(HERO[1]))}</p>
  </section>
  <section class="hero-cta">
    <p class="lead">新幕中文版 18 柱女神。选两位女神，从 22 张里组出 7+3，开打前看看对手的牌。</p>
    <button class="primary big" data-act="start">${has ? '重新组一副' : '开始组牌'}</button>
    ${has ? `<button class="ghost wide" data-act="resume">继续上次：${ui.mine.length === 2 ? esc(ui.mine.map(label).join(' + ')) : '还在选女神'}</button>` : ''}
    <a class="teachgo" href="/teach"><span class="tg-i">讲</span><span><b>第一次玩？4 分钟讲规则</b>照着念就能开局，不懂的词点一下</span><i>›</i></a>
  </section>
  <nav class="tiles">
    <button class="feature" data-act="rec-home">
      <span class="fan" aria-hidden="true"><img src="/img/tarot/tarotback.webp" alt=""><img src="/img/tarot/tarot_04.webp" alt=""><img src="/img/tarot/tarot_01.webp" alt=""></span>
      <b>推荐卡组</b><span>${DECKS.length} 套有出处的卡组，按女神挑一套直接用</span></button>
    <button data-act="go" data-to="oppo"><i class="ico" aria-hidden="true">对</i><b>对手速查</b><span>只看对手那 22 张牌</span></button>
    <button data-act="go" data-to="decks"><i class="ico" aria-hidden="true">牌</i><b>我的卡组</b><span>${ui.decks.length ? `已存 ${ui.decks.length} 副` : '存好的牌组都在这'}</span></button>
    <a href="/guide.html"><i class="ico" aria-hidden="true">教</i><b>规则教程</b><span>新手 10 分钟看懂</span></a>
    <a href="/guide.html#faq"><i class="ico" aria-hidden="true">问</i><b>常见问题</b><span>线下容易争的规则</span></a>
  </nav>
  <section class="card">
    <h2>我有的盒子</h2>
    <p class="note">选女神时只显示这些盒子里的女神和异相。对手的女神不受限制。</p>
    <div class="chips">${BOXES.map(([k, n]) => `<button class="chip" data-act="box" data-box="${k}" aria-pressed="${ui.boxes.has(k)}">${n}</button>`).join('')}</div>
  </section>
  ${reviewCard()}
  ${credits()}`;
}

function reviewCard() {
  const r = ui.review;
  return `<section class="card review"><h2>给这个助手打个分</h2>
    <div class="stars" role="radiogroup" aria-label="评分">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${n <= r.stars ? 'on' : ''}" data-act="star" data-v="${n}" role="radio" aria-checked="${n === r.stars}" aria-label="${n} 星">★</button>`).join('')}</div>
    <input id="review-name" maxlength="20" placeholder="你的昵称" value="${esc(r.name)}">
    <textarea id="review-text" maxlength="300" placeholder="一句话说说好不好用（可不填）">${esc(r.text)}</textarea>
    <button class="primary wide" data-act="review" ${ui.busy ? 'disabled' : ''}>${r.sent ? '已提交（再提交会覆盖）' : '提交评价'}</button>
  </section>`;
}

const credits = () => `<footer class="credits">
  <p>本站是玩家自制的非官方工具，不是官方出品。原作《桜降る代に決闘を》（BakaFire Party），<a href="https://main-bakafire.ssl-lolipop.jp/furuyoni/" target="_blank" rel="noopener">新幕官网</a>。中文版由神秘岛桌游发行。</p>
  <p>卡图与塔罗牌图片：ふるよにコモンズ/BakaFire,TOKIAME（<a href="https://main-bakafire.ssl-lolipop.jp/furuyoni/na/rule.html" target="_blank" rel="noopener">素材与使用条款</a>）。卡牌效果为本站自行概括，卡名中文译名参考社区资料，以实物和官方规则为准。</p>
</footer>`;

// ---------- 选女神 ----------
function picker(kind) {
  const three = kind === 'mine' && ui.three, max = three ? 3 : 2;
  const list = kind === 'mine' ? (three ? ui.reg : ui.mine) : kind === 'opp' ? ui.opp : ui.quick;
  const owned = (v) => kind !== 'mine' || ui.boxes.has(v.box);
  const tiles = MEGAMI.filter((m) => m.variants.some(owned)).map((m) => {
    const i = list.findIndex((s) => s.key === m.key), cur = i >= 0 ? list[i] : { key: m.key, code: m.variants.find(owned).code };
    const vs = m.variants.filter(owned);
    return `<div class="mg ${i >= 0 ? 'on' : ''}" data-k="mg-${m.key}">
      <button class="mg-hit" data-act="pick" data-key="${m.key}" data-code="${cur.code}" aria-pressed="${i >= 0}" aria-label="${esc(label(cur))}">
        <img src="${tarot(cur)}" alt="" loading="lazy"><span class="mg-name">${esc(m.name)}</span>${i >= 0 ? `<em class="mg-no">${i + 1}</em>` : ''}</button>
      ${vs.length > 1 ? `<div class="mg-vs">${vs.map((v) => `<button class="${cur.code === v.code ? 'cur' : ''}" data-act="variant" data-key="${m.key}" data-code="${v.code}" aria-pressed="${cur.code === v.code}">${esc(v.weapon)}</button>`).join('')}</div>` : `<div class="mg-vs one"><span>${esc(m.variants[0].weapon)}</span></div>`}
    </div>`;
  }).join('');
  const slots = [...Array(max).keys()].map((i) => list[i]
    ? `<span class="slot full ${three ? (ui.cut === list[i].key ? 'cut' : 'reg') : 'side' + i}">${esc(label(list[i]))}</span>` : '<span class="slot">未选</span>').join('<i>+</i>');
  const final = kind === 'mine' ? ui.mine : list;
  const ban = kind === 'mine' && final.length === 2 && bansFor(final);
  const notes = final.filter((s) => variant(s).v.note).map((s) => `<p class="warn">${esc(label(s))}：${esc(variant(s).v.note)}</p>`).join('');
  const cut = three && list.length === 3 ? `<div class="card cutbox"><h2>对手去掉了哪一柱？</h2>
      <div class="chips">${list.map((s) => `<button class="chip" data-act="cut" data-key="${s.key}" aria-pressed="${ui.cut === s.key}">${esc(label(s))}</button>`).join('')}</div>
      ${ui.cut ? `<p class="note">这局用：${esc(ui.mine.map(label).join(' + '))}</p>` : ''}</div>` : '';
  return `<div class="slots">${slots}</div>${cut}
    ${ban && ban.length ? ban.map((b) => `<p class="warn">${esc(b.text)}</p>`).join('') : ''}${notes}
    <div class="mgrid">${tiles}</div>
    ${kind === 'mine' && MEGAMI.some((m) => !m.variants.some(owned)) ? '<p class="note center">没显示的女神不在你勾选的盒子里，可以回首页改。</p>' : ''}`;
}

function pickView() {
  return `${header('选我的两柱女神', '')}${steps(1)}
  <div class="chips pad"><button class="chip" data-act="three" data-v="0" aria-pressed="${!ui.three}">直接选两柱</button><button class="chip" data-act="three" data-v="1" aria-pressed="${ui.three}">三拾一捨（比赛）</button></div>
  <p class="note pad">${ui.three
    ? '先登记 3 柱，给对手看过、对手去掉 1 柱后，在下面点掉被去掉的那一柱。官方规章没写登记的 3 柱能不能有同一位女神，本工具要求 3 柱各不相同。'
    : '两柱不能是同一位女神（本体和异相也算同一位）。点下方的武器名可以换成异相。'}</p>
  ${picker('mine')}
  <div class="dock"><button class="primary wide" data-act="to-opp" ${checkPair(ui.mine) ? 'disabled' : ''}>下一步：对手的女神</button></div>`;
}

function oppView() {
  return `${header('对手选了谁？', 'pick')}${steps(2)}
  <p class="note pad">眼前构筑要在知道对手两柱女神之后进行。填了对手，构筑时可以随时看他的牌；不填也能组。</p>
  ${picker('opp')}
  <div class="dock two"><button class="ghost" data-act="skip-opp">跳过</button><button class="primary" data-act="to-build" ${checkPair(ui.opp) ? 'disabled' : ''}>下一步：构筑</button></div>`;
}

// ---------- 构筑 ----------
function buildView() {
  if (checkPair(ui.mine)) return pickView();
  const p = deckPool(ui.mine), chk = checkDeck(ui.mine, ui.picked);
  const n = ui.picked.filter((id) => p.normal.includes(id)).length, s = ui.picked.filter((id) => p.special.includes(id)).length;
  const row = (id) => cardRow(id, { sels: ui.mine, pick: true, picked: ui.picked.includes(id), banned: p.banned.includes(id) });
  return `${header('眼前构筑', ui.opp.length ? 'opp' : 'opp')}${steps(3)}
  <div class="counter"><span class="${n === NORMAL ? 'ok' : ''}">通常牌 <b>${n}</b>/${NORMAL}</span><span class="${s === SPECIAL ? 'ok' : ''}">王牌 <b>${s}</b>/${SPECIAL}</span>
    ${ui.opp.length === 2 ? `<button class="small soft" data-act="go" data-to="oppo">对手的牌</button>` : ''}</div>
  ${recBanner(ui.mine)}
  <p class="note pad">${esc(ui.mine.map(label).join(' + '))}：从 ${p.normal.length} 张通常牌里选 7 张，${p.special.length} 张王牌里选 3 张，可以全选同一位女神的牌。组好的牌不用给对手看。${p.normal.length === 13 ? '「合奏」两位共用，只有 1 张，所以通常牌是 13 张。' : ''}</p>
  <h3 class="sec">通常牌</h3><div class="list">${p.normal.map(row).join('')}</div>
  <h3 class="sec">王牌</h3><div class="list">${p.special.map(row).join('')}</div>
  ${extrasBlock(p.extra, ui.mine)}
  <div class="dock"><button class="primary wide" data-act="finish" ${chk.ok ? '' : 'disabled'}>${chk.ok ? '组好了' : `还差 通常牌 ${Math.max(0, NORMAL - n)} · 王牌 ${Math.max(0, SPECIAL - s)}`}</button></div>`;
}

function extrasBlock(extra, sels) {
  if (!extra.length) return '';
  return `<details class="extras" ${ui.extrasOpen ? 'open' : ''} data-k="extras"><summary data-act="extras">追加牌等 ${extra.length} 种（不能选进牌组，开局另放）</summary>
    <div class="list">${extra.map((e) => cardRow(e.id, { sels, count: e.count })).join('')}</div></details>`;
}

// ---------- 完成 / 牌组详情 ----------
function deckBody(sels, picked, opp = []) {
  const p = deckPool(sels);
  const list = (ids) => ids.map((id) => cardRow(id, { sels })).join('');
  return `<h3 class="sec">通常牌 7</h3><div class="list">${list(p.normal.filter((id) => picked.includes(id)))}</div>
    <h3 class="sec">王牌 3</h3><div class="list">${list(p.special.filter((id) => picked.includes(id)))}</div>
    ${setupBlock(sels, opp)}`;
}

// 定先手用总入口的手指轮盘 / 抽签，点「返回」回到这里
const orderUrl = () => `https://boardgame.leisurecat.cloud/?order=2&back=${encodeURIComponent(location.href)}`;

function setupBlock(sels, opp) {
  const mine = sels.flatMap((s) => setupFor(s).map((t) => ({ who: label(s), ...t })));
  const theirs = opp.length === 2 ? opp.flatMap((s) => setupFor(s).map((t) => ({ who: label(s), ...t }))) : [];
  const li = (t) => `<li><b>${esc(t.who)}</b>：${esc(t.text)}<small>${esc(t.source)}</small></li>`;
  return `<section class="card setup"><h2>开局清单</h2>
    <ol class="common">${SETUP_COMMON.map((t) => `<li>${esc(t.text)}${t.order ? ` <a class="order-link" href="${orderUrl()}">手指轮盘定先手 ›</a>` : ''}<small>${esc(t.source)}</small></li>`).join('')}</ol>
    <h3>你这两柱要额外准备</h3>${mine.length ? `<ul>${mine.map(li).join('')}</ul>` : '<p class="note">没有额外组件。</p>'}
    ${opp.length === 2 ? `<h3>对手那两柱要准备</h3>${theirs.length ? `<ul>${theirs.map(li).join('')}</ul>` : '<p class="note">没有额外组件。</p>'}` : ''}
  </section>`;
}

function doneView() {
  const chk = checkDeck(ui.mine, ui.picked);
  if (!chk.ok) return buildView();
  return `${header('牌组组好了', 'build')}
  <section class="deckhead" id="deck-shot"><p class="kicker">散樱乱武 · 新幕</p><h2>${esc(ui.mine.map(label).join(' + '))}</h2>
    ${ui.opp.length === 2 ? `<p class="note">对手：${esc(ui.opp.map(label).join(' + '))}</p>` : ''}
    <ol class="mini">${[...deckPool(ui.mine).normal, ...deckPool(ui.mine).special].filter((id) => ui.picked.includes(id)).map((id) => `<li class="${CARDS[id].kind}">${esc(CARDS[id].name)}</li>`).join('')}</ol></section>
  <div class="actions">
    <input id="deck-name" maxlength="20" placeholder="给牌组起个名（可不填）" value="${esc(ui.deckName)}">
    <button class="primary wide" data-act="save">${ui.savedId ? '已存进我的卡组（再点会更新）' : '存进我的卡组'}</button>
    <div class="two"><button data-act="share">复制分享链接</button><button data-act="shot">存成图片</button></div>
  </div>
  ${deckBody(ui.mine, ui.picked, ui.opp)}
  ${credits()}`;
}

function decksView() {
  return `${header('我的卡组', '')}
  ${ui.decks.length ? `<div class="list decks">${ui.decks.map((d) => `<div class="deckrow" data-k="d-${d.id}">
      <button class="deck-hit" data-act="open-deck" data-id="${d.id}"><b>${esc(d.name || d.sels.map(label).join(' + '))}</b><span>${esc(d.sels.map(label).join(' + '))} · ${new Date(d.at).toLocaleDateString('zh-CN')}</span></button>
      <button class="small ghost" data-act="del-deck" data-id="${d.id}">删除</button></div>`).join('')}</div>`
    : '<p class="empty">还没有存过牌组。组好一副后点“存进我的卡组”。</p>'}
  <p class="note pad">牌组只存在这台手机的浏览器里，换手机或清缓存会丢。要备份就复制分享链接。</p>`;
}

function sharedView() {
  const { sels, picked } = ui.shared;
  return `${header('别人分享的牌组', '')}
  <section class="deckhead"><p class="kicker">散樱乱武 · 新幕</p><h2>${esc(sels.map(label).join(' + '))}</h2></section>
  <div class="actions"><button class="primary wide" data-act="adopt">用这副牌（可以再改）</button></div>
  ${deckBody(sels, picked)}`;
}

// ---------- 对手速查 ----------
function oppoView() {
  const fromBuild = !ui.quickPick && ui.opp.length === 2;
  const sels = fromBuild ? ui.opp : ui.quickDone ? ui.quick : [];
  if (checkPair(sels)) {
    return `${header('对手速查', '')}<p class="note pad">选对手的两柱女神，只看他的 22 张牌。</p>${picker('quick')}
      <div class="dock"><button class="primary wide" data-act="quick-go" ${checkPair(ui.quick) ? 'disabled' : ''}>看对手的牌</button></div>`;
  }
  const p = deckPool(sels), f = ui.filter;
  const keep = (id) => f === 'all' || CARDS[id].types.includes(f);
  const row = (id) => keep(id) ? cardRow(id, { sels }) : '';
  const types = ['all', 'attack', 'reaction', 'fullpower', 'enhance', 'action'];
  return `${header('对手速查', fromBuild ? 'build' : '')}
  <div class="counter"><span>${esc(sels.map(label).join(' + '))}</span><button class="small soft" data-act="quick-reset">换人</button></div>
  <div class="chips pad">${types.map((t) => `<button class="chip" data-act="filter" data-f="${t}" aria-pressed="${f === t}">${t === 'all' ? '全部' : TYPE_NAMES[t]}</button>`).join('')}</div>
  <p class="note pad">对手会从这些牌里秘密选 7 张通常牌和 3 张王牌，所以每张都可能出现。</p>
  <h3 class="sec">通常牌</h3><div class="list">${p.normal.map(row).join('') || '<p class="empty">这一类没有通常牌</p>'}</div>
  <h3 class="sec">王牌</h3><div class="list">${p.special.map(row).join('') || '<p class="empty">这一类没有王牌</p>'}</div>
  ${extrasBlock(p.extra, sels)}`;
}

// ---------- 推荐卡组 ----------
const KIND = { official: ['官方', '官方样例牌组'], tournament: ['大会', '大会上位卡组'], guide: ['攻略', '攻略作者推荐'], community: ['投稿', '玩家投稿'] };
const hasKeys = (d, keys) => keys.every((k) => d.sels.some((s) => s.key === k));
const recBanner = (sels) => {
  const keys = sels.map((s) => s.key), n = DECKS.filter((d) => hasKeys(d, keys)).length;
  return n ? `<button class="recbar" data-act="rec-pair">${esc(keys.map((k) => MEGAMI.find((m) => m.key === k).name).join('、'))}的推荐卡组有 ${n} 套 ›</button>` : '';
};

function recCard(d) {
  const open = ui.rec.open === d.id, fmt = (n) => n.toLocaleString('zh-CN');
  const facts = [d.result ? `成绩：${esc(d.result.text)}` : '', d.heat ? `出处热度：浏览 ${fmt(d.heat.views)}、收藏 ${fmt(d.heat.favs)}` : ''].filter(Boolean);
  return `<article class="rec ${open ? 'open' : ''}" data-k="rec-${d.id}">
    <button class="rec-hit" data-act="rec-open" data-id="${d.id}" aria-expanded="${open}">
      <span class="rec-top"><b>${esc(d.sels.map(label).join(' + '))}</b><i class="kind k-${d.kind}">${KIND[d.kind][0]}</i></span>
      <span class="rec-sub">${d.title ? `「${esc(d.title)}」 · ` : ''}${esc(d.author)} · ${d.season === 'S10-2' ? esc(d.date) : `${esc(d.season)} 年规则书`}</span>
      <span class="rec-metric">强度：无数据${facts.length ? ' · ' + facts.join(' · ') : ''}</span>
    </button>
    ${open ? `<div class="rec-body">
      <p class="rec-note">${esc(d.note)}</p>
      ${d.season !== 'S10-2' ? (() => { const ch = d.ids.filter((id) => CARDS[id].updated); return `<p class="warn">这是 ${esc(d.season)} 年的构筑，不代表最终版 S10-2 环境下的强度。${ch.length ? `卡单里之后改过的牌：${ch.map((id) => `「${esc(CARDS[id].name)}」（${esc(CARDS[id].updated)}）`).join('')}，效果以本站写的最终版为准。` : ''}</p>`; })() : ''}
      <div class="list">${d.ids.map((id) => cardRow(id, { sels: d.sels })).join('')}</div>
      <div class="two"><button class="primary" data-act="rec-use" data-id="${d.id}">用这副牌组牌</button><button data-act="rec-save" data-id="${d.id}">存进我的卡组</button></div>
      <ul class="rec-src">
        <li>来源类型：${KIND[d.kind][1]}</li>
        <li>出处：<a href="${esc(d.source.url)}" target="_blank" rel="noopener">${esc(d.source.name)} ↗</a></li>
        ${(d.also || []).map((a) => `<li>同样的卡单也见于：<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name)} ↗</a></li>`).join('')}
        ${d.result ? `<li>成绩出处：<a href="${esc(d.result.url)}" target="_blank" rel="noopener">${esc(d.result.text)} ↗</a></li>` : ''}
        ${d.heat ? `<li>出处热度是整篇文章的浏览、点赞（${fmt(d.heat.likes)}）和收藏数，${esc(d.heat.at)} 读取，一篇文章里有好几套卡组，不代表这套的强度。</li>` : ''}
        <li>卡组按新幕最终版 S10-2 的卡池和禁止卡校验过，是合法的 7+3；打法要点是本站根据来源概括的。</li>
      </ul>
    </div>` : ''}
  </article>`;
}

function recView() {
  const keys = ui.rec.keys, list = DECKS.filter((d) => hasKeys(d, keys));
  const count = (k) => DECKS.filter((d) => hasKeys(d, [k])).length;
  return `${header('推荐卡组', ui.rec.from)}
  <p class="note pad">${DECKS.length} 套卡组：官方入门样例 ${DECKS.filter((d) => d.kind === 'official').length} 套，其余都是新幕 S10-2 时期网上公开的大会卡组、攻略和玩家投稿，每套注明出处。来源里没有卡组的胜率或使用率，所以强度一律写“无数据”，只列出来源本身有的信息：大会成绩、文章热度。</p>
  <div class="chips pad recchips">${MEGAMI.filter((m) => count(m.key)).map((m) => `<button class="chip" data-act="rec-key" data-key="${m.key}" aria-pressed="${keys.includes(m.key)}">${esc(m.name)} <small>${count(m.key)}</small></button>`).join('')}
    ${keys.length ? '<button class="chip clear" data-act="rec-clear">清空</button>' : ''}</div>
  <p class="note pad">${keys.length ? `含${esc(keys.map((k) => MEGAMI.find((m) => m.key === k).name).join('和'))}的卡组 ${list.length} 套` : '点女神名筛选，最多选两位'}</p>
  <div class="recs">${list.map(recCard).join('') || `<p class="empty">这两位女神的组合还没有收录卡组。</p>`}</div>
  ${credits()}`;
}

// ---------- 渲染 ----------
function view() {
  const r = route();
  if (r.startsWith('d/')) {
    try { ui.shared = decodeDeck(decodeURIComponent(r.slice(2))); } catch (e) { return `${header('分享链接', '')}<p class="empty">${esc(e.message)}，请让对方重新复制链接。</p>`; }
    return sharedView();
  }
  return { pick: pickView, opp: oppView, build: buildView, done: doneView, decks: decksView, oppo: oppoView, rec: recView }[r]?.() ?? home();
}
function render() {
  const t = document.createElement('div');
  t.innerHTML = view();
  morph($('#app'), t);
  const s = document.createElement('div');
  s.innerHTML = sheetHtml();
  morph($('#sheet'), s);
  document.body.classList.toggle('noscroll', !!ui.sheet);
}

// ---------- 交互 ----------
function choose(list, key, code, max = 2) {
  const i = list.findIndex((s) => s.key === key);
  if (i >= 0) { list.splice(i, 1); return; }
  if (list.length >= max) { notify(max === 3 ? '已经登记了三柱，先点掉一柱再选' : '已经选了两柱，先点掉一柱再选'); return; }
  list.push({ key, code });
}
const listFor = () => ({ pick: ui.three ? ui.reg : ui.mine, opp: ui.opp, oppo: ui.quick }[route()]);

async function act(b) {
  const a = b.dataset.act;
  if (a === 'go') return go(b.dataset.to);
  if (a === 'start') { ui.mine = []; ui.opp = []; ui.picked = []; ui.reg = []; ui.cut = null; ui.savedId = null; ui.deckName = ''; saveDraft(); return go('pick'); }
  if (a === 'resume') return go(ui.mine.length === 2 ? 'build' : 'pick');
  if (a === 'box') {
    const k = b.dataset.box;
    if (ui.boxes.has(k)) ui.boxes.delete(k); else ui.boxes.add(k);
    if (!ui.boxes.size) { ui.boxes.add(k); notify('至少要有一个盒子'); }
    store.set('boxes', [...ui.boxes]);
  } else if (a === 'pick') {
    const list = listFor();
    if (list === ui.quick) ui.quickDone = false;
    const before = JSON.stringify(ui.mine);
    choose(list, b.dataset.key, b.dataset.code, list === ui.reg ? 3 : 2);
    if (list === ui.reg) { if (!ui.reg.some((s) => s.key === ui.cut)) ui.cut = null; applyCut(); }
    if (list === ui.mine && JSON.stringify(ui.mine) !== before) ui.picked = [];
  } else if (a === 'variant') {
    const list = listFor(), s = list.find((x) => x.key === b.dataset.key);
    if (s) { s.code = b.dataset.code; if (list === ui.mine) ui.picked = []; } else choose(list, b.dataset.key, b.dataset.code, list === ui.reg ? 3 : 2);
    if (list === ui.reg) applyCut();
  } else if (a === 'three') { ui.three = b.dataset.v === '1'; ui.cut = null; ui.reg = ui.three ? ui.mine.map((x) => ({ ...x })) : []; if (ui.three) applyCut(); }
  else if (a === 'cut') { ui.cut = b.dataset.key; applyCut(); } else if (a === 'to-opp') return (saveDraft(), go('opp'));
  else if (a === 'skip-opp') { ui.opp = []; saveDraft(); return go('build'); }
  else if (a === 'to-build') return (saveDraft(), go('build'));
  else if (a === 'toggle') {
    const id = b.dataset.id, i = ui.picked.indexOf(id);
    if (i >= 0) ui.picked.splice(i, 1);
    else {
      const p = deckPool(ui.mine), isN = p.normal.includes(id);
      const n = ui.picked.filter((x) => (isN ? p.normal : p.special).includes(x)).length;
      if (n >= (isN ? NORMAL : SPECIAL)) { notify(isN ? '通常牌已经选满 7 张，先点掉一张' : '王牌已经选满 3 张，先点掉一张'); return; }
      ui.picked.push(id);
    }
    ui.savedId = null;
  } else if (a === 'finish') return (saveDraft(), go('done'));
  else if (a === 'detail') ui.sheet = { id: b.dataset.id, old: false };
  else if (a === 'old') ui.sheet.old = !ui.sheet.old;
  else if (a === 'close-sheet') ui.sheet = null;
  else if (a === 'extras') { ui.extrasOpen = !ui.extrasOpen; }
  else if (a === 'save') {
    const d = { id: ui.savedId || Date.now().toString(36), name: ui.deckName.trim(), sels: ui.mine, picked: ui.picked, at: Date.now() };
    ui.decks = [d, ...ui.decks.filter((x) => x.id !== d.id)];
    store.set('decks', ui.decks); ui.savedId = d.id; notify('已存进我的卡组');
  } else if (a === 'share') {
    const url = `${location.origin}/#/d/${encodeDeck(ui.mine, ui.picked)}`;
    try { await navigator.clipboard.writeText(url); notify('链接已复制'); }
    catch { prompt('复制下面的链接', url); }
  } else if (a === 'shot') return shot();
  else if (a === 'open-deck') {
    const d = ui.decks.find((x) => x.id === b.dataset.id);
    ui.mine = d.sels; ui.picked = d.picked; ui.opp = []; ui.three = false; ui.reg = []; ui.cut = null; ui.savedId = d.id; ui.deckName = d.name; saveDraft(); return go('done');
  } else if (a === 'del-deck') {
    if (!confirm('删除这副牌组？')) return;
    ui.decks = ui.decks.filter((x) => x.id !== b.dataset.id); store.set('decks', ui.decks);
  } else if (a === 'adopt') {
    ui.mine = ui.shared.sels; ui.picked = ui.shared.picked; ui.opp = []; ui.three = false; ui.reg = []; ui.cut = null; ui.savedId = null; ui.deckName = ''; saveDraft(); return go('build');
  } else if (a === 'quick-go') ui.quickDone = true;
  else if (a === 'quick-reset') { ui.quick = []; ui.quickDone = false; ui.quickPick = true; ui.filter = 'all'; }
  else if (a === 'filter') ui.filter = b.dataset.f;
  else if (a === 'rec-home') { ui.rec = { keys: [], open: null, from: '' }; return go('rec'); }
  else if (a === 'rec-pair') { ui.rec = { keys: ui.mine.map((s) => s.key), open: null, from: 'build' }; return go('rec'); }
  else if (a === 'rec-key') {
    const k = b.dataset.key, keys = ui.rec.keys;
    if (keys.includes(k)) keys.splice(keys.indexOf(k), 1);
    else if (keys.length >= 2) { notify('最多选两位女神，先点掉一位'); return; }
    else keys.push(k);
    ui.rec.open = null;
  } else if (a === 'rec-clear') { ui.rec.keys = []; ui.rec.open = null; }
  else if (a === 'rec-open') ui.rec.open = ui.rec.open === b.dataset.id ? null : b.dataset.id;
  else if (a === 'rec-use') {
    const d = DECKS.find((x) => x.id === b.dataset.id);
    if (ui.picked.length && !confirm('会替换你正在组的牌，继续吗？')) return;
    ui.mine = d.sels.map((s) => ({ ...s })); ui.picked = [...d.ids]; ui.three = false; ui.reg = []; ui.cut = null;
    ui.savedId = null; ui.deckName = d.title || ''; saveDraft(); notify('已载入，可以接着改'); return go('build');
  } else if (a === 'rec-save') {
    const d = DECKS.find((x) => x.id === b.dataset.id);
    ui.decks = [{ id: Date.now().toString(36), name: d.title || d.sels.map(label).join(' + '), sels: d.sels.map((s) => ({ ...s })), picked: [...d.ids], at: Date.now() }, ...ui.decks];
    store.set('decks', ui.decks); notify('已存进我的卡组');
  }
  else if (a === 'star') ui.review.stars = Number(b.dataset.v);
  else if (a === 'review') return review();
  render();
}

async function review() {
  const r = ui.review;
  if (!r.name.trim()) { notify('先填个昵称'); return; }
  ui.busy = true; render();
  try {
    const res = await fetch('https://boardgame.leisurecat.cloud/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ game: 'sakura-arms', name: r.name.trim(), room: device(), stars: r.stars, text: r.text }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `评价没提交上（${res.status}）`);
    r.sent = true; store.set('name', r.name.trim()); notify('评价已提交，谢谢');
  } catch (e) { notify(e.message === 'Failed to fetch' ? '网络连接失败，评价没提交上' : e.message); }
  ui.busy = false; render();
}
// 评价接口按“游戏 + room + 昵称”去重；单机站没有房间，用这台设备的随机码代替。
function device() {
  let d = store.get('device', '');
  if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => 'abcdefghjkmnpqrstuvwxyz23456789'[n % 31]).join(''); store.set('device', d); }
  return d;
}

async function shot() {
  if (!window.html2canvas) { notify('图片工具还没载入，请稍等再试'); return; }
  try {
    const c = await html2canvas($('#deck-shot'), { backgroundColor: '#fdf8f4', scale: 2 });
    const url = c.toDataURL('image/png');
    ui.sheet = null;
    $('#sheet').innerHTML = `<div class="sheet-bg" data-act="close-sheet"></div><div class="sheet"><button class="sheet-x" data-act="close-sheet" aria-label="关闭">×</button><p class="note">长按图片保存或转发。</p><img class="shot" src="${url}" alt="牌组图片"></div>`;
  } catch (e) { notify('生成图片失败：' + e.message); }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (b.tagName === 'SUMMARY') e.preventDefault();
  act(b).catch((err) => notify(err.message));
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'deck-name') ui.deckName = e.target.value;
  if (e.target.id === 'review-name') ui.review.name = e.target.value;
  if (e.target.id === 'review-text') ui.review.text = e.target.value;
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); } });
addEventListener('hashchange', () => { ui.sheet = null; render(); scrollTo(0, 0); });
render();
