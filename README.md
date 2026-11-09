# 散樱乱武组牌助手

《桜降る代に決闘を 新幕》（中文版《散樱乱武》，神秘岛桌游发行）线下对局的手机组牌工具。单机网页，没有房间，组牌全在浏览器里完成，服务器不保存牌组。

- 技术：Cloudflare Workers 加静态资源，原生 JS，没有构建步骤。Worker 只负责 `/api/chat`（规则助手）。
- 线上：https://sakura.leisurecat.cloud （custom domain），Worker `sakura-arms-helper`，仓库 86777835/sakura-arms-helper，部署用 `wrangler deploy`。

## 范围（2026-11-07 与用户确认，见 `docs/做与不做清单.md`）

- 卡池：只收神秘岛新幕中文版收录的内容，即基本、达人、第一到第四扩展，共 18 柱女神、13 个异相。首页可以勾选“我有的盒子”。
- 卡牌效果：按新幕最终版 S10-2 写。中文版约在 S5 时印刷，之后改过的 55 张卡标“S? 更新”，并写明改了什么，可以切换看旧卡面。
- 卡牌信息：
  - 卡名用社区中文译名。
  - 数值有距离、伤害、消耗、纳，雪灯的牌另有开伞面。
  - 效果是本站自己概括的一句话。
  - 点开详情可以看官方素材包里的卡图。
  - 不发布官方卡面文字。
- 推荐卡组（2026-11-09 加）：84 套有出处的卡组，按女神筛选，一键导入构筑或存进我的卡组。强度一律写“无数据”，只列来源本身有的大会成绩和文章热度。收录规则见 `docs/推荐卡组来源.md`。
- 不做：在线对战、出牌结算、卡图墙、玩家投稿的卡组广场、收藏管理、再演和古典战。

## 功能与文件

- `public/index.html`、`app.js`、`style.css`、`dom.js`：手机页面，用 morph 增量渲染，路由用 hash。
  - `#/pick`：选女神，可以直接选两柱，也可以走三拾一捨（登记 3 柱、标出对手去掉的 1 柱）。
  - `#/opp`：填对手的女神，可以跳过。
  - `#/build`：眼前构筑，7+3 分开计数，禁止卡不能选。
  - `#/done`：保存、分享链接、存成图片、开局清单。
  - `#/oppo`：对手速查，可按类型筛选。
  - `#/decks`：我的卡组。
  - `#/d/<码>`：打开分享的牌组。
  - 草稿、牌组、盒子勾选存在 localStorage，刷新不丢。
- `public/logic.js`：组牌规则，页面和测试共用。
  - 按卡位做异相替换。
  - 共用卡「合奏」只算 1 张（细音·琵琶 + 常世·笛 时通常牌池是 13 张）。
  - 追加牌跟着来源牌走，TransForm 牌按编号替换。
  - 组合禁止：本体绯弥香 + 本体虚路时禁用「真红凶弹」。
  - 7+3 校验和分享码。
- `public/decks.js`：推荐卡组，由 `tools/build_decks.mjs` 从 `tools/decks.json` 校验生成，不要手改。
  - `#/rec` 是推荐卡组页。构筑页在当前两柱有推荐时，显示入口按钮。
- `public/setup.js`：开局清单。通用 7 步，以及 18 柱女神各自的额外组件，每条标出处。
- `public/data.js`：由 `tools/build_data.mjs` 生成，不要手改。
- `public/guide.html`：由 `tools/build_pages.mjs` 从 `tools/讲解稿.md`（14 节）和 `tools/faq.json`（43 条）生成。
- `src/worker.js`、`src/chat.js`、`src/sse.js`：规则助手，和方舟站同一套。
  - 只依据讲解稿和常见问题回答。
  - 模型顺序 Flash → Qwen → Pro，每级 9 秒内要开始回答，中途停 8 秒就换下一个。
  - 读取匹兹堡站 KV 里的 DeepSeek 状态，不建 cron。
  - 不显示模型名。
- `public/img/`：官方素材包「新幕ふるよにコモンズ」的卡图和塔罗牌，已缩小并转成 WebP。来源和条款见 `docs/素材来源.md`。
- 评价卡：首页底部，提交到总入口 `/api/reviews`，game 为 `sakura-arms`。room 用这台设备的随机码（单机站没有房间）。总入口已加上 `sakura-arms`（2026-11-07）。
- `wrangler.jsonc`：rate limit `namespace_id` 用 1131，KV 绑定匹兹堡站的命名空间（只读），route 为 `sakura.leisurecat.cloud`（custom domain），没有 cron。

## 本地运行与测试

```sh
ln -s /tmp/claude-501/pw/node_modules node_modules   # 需要 playwright-core；/tmp 被清掉时，新建目录 npm i playwright-core
wrangler dev --port 8931
# 另一个终端：
node tests/run.mjs
# 测完停止 wrangler，删掉临时链接：
rm node_modules
```

`tests/run.mjs` 依次跑 6 个测试，结果写进 `tests/测试结果.md`：
- `test_logic`：牌池、异相、共用卡、禁止卡、7+3、分享码。
- `test_assets`：358 个文件都能访问，没有多余的卡图。
- `test_flow`：主流程。
- `test_rules_ui`：三拾一捨、禁止卡、「合奏」、盒子筛选、对手速查、教程页、320px 窄屏。
- `test_rec`：推荐卡组数据合法、有出处、没有自编指标；筛选、展开、导入构筑、存卡组、构筑页入口、窄屏。
- `test_chat_ui`：没有密钥时给出明确报错，不显示模型名。

说明：
- 评价接口全部拦截，不往线上写数据。
- 浏览器用 playwright-core 加本机 Chrome。
- 截图在 `/tmp/claude-501/codex_tasks/shots/sakura_*.png`。

## 已知限制

- 卡名中文译名来自社区数据，没有找到神秘岛公开的官方译名表。
- “已更新”以 S5 为界，是按中文版众筹时间推断的。
- 『第二章』细音、『旅艺人』常世在 S9 被整个重做，最终版要用到中文版没有的「合奏」等卡，选女神时会提示。
- 三拾一捨：官方规章没写登记的 3 柱能不能有同一位女神，本工具要求各不相同，页面上写明了这是工具自己的限制。
- 新幕最终禁止状态按 2026-03 的改定处理，之后没有找到新的改定。
- 规则助手的流式回答和模型切换逻辑与方舟站相同，本站只测了没有密钥时的报错。
- 没在微信真机测过，只测了 Chrome 手机视口（390px、320px）。
- DeepSeek 密钥由用户自己设置：`wrangler secret put DEEPSEEK_API_KEY --name sakura-arms-helper`。

游戏、规则和卡图的权利归 BakaFire Party / TOKIAME 及中文版出版方所有。本站是非官方玩家工具，卡牌效果和规则讲解都是自己概括的。
