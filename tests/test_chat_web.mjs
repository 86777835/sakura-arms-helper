// 规则助手联网查找（假 DeepSeek，不调用真实模型和搜索）。需要另起一个 wrangler dev：
//   wrangler dev --port 8932 --var DEEPSEEK_API_KEY:fake --var DEEPSEEK_BASE:http://127.0.0.1:8791 --var CHAT_CF_MODEL:@cf/none/missing
// 用法：node tests/test_chat_web.mjs [http://localhost:8932/]
// 假模型：问题里有「网上」就要求联网；假搜索接口按 `search` 返回 3 条 / 1 条 / 0 条 / 出错。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:8932/';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname), '只对本地 wrangler dev 测试');
let search = 'many', asked = [], systems = [], models = [];
const sse = (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
const R = (n) => [
  { title: '浦波嵐の対応について <b>', url: 'https://main-bakafire.ssl-lolipop.jp/furuyoni/na/faq.html', site_name: '新幕 桜降る代に決闘を', summary: '公式FAQ：対応できる。' },
  { title: 'ふるよに攻略', url: 'https://example.jp/a', site_name: null, snippet: 'プレイヤーの意見。' },
  { title: '三枚目', url: 'https://example.jp/b', site_name: 'blog', summary: '別の説明。' },
].slice(0, n);
const srv = createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    const j = JSON.parse(body);
    if (req.url === '/v1/tools/search') {
      asked.push(j.query);
      if (search === 'fail') { res.writeHead(500); return res.end('{}'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      const english = j.query.startsWith('Sakura Arms');
      const n = { many: 3, few: english ? 2 : 1, empty: 0 }[search];
      return res.end(JSON.stringify({ results: english ? R(3).slice(1, 1 + n).map((r) => ({ ...r, url: r.url + '/en' })) : R(n) }));
    }
    const sys = j.messages[0].content, q = j.messages.at(-1).content;
    systems.push(sys); models.push(j.model);
    if (q.includes('备用') && j.model === 'deepseek-flash') { res.writeHead(503); return res.end('{}'); }   // 首选模型忙
    if (q.includes('卡住') && j.model === 'deepseek-flash') {   // 首选模型答到一半就不动了
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '答了一半' } }] })}\n\n`);
      const t = setInterval(() => res.write(': keep-alive\n\n'), 1000);
      return res.on('close', () => clearInterval(t));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (sys.includes('联网搜索到的网页摘要')) return res.end(sse(`依据网上说法：可以对应 [1]（摘要条数 ${(sys.match(/^\[\d\] /gm) || []).length}）`));
    if (q.includes('先解释')) {   // 模型先解释，最后才要求联网
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '资料里没有提到这张卡。' } }] })}\n\n`);
      return setTimeout(() => res.end(sse('\n\n【需联网】桜降る代に決闘を 一閃 | Sakura Arms Issen')), 300);
    }
    if (q.includes('网上')) {   // 标记拆在两个数据块里
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '【需' } }] })}\n\n`);
      return setTimeout(() => res.end(sse('联网】桜降る代に決闘を 浦波嵐 対応 | Sakura Arms Urahanami reaction')), 200);
    }
    res.end(sse(q.includes('无关') ? '我只解答散樱乱武的规则。' : '资料里的回答'));
  });
}).listen(8791);

const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const bodies = []; page.on('request', (r) => r.url().endsWith('/api/chat') && bodies.push(JSON.parse(r.postData())));
await page.goto(base); await page.click('.cfab');
assert.match(await page.textContent('.chd'), /查不到会联网找/);
const askOnce = async (q, s) => {
  search = s; asked = []; systems = []; models = [];
  await page.fill('.cin textarea', q); await page.press('.cin textarea', 'Enter');
  await page.waitForFunction(() => !document.querySelector('.cin button').disabled, null, { timeout: 40000 });
  return page.$$eval('.cm.a', (l) => { const a = l.at(-1); return { err: a.className.includes('err'), label: !!a.querySelector('.cweb'),
    text: [...a.childNodes].filter((n) => !n.classList?.contains('cweb') && !n.classList?.contains('csrc')).map((n) => n.textContent).join(''),
    src: [...a.querySelectorAll('.csrc a')].map((x) => [x.textContent, x.getAttribute('href'), x.target]) }; });
};
let n = 0;
const ok = (name) => { n++; console.log('ok', name); };

assert.deepEqual([await askOnce('畏缩是什么？', 'many'), asked], [{ err: false, label: false, text: '资料里的回答', src: [] }, []]);
ok('本站资料能答：直接回答，不联网');

assert.deepEqual([await askOnce('网上怎么说浦波岚能不能对应？', 'many'), asked],
  [{ err: false, label: true, text: '依据网上说法：可以对应 [1]（摘要条数 3）',
     src: [['[1] 浦波嵐の対応について <b>新幕 桜降る代に決闘を', 'https://main-bakafire.ssl-lolipop.jp/furuyoni/na/faq.html', '_blank'],
       ['[2] ふるよに攻略example.jp', 'https://example.jp/a', '_blank'], ['[3] 三枚目blog', 'https://example.jp/b', '_blank']] },
   ['桜降る代に決闘を 浦波嵐 対応']]);
ok('需联网（标记拆成两块）：先搜日文，够 3 条就不搜英文；标签和来源都显示');
assert.equal((await page.$$eval('.cm.a', (l) => l.map((x) => x.textContent).join(''))).includes('需联网'), false);
ok('搜索请求不会作为文字出现在页面上');
const web = systems.find((s) => s.includes('联网搜索到的网页摘要'));
assert.ok(web.includes('S10-2') && web.includes('再演') && web.includes('浦波岚=浦波嵐') && web.includes('改于 S'), '联网回答的提示词要有版本要求和卡名对照');
ok('联网回答的提示词：以 S10-2 为准、点出旧版本和再演、带卡名对照');
await page.screenshot({ path: '/tmp/claude-501/codex_tasks/shots/sakura_chat_web.png' });

assert.deepEqual([(await askOnce('网上第二问？', 'few')).src.length, asked],
  [3, ['桜降る代に決闘を 浦波嵐 対応', 'Sakura Arms Urahanami reaction']]);
ok('日文不足 3 条：再搜英文，合并去重');

assert.deepEqual([await askOnce('网上还有啥？', 'empty'), asked.length],
  [{ err: false, label: false, text: '本站资料里没有这一条，网上也没找到可靠的说法。建议翻一下规则书，或者问问桌上的老玩家。', src: [] }, 2]);
ok('没搜到：照实说，不加标签，不编');

assert.deepEqual(bodies.at(-1).messages.slice(-3).map((m) => m.content), ['网上第二问？', '依据网上说法：可以对应 [1]（摘要条数 3）', '网上还有啥？']);
ok('联网回答作为对话历史发回时，不带标签和来源');

await new Promise((r) => setTimeout(r, 61000));   // 已问 5 题：等一分钟，避开每分钟 8 问的限流
assert.equal((await askOnce('网上第三问？', 'fail')).text, '本站资料里没有这一条，联网查找也失败了，请过一会儿再问，或者翻一下规则书。');
ok('搜索接口出错：照实说');

assert.deepEqual([(await askOnce('无关的问题', 'many')).text, asked], ['我只解答散樱乱武的规则。', []]);
ok('无关问题：不联网');

assert.deepEqual([await askOnce('先解释再查', 'many'), asked],
  [{ err: false, label: true, text: '依据网上说法：可以对应 [1]（摘要条数 3）',
     src: [['[1] 浦波嵐の対応について <b>新幕 桜降る代に決闘を', 'https://main-bakafire.ssl-lolipop.jp/furuyoni/na/faq.html', '_blank'],
       ['[2] ふるよに攻略example.jp', 'https://example.jp/a', '_blank'], ['[3] 三枚目blog', 'https://example.jp/b', '_blank']] },
   ['桜降る代に決闘を 一閃']]);
ok('先解释、最后才要联网：丢掉解释，改为联网回答');

assert.deepEqual([await askOnce('备用模型回答', 'many'), models], [{ err: false, label: false, text: '资料里的回答', src: [] }, ['deepseek-flash', 'deepseek-v4-pro']]);
ok('首选模型忙：换备用模型回答（本地把 Cloudflare 那级指到不存在的模型）');
assert.deepEqual([await askOnce('卡住了重答', 'many'), models], [{ err: false, label: false, text: '资料里的回答', src: [] }, ['deepseek-flash', 'deepseek-v4-pro']]);
ok('首选模型答到一半卡住：丢掉半截，由备用模型从头回答');

assert.deepEqual(errors, []);
await b.close(); srv.close();
console.log(`test_chat_web 通过（${n} 项）`);
