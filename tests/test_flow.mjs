// 主流程：选女神 → 对手 → 7+3 构筑 → 完成、保存、分享链接、开局清单；卡牌详情；评价（拦截）。
import assert from 'node:assert/strict';
import { BASE, browser, phone, shot, act, pickMegami, counts } from './helpers.mjs';

const b = await browser();
const c = await phone(b);
const p = await c.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
p.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

await p.goto(BASE);
await p.waitForSelector('.hero h1');
await shot(p, 'home');
assert.match(await p.textContent('.hero'), /散樱乱武/);
assert.equal(await p.locator('.cpanel.hidden').count(), 1, '规则助手默认收起');

// 选女神：摇波 + 细音·琵琶；同一位女神不能占两柱
await act(p, '[data-act="start"]');
await p.waitForSelector('.mgrid');
assert.equal(await p.locator('.mg').count(), 18);
await pickMegami(p, '摇波');
await pickMegami(p, '细音', '琵琶');
assert.deepEqual(await p.locator('.slot.full').allTextContents(), ['摇波', '细音·琵琶']);
await pickMegami(p, '绯弥香');
assert.match(await p.textContent('#notice'), /已经选了两柱/);
assert.equal(await p.locator('.slot.full').count(), 2);
assert.match(await p.textContent('#app'), /在 S9 被重做/, "重做过的异相要提示");
await shot(p, 'pick');

// 对手：绯弥香 + 虚路
await act(p, '[data-act="to-opp"]');
await p.waitForSelector('.steps li.cur:has-text("对手女神")');
await pickMegami(p, '绯弥香');
await pickMegami(p, '虚路');
await act(p, '[data-act="to-build"]');
await p.waitForSelector('.counter');
assert.deepEqual(await counts(p), [0, 0]);
assert.equal(await p.locator('.crd.pickable').count(), 22);

// 选满 7 张通常牌后第 8 张选不上；王牌同理
const normals = p.locator('h3.sec:has-text("通常牌") + .list .crd-hit');
const specials = p.locator('h3.sec:has-text("王牌") + .list .crd-hit');
for (let i = 0; i < 8; i++) await normals.nth(i).click();
assert.deepEqual(await counts(p), [7, 0]);
assert.match(await p.textContent('#notice'), /通常牌已经选满 7 张/);
for (let i = 0; i < 4; i++) await specials.nth(i).click();
assert.deepEqual(await counts(p), [7, 3]);
assert.equal(await p.locator('[data-act="finish"]').isDisabled(), false);
await normals.nth(0).click();
assert.deepEqual(await counts(p), [6, 3]);
assert.equal(await p.locator('[data-act="finish"]').isDisabled(), true);
await normals.nth(9).click();
await shot(p, 'build');

// 卡牌详情：最终版卡图能加载；更新过的卡能切换旧卡面
const updated = p.locator('.crd:has(.upd)').first();
await updated.locator('[data-act="detail"]').click();
await p.waitForSelector('.sheet .sheet-upd');
await p.waitForFunction(() => document.querySelector('.sheet-img img')?.naturalWidth > 0);
const src1 = await p.getAttribute('.sheet-img img', 'src');
if (await p.locator('.sheet [data-act="old"]').count()) {
  await act(p, '.sheet [data-act="old"]');
  await p.waitForFunction((s) => document.querySelector('.sheet-img img')?.getAttribute('src') !== s, src1);
  await p.waitForFunction(() => document.querySelector('.sheet-img img')?.naturalWidth > 0);
  assert.match(await p.textContent('.sheet figcaption'), /旧版卡面/);
}
assert.match(await p.textContent('.sheet'), /ふるよにコモンズ\/BakaFire,TOKIAME/);
await shot(p, 'detail');
await act(p, '.sheet-x');
assert.equal(await p.locator('.sheet').count(), 0);

// 对手速查（从构筑页进去，用填好的对手）
await act(p, '.counter [data-act="go"][data-to="oppo"]');
await p.waitForSelector('.chips [data-act="filter"]');
assert.match(await p.textContent('.counter'), /绯弥香 \+ 虚路/);
assert.equal(await p.locator('.crd').count() - await p.locator('.extras .crd').count(), 22);
await act(p, '[data-act="filter"][data-f="reaction"]');
const n = await p.locator('h3.sec + .list .crd').count();
assert.ok(n > 0 && n < 22);
for (const tags of await p.locator('h3.sec + .list .crd .crd-meta').allTextContents()) assert.match(tags, /对应/);
await shot(p, 'oppo');
await act(p, '.bar .back');
await p.waitForSelector('.counter');

// 完成：保存、分享链接、开局清单
await act(p, '[data-act="finish"]');
await p.waitForSelector('#deck-shot');
assert.equal(await p.locator('#deck-shot .mini li').count(), 10);
assert.equal(await p.locator('#deck-shot .mini li.special').count(), 3);
assert.match(await p.textContent('.setup'), /距 10 个/);
assert.match(await p.textContent('.setup'), /对手那两柱要准备/);
await p.fill('#deck-name', '测试刀琵琶');
await act(p, '[data-act="save"]');
assert.match(await p.textContent('#notice'), /已存进我的卡组/);
await act(p, '[data-act="share"]');
const link = await p.evaluate(() => navigator.clipboard.readText());
assert.match(link, /#\/d\/01o\.02a1\./);
await shot(p, 'done');

// 我的卡组：刷新后还在
await p.goto(BASE + '#/decks');
await p.reload();
await p.waitForSelector('.deckrow');
assert.match(await p.textContent('.deckrow'), /测试刀琵琶/);

// 打开分享链接（新的浏览器环境，没有本地数据）
const c2 = await phone(b);
const q = await c2.newPage();
q.on('pageerror', (e) => errors.push('shared: ' + e.message));
await q.goto(link.replace(/^https?:\/\/[^/]+\//, BASE));
await q.waitForSelector('[data-act="adopt"]');
assert.equal(await q.locator('h3.sec + .list .crd').count(), 10);
await act(q, '[data-act="adopt"]');
await q.waitForSelector('.counter');
assert.deepEqual(await counts(q), [7, 3]);
await q.goto(BASE + '#/d/坏掉的码');
await q.waitForSelector('.empty');
assert.match(await q.textContent('.empty'), /分享码格式不对/);

// 评价：拦截，不写线上
await p.goto(BASE);
await p.waitForSelector('.review');
await p.fill('#review-name', '测试员');
await act(p, '[data-act="star"][data-v="4"]');
await p.fill('#review-text', '本地测试');
await act(p, '[data-act="review"]');
await p.waitForSelector('[data-act="review"]:has-text("已提交")');
assert.deepEqual({ ...c.posted.at(-1), room: 'x' }, { game: 'sakura-arms', name: '测试员', room: 'x', stars: 4, text: '本地测试' });
assert.match(c.posted.at(-1).room, /^[a-z2-9]{6}$/);

assert.deepEqual(errors, []);
await b.close();
console.log('test_flow 通过');
