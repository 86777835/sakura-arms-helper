// 讲规则页：首页入口、讲稿段落和关键要素、每个术语的注释和图片、「问」按钮、注意事项、图标速查、手机宽度。
// /api/chat 用 page.route 模拟，不调真模型；也可以对线上跑（不写任何数据）。
// 用法：node tests/test_teach.mjs [base-url]
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:8931/';
const out = '/tmp/claude-501/codex_tasks/shots';
let n = 0;
const ok = (name) => { n++; console.log('ok', name); };

const b = await chromium.launch({ channel: 'chrome' });
const page = await (await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const asked = [];
await page.route('**/api/chat', async (r) => {
  const q = JSON.parse(r.request().postData()).messages.at(-1).content; asked.push(q);
  await r.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: `答：${q}` } }] })}\n\ndata: [DONE]\n\n` });
});
await page.route('https://boardgame.leisurecat.cloud/**', (r) => r.fulfill({ json: {} }));

// 首页入口
await page.goto(base); await page.waitForSelector('.teachgo');
assert.equal(await page.textContent('.teachgo b'), '第一次玩？4 分钟讲规则');
await page.click('.teachgo'); await page.waitForSelector('.tpart');
assert.equal(new URL(page.url()).pathname.replace(/\.html$/, ''), '/teach');
ok('首页入口进入讲规则页');

// 段落和讲稿
assert.deepEqual(await page.$$eval('.tpart h2 span', (l) => l.map((h) => h.textContent.replace(/^\S/, ''))),
  ['怎么赢', '结晶和区域', '选女神和组牌', '一个回合', '基本动作', '攻击和对应', '付与、王牌和集中力', '注意事项']);
const read = await page.$$eval('.tline', (l) => l.map((p) => p.textContent).join(''));
console.log(`  讲稿 ${read.length} 字`);
assert.ok(read.length < 1100, '讲稿要在 4 分钟内念完');
for (const w of ['命', '樱花结晶', '距', '装', '气', '虚', '22 张', '7 张通常牌', '3 张王牌', '集中力', '重构牌库', '基本动作', '前进', '后退', '缠', '宿', '离脱', '达人距离',
  '攻击牌', '对应', '行动牌', '全力', '付与牌', '纳', '王牌', '再起', '畏缩', '焦躁', '盖牌', '第一回合'])
  assert.ok(read.includes(w), '讲稿要提到 ' + w);
assert.ok(read.startsWith('这局玩《散樱乱武》。我先讲一遍主流程，讲完再一条条过注意事项。'));
assert.ok(read.endsWith('流程就这些，接下来过一遍注意事项。'));
ok('7 段齐全，讲稿点到了所有重要要素，开头结尾引到注意事项');
await page.screenshot({ path: out + '/sakura_teach_top.png' });

// 每个术语都能弹出带图片的注释
const ids = await page.$$eval('[data-t]', (l) => [...new Set(l.map((x) => x.dataset.t))]);
const bad = [];
for (const id of ids) {
  await page.evaluate((id) => document.querySelector(`[data-t="${id}"]`).click(), id);
  await page.waitForFunction(() => { const i = document.querySelector('.tsheet:not(.hidden) .tshd img'); return i && i.complete; });
  const s = await page.$eval('.tsheet', (s) => ({ open: !s.classList.contains('hidden'), name: s.querySelector('.tshd b')?.textContent, img: s.querySelector('.tshd img')?.naturalWidth > 0, ps: [...s.querySelectorAll('p')].map((p) => p.textContent.length) }));
  if (!s.open || !s.name || !s.img || s.ps.length !== 2 || s.ps.some((x) => x < 8)) bad.push([id, s]);
  await page.click('.tsx');
}
assert.deepEqual(bad, []);
assert.equal(await page.$eval('.tsheet', (s) => s.classList.contains('hidden')), true);
ok(`${ids.length} 个术语都能弹出注释，图片都能加载`);

// 注释里问规则助手
const t1 = page.locator('.tpart .term').first();
await t1.scrollIntoViewIfNeeded(); await t1.click();
await page.screenshot({ path: out + '/sakura_teach_note.png' });
const nm = await page.textContent('.tshd b');
await page.click('.tsask'); await page.waitForSelector('.cm.a:not(:has(.cdots))');
assert.deepEqual([asked.at(-1), await page.isVisible('.cpanel'), await page.$eval('.tsheet', (s) => s.classList.contains('hidden'))], [`「${nm}」是什么，怎么用？`, true, true]);
await page.click('.cx');
ok('注释的「问规则助手」：关掉注释，打开助手，问这个词');

// 「问」按钮发出它自己的问题
const q = await page.$eval('#p4 .tq', (x) => x.dataset.q);
await page.locator('#p4 .tq').first().click();
await page.waitForFunction((q) => [...document.querySelectorAll('.cm.a')].at(-1)?.textContent === `答：${q}`, q);
assert.equal(asked.at(-1), q);
await page.click('.cx');
assert.equal(await page.$$eval('button button', (l) => l.length), 0);
ok('「问」按钮发出自己的问题；没有按钮套按钮');

// 注意事项
const notes = await page.$$eval('.tni', (l) => l.map((d) => ({ t: d.querySelector('summary').textContent, a: d.querySelector('p').textContent.length, q: d.querySelector('.tq').dataset.q, open: d.open })));
console.log(`  注意事项 ${notes.length} 条`);
assert.ok(notes.length >= 15);
assert.deepEqual(notes.filter((x) => x.a < 15 || !x.q || x.open), []);
const n1 = page.locator('.tni').nth(4);
await n1.locator('summary').click();
assert.equal(await n1.evaluate((d) => d.open && d.querySelector('p').offsetHeight > 0), true);
await page.screenshot({ path: out + '/sakura_teach_notes.png' });
await n1.locator('.tq').click();
await page.waitForFunction(() => !document.querySelector('.cm.a:last-child .cdots'));
assert.equal(asked.at(-1), notes[4].q);
await page.click('.cx');
assert.match(await page.textContent('#later'), /一条一条过一遍[\s\S]*注意事项里没有的，点右下角「规则」问 AI/);
ok('注意事项每条都有答案、默认收起、能展开，按钮问对应的问题');

// 图标速查
await page.evaluate(() => Promise.all([...document.querySelectorAll('.tic img')].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))));
const tiles = await page.$$eval('.tic', (l) => l.map((t) => [t.dataset.t, t.querySelector('img')?.naturalWidth > 0, t.textContent.trim().length > 0]));
assert.deepEqual(tiles.filter((t) => !t[1] || !t[2]), []);
console.log(`  图标速查 ${tiles.length} 个`);
await page.locator('#icons').scrollIntoViewIfNeeded(); await page.screenshot({ path: out + '/sakura_teach_icons.png' });
ok('图标速查的图片都能加载');

assert.match(await page.textContent('.teach .credits'), /ふるよにコモンズ\/BakaFire,TOKIAME/);
assert.equal(await page.getAttribute('.tgo', 'href'), '/#/pick');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
assert.deepEqual(errs, []);
ok('署名、讲完去组牌、375px 不横向滚动、没有页面报错');
await b.close();
console.log(`test_teach 通过（${n} 项）`);
