import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
export const BASE = process.argv[2] || 'http://localhost:8931/';
export const OUT = process.argv[3] || '/tmp/claude-501/codex_tasks/shots';
assert(['localhost', '127.0.0.1'].includes(new URL(BASE).hostname), '只对本地 wrangler dev 测试');
export async function browser() { await mkdir(OUT, { recursive: true }); return chromium.launch({ channel: 'chrome' }); }
// 手机视口；评价接口一律拦截，不往线上写数据。posted 收集被拦下的评价请求。
export async function phone(b, width = 390) {
  const c = await b.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, permissions: ['clipboard-read', 'clipboard-write'] });
  c.posted = [];
  await c.route('https://boardgame.leisurecat.cloud/**', (r) => { c.posted.push(r.request().postDataJSON?.() ?? null); r.fulfill({ json: { ok: true }, headers: { 'access-control-allow-origin': '*' } }); });
  return c;
}
export async function shot(p, name) { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${OUT}/sakura_${name}.png`, fullPage: true }); }
export const act = async (p, sel) => { await p.locator(sel).first().click(); await p.waitForTimeout(120); };
// 选一柱女神（可指定异相的武器名）
export async function pickMegami(p, name, weapon) {
  const tile = p.locator('.mg').filter({ has: p.locator('.mg-name', { hasText: new RegExp(`^${name}$`) }) });
  if (weapon) await tile.locator('.mg-vs button', { hasText: weapon }).click();
  else await tile.locator('.mg-hit').click();
  await p.waitForTimeout(100);
}
export const counts = (p) => p.evaluate(() => [...document.querySelectorAll('.counter b')].map((b) => Number(b.textContent)));
