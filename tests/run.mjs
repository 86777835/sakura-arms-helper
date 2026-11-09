// 串行跑全部测试，结果写进 tests/测试结果.md。需要先在另一个终端运行 wrangler dev --port 8931。
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const tests = ['test_logic', 'test_assets', 'test_flow', 'test_rules_ui', 'test_rec', 'test_chat_ui'];
const results = [];
for (const name of tests) {
  const r = spawnSync(process.execPath, [`tests/${name}.mjs`], { encoding: 'utf8', timeout: 240000 });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  results.push({ name, status: r.status === 0 ? 'PASS' : 'FAIL', output: (r.stdout || '') + (r.stderr || '') + (r.error?.message || '') });
}
const day = new Date().toISOString().slice(0, 10);
writeFileSync('tests/测试结果.md', `# 本地测试结果\n\n日期：${day}。只访问 localhost:8931，评价接口全部拦截，没有往线上写数据；本地没有 DeepSeek 密钥，不调用任何模型。\n\n`
  + results.map((r) => `- ${r.status} — ${r.name}`).join('\n') + '\n\n' + results.map((r) => `## ${r.name}\n\n\`\`\`text\n${r.output}\`\`\`\n`).join('\n'));
console.log(results.map((r) => `${r.status} ${r.name}`).join('\n'));
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
