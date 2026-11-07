// 规则助手：本地没有设置 DeepSeek 密钥，问问题时要显示明确的错误，不能卡住或假装回答。
// 另外检查服务端的输入校验（不调用任何模型）。
import assert from 'node:assert/strict';
import { BASE, browser, phone, act } from './helpers.mjs';

const r = await fetch(BASE + 'api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: '畏缩是什么？' }] }) });
assert.equal(r.status, 503, '本地没有密钥，应返回 503');
assert.match((await r.json()).error, /还没有配置好/);
assert.equal((await fetch(BASE + 'api/nothing')).status, 404);

const b = await browser();
const c = await phone(b);
const p = await c.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.goto(BASE);
await act(p, '.cfab');
assert.equal(await p.locator('.cpanel.hidden').count(), 0);
await act(p, '.csug button');
await p.waitForSelector('.cm.a.err');
assert.match(await p.textContent('.cm.a.err'), /规则助手还没有配置好/);
assert.doesNotMatch(await p.textContent('.cpanel'), /DeepSeek|Qwen|deepseek/, '不显示模型名');
await act(p, '.cx');
assert.equal(await p.locator('.cpanel.hidden').count(), 1);
assert.deepEqual(errors, []);
await b.close();
console.log('test_chat_ui 通过');
