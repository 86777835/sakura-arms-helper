// 规则相关的界面：三拾一捨、组合禁止、共用「合奏」、盒子筛选、对手速查、教程页、窄屏。
import assert from 'node:assert/strict';
import { BASE, browser, phone, shot, act, pickMegami, counts } from './helpers.mjs';

const b = await browser();
const errors = [];
const page = async (c) => { const p = await c.newPage(); p.on('pageerror', (e) => errors.push(e.message)); return p; };
const c = await phone(b);
const p = await page(c);

// 组合禁止：本体绯弥香 + 本体虚路 → 真红凶弹 不能选；绯弥香·炎 + 虚路 → 能选
await p.goto(BASE);
await act(p, '[data-act="start"]');
await pickMegami(p, '绯弥香');
await pickMegami(p, '虚路');
assert.match(await p.textContent('#app'), /「真红凶弹」禁止使用/);
await act(p, '[data-act="to-opp"]');
await act(p, '[data-act="skip-opp"]');
await p.waitForSelector('.counter');
const ban = p.locator('.crd.ban');
assert.equal(await ban.count(), 1);
assert.match(await ban.textContent(), /真红凶弹[\s\S]*禁止/);
assert.equal(await ban.locator('.crd-hit').isDisabled(), true);
await shot(p, 'ban');
await act(p, '.bar .back');   // 回到对手页
await act(p, '.bar .back');   // 回到选女神
await pickMegami(p, '绯弥香', '炎');
assert.doesNotMatch(await p.textContent('#app'), /禁止使用/);
await act(p, '[data-act="to-opp"]');
await act(p, '[data-act="skip-opp"]');
await p.waitForSelector('.counter');
assert.equal(await p.locator('.crd.ban').count(), 0);
assert.equal(await p.locator('.crd:has-text("真红凶弹")').count(), 1);

// 细音·琵琶 + 常世·笛：「合奏」共用，通常牌 13 张
await p.goto(BASE);
await act(p, '[data-act="start"]');
await pickMegami(p, '细音', '琵琶');
await pickMegami(p, '常世', '笛');
await act(p, '[data-act="to-opp"]');
await act(p, '[data-act="skip-opp"]');
await p.waitForSelector('.counter');
assert.equal(await p.locator('h3.sec:has-text("通常牌") + .list .crd').count(), 13);
assert.equal(await p.locator('h3.sec:has-text("王牌") + .list .crd').count(), 8);
assert.match(await p.textContent('.note.pad'), /「合奏」两位共用/);
assert.match(await p.textContent('.crd:has-text("合奏")'), /共用/);

// 三拾一捨：登记 3 柱 → 点掉对手去掉的那柱 → 剩下两柱
await p.goto(BASE);
await act(p, '[data-act="start"]');
await act(p, '[data-act="three"][data-v="1"]');
await pickMegami(p, '摇波');
await pickMegami(p, '雪灯');
await pickMegami(p, '千影');
await pickMegami(p, '枢');
assert.match(await p.textContent('#notice'), /已经登记了三柱/);
assert.equal(await p.locator('[data-act="to-opp"]').isDisabled(), true, '对手还没去掉一柱');
await act(p, '[data-act="cut"]:has-text("雪灯")');
assert.match(await p.textContent('.cutbox'), /这局用：摇波 \+ 千影/);
assert.equal(await p.locator('.slot.cut').textContent(), '雪灯');
assert.equal(await p.locator('[data-act="to-opp"]').isDisabled(), false);
await shot(p, 'three');
await act(p, '[data-act="to-opp"]');
await act(p, '[data-act="skip-opp"]');
await p.waitForSelector('.counter');
assert.match(await p.textContent('.note.pad'), /摇波 \+ 千影/);
// 追加牌：千影的毒，灭灯毒 2 张
await act(p, '.extras summary');
assert.match(await p.textContent('.extras'), /灭灯毒[\s\S]*×2/);
// 刷新后草稿还在
await p.reload();
await p.waitForSelector('.counter');
assert.deepEqual(await counts(p), [0, 0]);
assert.match(await p.textContent('.note.pad'), /摇波 \+ 千影/);

// 盒子筛选：只勾基本 → 只剩 4 柱，没有异相；对手不受限制
await p.goto(BASE);
for (const k of ['expert', 'ex1', 'ex2', 'ex3', 'ex4']) await act(p, `[data-act="box"][data-box="${k}"]`);
await act(p, '[data-act="start"]');
assert.equal(await p.locator('[data-act="three"][data-v="1"][aria-pressed="true"]').count(), 1, '三拾一捨模式会被记住');
await act(p, '[data-act="three"][data-v="0"]');
assert.equal(await p.locator('.mg').count(), 4);
assert.equal(await p.locator('.mg-vs button').count(), 0);
await pickMegami(p, '摇波');
await pickMegami(p, '细音');
await act(p, '[data-act="to-opp"]');
assert.equal(await p.locator('.mg').count(), 18);
await p.goto(BASE);
await act(p, '[data-act="box"][data-box="basic"]');   // 关掉最后一个盒子不行
assert.match(await p.textContent('#notice'), /至少要有一个盒子/);

// 对手速查：从首页单独选
const c2 = await phone(b);
const q = await page(c2);
await q.goto(BASE + '#/oppo');
await q.waitForSelector('.mgrid');
assert.equal(await q.locator('[data-act="quick-go"]').isDisabled(), true);
await pickMegami(q, '萨莉娅', '新型');
await pickMegami(q, '雷螺', '岚');
await act(q, '[data-act="quick-go"]');
await q.waitForSelector('[data-act="filter"]');
assert.equal(await q.locator('h3.sec + .list .crd').count(), 22);
await act(q, '.extras summary');
const ex = await q.textContent('.extras');
assert.match(ex, /KINNARI/);
assert.match(ex, /风暴之力/);
assert.doesNotMatch(ex, /风魔旋风/, '祈祷师不放风魔');
await act(q, '[data-act="quick-reset"]');
await q.waitForSelector('.mgrid');

// 教程与常见问题
await q.goto(BASE + 'guide.html');
await q.waitForSelector('.doc');
assert.equal(await q.locator('.qa').count(), 43);
assert.equal(await q.locator('.doc h2').count(), 15);
await q.locator('.qa summary').first().click();
assert.match(await q.textContent('.qa[open]'), /出处/);
await shot(q, 'guide');

// 320px 窄屏不出现横向滚动
const c3 = await phone(b, 320);
const r = await page(c3);
for (const h of ['', '#/pick', '#/oppo', '#/decks']) {
  await r.goto(BASE + h);
  await r.waitForTimeout(300);
  const [sw, cw] = await r.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw <= cw, `${h || '首页'} 横向溢出 ${sw}>${cw}`);
}
await r.goto(BASE);
await act(r, '[data-act="start"]');
await pickMegami(r, '摇波');
await pickMegami(r, '胧');
await act(r, '[data-act="to-opp"]');
await act(r, '[data-act="skip-opp"]');
await r.waitForSelector('.counter');
const [sw, cw] = await r.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
assert.ok(sw <= cw, `构筑页横向溢出 ${sw}>${cw}`);
await shot(r, 'build_320');

assert.deepEqual(errors, []);
await b.close();
console.log('test_rules_ui 通过');
