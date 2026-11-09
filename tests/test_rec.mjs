// 推荐卡组：数据都合法、有出处、不编指标；界面筛选、展开、载入构筑、存进我的卡组、构筑页的入口。
import assert from 'node:assert/strict';
import { DECKS } from '../public/decks.js';
import { checkDeck } from '../public/logic.js';
import { BASE, browser, phone, shot, act, pickMegami, counts } from './helpers.mjs';

// 数据
assert.ok(DECKS.length >= 50);
const ids = new Set();
for (const d of DECKS) {
  assert.equal(checkDeck(d.sels, d.ids).ok, true, d.id);
  assert.ok(!ids.has(d.id), '重复 id ' + d.id); ids.add(d.id);
  assert.match(d.source.url, /^https:\/\//, d.id);
  assert.ok(d.note && d.author && /^\d{4}-\d\d-\d\d$/.test(d.date), d.id);
  assert.ok(['official', 'tournament', 'guide', 'community'].includes(d.kind), d.id);
  for (const k of Object.keys(d)) assert.ok(['id', 'kind', 'sels', 'ids', 'title', 'author', 'date', 'season', 'source', 'note', 'result', 'heat', 'also'].includes(k), `${d.id} 有未知字段 ${k}`);
  if (d.kind === 'tournament') assert.match(d.result.url, /^https:\/\//);
  if (d.heat) assert.ok(Number.isInteger(d.heat.views) && d.heat.at, d.id);
  assert.ok(d.season === 'S10-2' || (d.kind === 'official' && d.season === '2020'), d.id);
}
console.log('ok 数据', DECKS.length, '套');

const b = await browser();
const c = await phone(b);
const p = await c.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));

// 首页入口 → 推荐卡组页
await p.goto(BASE);
await act(p, '[data-act="rec-home"]');
await p.waitForSelector('.recs');
assert.equal(await p.locator('.rec').count(), DECKS.length);
assert.equal(await p.locator('.rec-metric').first().textContent().then((t) => t.startsWith('强度：无数据')), true);
// 筛选：一位女神、两位女神、最多两位
await act(p, '[data-act="rec-key"][data-key="02"]');
const n1 = await p.locator('.rec').count();
assert.equal(n1, DECKS.filter((d) => d.sels.some((s) => s.key === '02')).length);
await act(p, '[data-act="rec-key"][data-key="04"]');
const pair = DECKS.filter((d) => ['02', '04'].every((k) => d.sels.some((s) => s.key === k)));
assert.equal(await p.locator('.rec').count(), pair.length);
await act(p, '[data-act="rec-key"][data-key="01"]');
assert.match(await p.textContent('#notice'), /最多选两位/);
// 展开一套：10 张牌、出处链接、载入构筑
const first = p.locator('.rec').first();
await first.locator('.rec-hit').click();
await p.waitForSelector('.rec.open .rec-body');
assert.equal(await p.locator('.rec.open .crd').count(), 10);
assert.match(await p.locator('.rec.open .rec-src').textContent(), /出处/);
assert.ok(await p.locator('.rec.open .rec-src a[target="_blank"]').count() >= 1);
await shot(p, 'rec_open');
await act(p, '.rec.open [data-act="rec-save"]');
assert.match(await p.textContent('#notice'), /已存进我的卡组/);
await act(p, '.rec.open [data-act="rec-use"]');
await p.waitForSelector('.counter');
assert.deepEqual(await counts(p), [7, 3]);
assert.equal(await p.locator('[data-act="finish"]').isDisabled(), false);
assert.match(await p.textContent('.note.pad'), /细音|常世/);
// 构筑页有入口回到这对组合的推荐
assert.match(await p.textContent('.recbar'), /推荐卡组有 \d+ 套/);
await act(p, '.recbar');
await p.waitForSelector('.recs');
assert.equal(await p.locator('[data-act="rec-key"][aria-pressed="true"]').count(), 2);
await act(p, '.bar .back');
await p.waitForSelector('.counter');
// 存进我的卡组的那套在列表里
await p.goto(BASE + '#/decks');
await p.waitForSelector('.deckrow');
assert.equal(await p.locator('.deckrow').count(), 1);

// 正在组牌时载入推荐，要先确认
await p.goto(BASE);
await act(p, '[data-act="start"]');
await pickMegami(p, '摇波');
await pickMegami(p, '细音');
await act(p, '[data-act="to-opp"]');
await act(p, '[data-act="skip-opp"]');
await p.waitForSelector('.counter');
await p.locator('h3.sec:has-text("通常牌") + .list .crd-hit').first().click();
await act(p, '.recbar');
await p.waitForSelector('.recs');
await p.locator('.rec .rec-hit').first().click();
p.once('dialog', (dlg) => dlg.dismiss());
await act(p, '.rec.open [data-act="rec-use"]');
assert.ok(await p.locator('.recs').count(), '取消后留在推荐页');

// 没有推荐的组合不显示入口
await p.goto(BASE);
await act(p, '[data-act="start"]');
await pickMegami(p, '凝努');
await pickMegami(p, '八叶');
await act(p, '[data-act="to-opp"]');
await act(p, '[data-act="skip-opp"]');
await p.waitForSelector('.counter');
const has = DECKS.some((d) => ['15', '16'].every((k) => d.sels.some((s) => s.key === k)));
assert.equal(await p.locator('.recbar').count(), has ? 1 : 0);

// 窄屏
const c2 = await phone(b, 320);
const q = await c2.newPage();
await q.goto(BASE + '#/rec');
await q.waitForSelector('.recs');
await q.locator('.rec .rec-hit').first().click();
const [sw, cw] = await q.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
assert.ok(sw <= cw, `推荐页横向溢出 ${sw}>${cw}`);
await shot(q, 'rec_320');

assert.deepEqual(errors, []);
await b.close();
console.log('test_rec 通过');
