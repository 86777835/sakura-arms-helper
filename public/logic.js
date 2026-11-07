// 组牌规则（新幕，依据総合ルール与规则书）。页面和测试共用，不依赖 DOM。
import { MEGAMI, CARDS } from './data.js';

export const BOXES = [
  ['basic', '基本'], ['expert', '达人'], ['ex1', '第一扩展'], ['ex2', '第二扩展'], ['ex3', '第三扩展'], ['ex4', '第四扩展'],
];
export const TYPE_NAMES = { attack: '攻击', action: '行动', enhance: '付与', reaction: '对应', fullpower: '全力', variable: '不定', transform: '变形' };
export const NORMAL = 7, SPECIAL = 3;

// 新幕最终的禁止卡（2026-03 禁止改定，此后没有再改）：全体禁止没有；组合禁止只有一条——
// 同一名玩家宿本体ヒミカ + 本体ウツロ时，不能选「レッドバレット」。任一柱换成异相（『原初』或『終章』）就可以选。
export const BANS = [{ sels: [{ key: '03', code: 'o' }, { key: '13', code: 'o' }], card: '03-himika-o-s-1',
  text: '绯弥香（本体）和虚路（本体）同时选时，「真红凶弹」禁止使用；任一柱换成异相就可以用（新幕最终禁止改定）' }];
export const bansFor = (sels) => BANS.filter((b) => b.sels.every((x) => sels.some((s) => s.key === x.key && s.code === x.code)));

export const megami = (key) => MEGAMI.find((m) => m.key === key);
export function variant(sel) {
  const m = megami(sel?.key);
  const v = m?.variants.find((x) => x.code === sel.code);
  if (!v) throw new Error('没有这个女神形态：' + JSON.stringify(sel));
  return { m, v, o: m.variants[0] };
}
export const label = (sel) => { const { m, v } = variant(sel); return v.code === 'o' ? m.name : `${m.name}·${v.weapon}`; };

// 一柱女神（含异相替换）的牌池：通常牌 7、王牌 4，加上不能选入牌组的追加牌等。
export function pool(sel) {
  const { v, o } = variant(sel);
  const normal = o.normal.map((c) => c.id), special = o.special.map((c) => c.id);
  if (v !== o) {
    for (const c of v.normal) normal[c.replaces - 1] = c.id;
    for (const c of v.special) special[c.replaces - 1] = c.id;
  }
  const inPool = new Set([...normal, ...special]);
  const extra = [];
  const tfNo = (id) => id.match(/-tf-(\d+)$/)?.[1];
  const vTf = new Set(v === o ? [] : v.extra.map((e) => tfNo(e.id)).filter(Boolean));
  for (const e of v === o ? o.extra : [...o.extra, ...v.extra]) {
    const parent = e.id.match(/^(.*)-ex\d+$/)?.[1];
    if (parent && !inPool.has(parent)) continue;                    // 追加牌跟着它的来源牌走
    if (v !== o && o.extra.includes(e) && vTf.has(tfNo(e.id))) continue; // 异相的 TransForm 牌替换同编号的
    extra.push(e);
  }
  return { normal, special, extra };
}

export function checkPair(sels) {
  if (sels.length !== 2) return '要选 2 柱女神';
  if (sels[0].key === sels[1].key) return '两柱女神不能是同一位（本体和异相也不行）';
  return null;
}

// 两柱合计的牌池。「合奏」这类共用卡只算 1 张。
export function deckPool(sels) {
  const err = checkPair(sels);
  if (err) throw new Error(err);
  const ps = sels.map(pool);
  const uniq = (a) => [...new Set(a)];
  const banned = bansFor(sels).map((b) => b.card);
  return {
    normal: uniq(ps.flatMap((p) => p.normal)), special: uniq(ps.flatMap((p) => p.special)),
    extra: ps.flatMap((p) => p.extra), banned,
  };
}

// 眼前構築：通常牌 7、王牌 3，分开计数；只能从牌池里选；禁止卡不能选。
export function checkDeck(sels, picked) {
  const p = deckPool(sels);
  const n = picked.filter((id) => p.normal.includes(id)), s = picked.filter((id) => p.special.includes(id));
  const out = picked.filter((id) => !p.normal.includes(id) && !p.special.includes(id));
  if (out.length) return { ok: false, error: '有不在牌池里的牌：' + out.map((id) => CARDS[id]?.name || id).join('、') };
  const ban = picked.filter((id) => p.banned.includes(id));
  if (ban.length) return { ok: false, error: '选了禁止卡：' + ban.map((id) => CARDS[id].name).join('、') };
  if (new Set(picked).size !== picked.length) return { ok: false, error: '同一张牌选了两次' };
  if (n.length !== NORMAL || s.length !== SPECIAL) return { ok: false, error: `还差：通常牌 ${n.length}/${NORMAL}，王牌 ${s.length}/${SPECIAL}`, normal: n.length, special: s.length };
  return { ok: true, normal: n.length, special: s.length };
}

// 分享码：01o.02a1.<通常牌位图>.<王牌位图>，位图按牌池顺序。
export function encodeDeck(sels, picked) {
  const p = deckPool(sels);
  const bits = (list) => list.reduce((a, id, i) => (picked.includes(id) ? a | (1 << i) : a), 0).toString(36);
  return [...sels.map((s) => s.key + s.code), bits(p.normal), bits(p.special)].join('.');
}
export function decodeDeck(code) {
  const parts = String(code || '').split('.');
  if (parts.length !== 4) throw new Error('分享码格式不对');
  const sels = parts.slice(0, 2).map((x) => {
    const m = x.match(/^(\d\d)(o|a\d)$/);
    if (!m) throw new Error('分享码格式不对');
    return { key: m[1], code: m[2] };
  });
  sels.forEach(variant);
  const p = deckPool(sels);
  const pick = (list, b) => {
    const n = parseInt(b, 36);
    if (!Number.isSafeInteger(n) || n < 0 || n >= 2 ** list.length) throw new Error('分享码格式不对');
    return list.filter((_, i) => n & (1 << i));
  };
  const picked = [...pick(p.normal, parts[2]), ...pick(p.special, parts[3])];
  return { sels, picked };
}

// 卡面上的数值，按类型拼成短文字。
export function stats(c) {
  const out = [];
  if (c.range || c.damage) out.push(`${c.range ? '距' + c.range : ''} ${c.damage || ''}`.trim());
  if (c.rangeOpened || c.damageOpened) out.push(`开伞 ${c.rangeOpened ? '距' + c.rangeOpened : ''} ${c.damageOpened || ''}`.trim());
  if (c.capacity != null) out.push('纳' + c.capacity);
  if (c.cost != null) out.push('消耗' + c.cost);
  return out;
}
