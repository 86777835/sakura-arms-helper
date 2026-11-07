// 规则逻辑：牌池、异相替换、共用卡、禁止卡、7+3 校验、分享码。不需要服务器。
import assert from 'node:assert/strict';
import { MEGAMI, CARDS } from '../public/data.js';
import { pool, deckPool, checkPair, checkDeck, encodeDeck, decodeDeck, variant } from '../public/logic.js';

const S = (key, code = 'o') => ({ key, code });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('18 柱女神、13 个异相，盒子归属齐全', () => {
  assert.equal(MEGAMI.length, 18);
  assert.equal(MEGAMI.reduce((s, m) => s + m.variants.length - 1, 0), 13);
  for (const m of MEGAMI) for (const v of m.variants) assert.ok(['basic', 'expert', 'ex1', 'ex2', 'ex3', 'ex4'].includes(v.box), m.key + v.code);
});

t('每个形态的牌池都是 7 张通常牌 + 4 张王牌，且都有数据', () => {
  for (const m of MEGAMI) for (const v of m.variants) {
    const p = pool(S(m.key, v.code));
    assert.equal(p.normal.length, 7, m.key + v.code);
    assert.equal(p.special.length, 4, m.key + v.code);
    for (const id of [...p.normal, ...p.special, ...p.extra.map((e) => e.id)]) assert.ok(CARDS[id], '缺卡 ' + id);
    for (const id of p.normal) assert.equal(CARDS[id].kind === 'special', false, id);
    for (const id of p.special) assert.equal(CARDS[id].kind, 'special', id);
  }
});

t('异相按卡位替换：摇波『第一章』换掉 N1、N6、S2', () => {
  const o = pool(S('01')), a = pool(S('01', 'a1'));
  assert.deepEqual(a.normal.filter((id, i) => id !== o.normal[i]), ['01-yurina-a1-n-1', '01-yurina-a1-n-6']);
  assert.deepEqual(a.special.filter((id, i) => id !== o.special[i]), ['01-yurina-a1-s-2']);
});

t('两柱合计 22 张；第二章细音 + 旅艺人常世 共用「合奏」只有 13 张通常牌', () => {
  const p = deckPool([S('01'), S('02')]);
  assert.equal(p.normal.length + p.special.length, 22);
  const q = deckPool([S('02', 'a1'), S('04', 'a1')]);
  assert.equal(q.normal.length, 13);
  assert.equal(q.special.length, 8);
  assert.equal(q.normal.filter((id) => id.startsWith('shared-')).length, 1);
});

t('同一位女神不能选两柱（本体和异相也不行）', () => {
  assert.ok(checkPair([S('01'), S('01', 'a1')]));
  assert.ok(checkPair([S('01')]));
  assert.equal(checkPair([S('01'), S('02')]), null);
  assert.throws(() => deckPool([S('02'), S('02', 'a2')]));
});

t('追加牌跟着来源牌走：雷螺『祈祷師』换掉 S3，风魔三张就不放', () => {
  assert.equal(pool(S('12')).extra.filter((e) => e.id.startsWith('12-raira-o-s-3-ex')).length, 3);
  assert.equal(pool(S('12', 'a1')).extra.filter((e) => e.id.startsWith('12-raira-o-s-3-ex')).length, 0);
  assert.ok(pool(S('12', 'a1')).extra.some((e) => e.id === '12-raira-a1-st'));
  const k = pool(S('10', 'a1')).extra.map((e) => e.id);
  assert.deepEqual(k, ['10-kururu-a1-s-3-ex1']);
  assert.equal(pool(S('10')).extra[0].count, 3);
});

t('萨莉娅『帰還』的 TransForm：同编号替换，其余保留', () => {
  assert.deepEqual(pool(S('11')).extra.map((e) => e.id), ['11-thallya-o-tf-1', '11-thallya-o-tf-2', '11-thallya-o-tf-3']);
  assert.deepEqual(pool(S('11', 'a1')).extra.map((e) => e.id).sort(), ['11-thallya-a1-tf-1', '11-thallya-a1-tf-3', '11-thallya-a1-tf-4', '11-thallya-o-tf-2'].sort());
});

t('千影的毒、水津城的兵员不受异相影响；灭灯毒 2 张、枪兵 2 张', () => {
  const c = pool(S('09', 'a1')).extra;
  assert.equal(c.find((e) => e.id === '09-chikage-o-p-4').count, 2);
  assert.equal(c.length, 4);
  assert.equal(pool(S('18')).extra.find((e) => e.id === '18-mizuki-o-t-1').count, 2);
});

t('7+3 分开计数', () => {
  const sels = [S('01'), S('02')], p = deckPool(sels);
  const ok = [...p.normal.slice(0, 7), ...p.special.slice(0, 3)];
  assert.equal(checkDeck(sels, ok).ok, true);
  assert.equal(checkDeck(sels, [...p.normal.slice(0, 8), ...p.special.slice(0, 2)]).ok, false);
  assert.equal(checkDeck(sels, [...p.normal.slice(0, 6), ...p.special.slice(0, 4)]).ok, false);
  assert.equal(checkDeck(sels, [...p.normal.slice(0, 7)]).ok, false);
  assert.equal(checkDeck(sels, [...p.normal.slice(0, 6), '03-himika-o-n-1', ...p.special.slice(0, 3)]).ok, false);
  // 7 张通常牌全来自同一柱也可以
  assert.equal(checkDeck(sels, [...pool(S('01')).normal, ...p.special.slice(0, 3)]).ok, true);
});

t('组合禁止：本体绯弥香 + 本体虚路 时不能选「レッドバレット」，换成异相或其他组合可以', () => {
  const sels = [S('03'), S('13')], p = deckPool(sels);
  assert.deepEqual(p.banned, ['03-himika-o-s-1']);
  const deck = [...p.normal.slice(0, 7), '03-himika-o-s-1', ...p.special.filter((id) => id !== '03-himika-o-s-1').slice(0, 2)];
  assert.equal(checkDeck(sels, deck).ok, false);
  assert.deepEqual(deckPool([S('03'), S('01')]).banned, []);
  assert.deepEqual(deckPool([S('03', 'a1'), S('13')]).banned, []);
  assert.deepEqual(deckPool([S('03'), S('13', 'a1')]).banned, []);
  assert.ok(deckPool([S('03', 'a1'), S('13')]).special.includes('03-himika-o-s-1'));
  assert.equal(CARDS['03-himika-o-s-1'].nameJp, 'レッドバレット');
});

t('分享码来回一致，坏码报错', () => {
  const sels = [S('02', 'a1'), S('04', 'a1')], p = deckPool(sels);
  const picked = [p.normal[0], p.normal[3], p.normal[5], p.normal[7], p.normal[9], p.normal[11], p.normal[12], p.special[1], p.special[4], p.special[7]];
  const code = encodeDeck(sels, picked);
  const back = decodeDeck(code);
  assert.deepEqual(back.sels, sels);
  assert.deepEqual(back.picked.sort(), picked.sort());
  for (const bad of ['', 'x', '01o.01a1.1.1', '99o.02o.1.1', '01o.02o.zzzzzzzz.1']) assert.throws(() => decodeDeck(bad), bad);
});

t('每张中文版之后改过的卡都有更新说明', () => {
  for (const c of Object.values(CARDS)) if (c.updated) assert.ok(c.changeNote, c.id);
  assert.ok(Object.values(CARDS).filter((c) => c.updated).length >= 50);
});

t('不发布官方卡面文字', () => {
  for (const c of Object.values(CARDS)) assert.equal('textJp' in c || 'textCn' in c, false);
});

void variant;
console.log(`全部通过（${n} 项）`);
