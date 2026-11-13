// 讲规则页：讲的人照着念主流程就能开局，念完再一条条过注意事项。依据新幕最终版（S10-2），用词和 tools/讲解稿.md 一致。
// 每个重要要素用一句话点到，细节判定交给规则助手。{显示文字|术语id} 点开从底部弹出注释（图片、在哪儿看到、什么意思）；
// 「问」按钮和注释里的「问规则助手」直接向规则助手提问（chat.js 的 window.askRules）。
// 图片：官方素材包「新幕ふるよにコモンズ」（版图、区域图标、樱花结晶、标记、牌背、卡图），集中力卡截自新幕规则书 p12，页脚署名。
const ICON = (id, cls = '') => id ? `<img class="ico ${cls}" src="/img/teach/${id}.webp" alt="">` : '';

// id：名称、图片、在哪儿看到、什么意思
const TERMS = {
  tarot: { name: '女神（塔罗牌）', icon: 'tarot', where: '开局摆在自己面前的两张女神塔罗牌，整局都摆着。', what: '每位女神有自己的 11 张牌：7 张通常牌、4 张王牌。两柱不能是同一位女神，本体和异相也算同一位。' },
  sakura: { name: '樱花结晶', icon: 'sakura', where: '粉色花瓣形的小标记。', what: '所有资源都是它：放在距就是距离，放在装就是护盾，放在命就是生命，放在气就是能量。' },
  board: { name: '版图', icon: 'board', where: '两人中间那块大板子，左右各是一位玩家的区域。', what: '中间一排是距，双方各有装、命、气，还有双方共用的虚；角上还印着回合流程。' },
  distance: { name: '距', icon: 'distance', where: '版图中间那排石头，开局放 10 个结晶。', what: '双方之间的距离。攻击牌只有当前距离在攻击距离里才能打。' },
  aura: { name: '装', icon: 'aura', where: '自己这边的盾形区域，开局 3 个结晶，最多 5 个。', what: '护盾。挨打时可以选扣装，扣掉的结晶落到虚。' },
  life: { name: '命', icon: 'life', where: '自己这边的圆形区域，开局 10 个结晶。', what: '生命，扣到 0 就输。扣命的结晶会进入自己的气，所以挨打也在攒能量。' },
  flare: { name: '气', icon: 'flare', where: '自己这边的漩涡形区域，开局 0 个。', what: '打王牌用的能量。王牌的消耗从这里付，付掉的结晶落到虚。' },
  dust: { name: '虚', icon: 'dust', where: '版图中间旁边的枯树图标，双方共用。', what: '公共的散落区。用掉、打掉的结晶多半落到这里，缠和离脱又能把结晶拿回来。' },
  phase: { name: '回合流程', icon: 'phase', where: '版图角上印着的「フェイズの進行」（开始 / 主 / 结束）。', what: '开始阶段：集中力 +1，付与牌各掉 1 个结晶，可以选择重构牌库，摸 2 张。主阶段：标准行动或全力行动二选一。结束阶段：手牌留 2 张，多的盖掉。' },
  basic: { name: '基本动作', icon: 'basic', where: '版图上自己装旁边的箭头：前、离、后。', what: '付 1 点集中力或盖 1 张手牌，移动 1 个结晶：前进（距→装）、后退（装→距）、缠（虚→装）、宿（装→气）、离脱（虚→距，只在达人距离内能用）。' },
  master: { name: '达人距离', icon: 'master', where: '写着「達人の間合」的标记，放在距的旁边。', what: '当前距离在 2 以内就是达人距离：这时不能前进，但可以用离脱。' },
  vigor: { name: '集中力', icon: 'vigor', where: '每人一张集中力卡，标着 0、1、2，用朝向表示现在有几点。', what: '最多 2 点。做基本动作可以付 1 点；开始阶段 +1。开局先手 0、后手 1。' },
  shrink: { name: '畏缩', icon: 'shrink', where: '写着「畏縮」的菱形标记，被效果畏缩时放在自己面前。', what: '下一次获得集中力时，改成只拿掉这个标记，集中力不增加。畏缩不会叠加。' },
  normal: { name: '通常牌', icon: 'back', where: '浅色背面的牌，每位女神 7 张。', what: '组牌时选 7 张洗成牌库。打出不用付费；用完进弃牌，重构时洗回牌库。' },
  special: { name: '王牌', icon: 'special', where: '卡面右上角写着消耗的牌，每位女神 4 张。', what: '组牌时选 3 张。打出时从自己的气里付消耗；用过翻成正面，不回牌库。' },
  unused: { name: '未使用的王牌', icon: 'spback', where: '面朝下横排在自己面前的 3 张王牌。', what: '没用过的王牌面朝下；用过就翻成正面，状态是已使用。' },
  deck: { name: '牌库', icon: 'back', where: '自己的 7 张通常牌洗成的一叠。', what: '开始阶段从这里摸 2 张。摸空了还要摸，每少摸一张受一次焦躁（装或命扣 1）。' },
  facedown: { name: '盖牌', icon: 'back', where: '面朝下放在自己面前的牌。', what: '基本动作可以盖 1 张手牌代替集中力；结束阶段手牌多于 2 张也要盖。只有自己能看，重构时洗回牌库。' },
  reshuffle: { name: '重构牌库', icon: 'phase', where: '回合流程里「山札の再構成（任意）」那一行。', what: '开始阶段可以选：把弃牌和盖牌洗回牌库，代价是命 −1。要在摸牌之前做，第一回合不能做。' },
  attack: { name: '攻击牌', icon: 'attack', where: '卡面左上角是攻击距离，左下角是伤害「装/命」。', what: '当前距离在攻击距离里才能打。伤害由挨打的人选扣装还是扣命，写「-」的那边不能选。' },
  action: { name: '行动牌', icon: 'action', where: '类型写着「行動」的牌，没有攻击距离。', what: '打出就结算效果，不看距离。' },
  reaction: { name: '对应', icon: 'reaction', where: '类型写着「対応」的牌。', what: '对手攻击你时可以打出插进去，先结算它，再看一次距离，不对攻击就落空。一次攻击只能对应一张。' },
  fullpower: { name: '全力', icon: 'fullpower', where: '类型写着「全力」的牌。', what: '只能在主阶段选全力行动时打，这个回合就只打这一张，不能再做别的。' },
  enhance: { name: '付与牌', icon: 'enhance', where: '类型写着「付与」，卡面左下角的数字是「纳」。', what: '打出后按纳的数字放结晶，留在场上，有结晶时效果一直有效；每个开始阶段掉 1 个，掉光就弃掉，触发弃置时效果。' },
  resurrect: { name: '再起', icon: 'resurrect', where: '王牌上写着「再起」或「即再起」和条件。', what: '用过的王牌满足条件，就翻回未使用，可以再用一次。' }
};

// 讲稿：念出来的部分。每个重要要素一句话，细节交给规则助手。
const PARTS = [
  { title: '怎么赢', sec: 20, lines: [
    '这局玩《散樱乱武》。我先讲一遍主流程，讲完再一条条过注意事项。',
    '两个人对决，各借两位{女神|tarot}的力量。把对手的{命|life}打到 0 就赢，归零那一刻立刻分出胜负。',
    '桌上所有东西都用{樱花结晶|sakura}表示：结晶放在哪个区域，就代表什么。'
  ], ask: ['游戏怎么算赢？', '命变成 0 的时候，手上的效果还要结算完吗？'] },
  { title: '结晶和区域', sec: 40, lines: [
    '看{版图|board}：中间一排是{距|distance}，代表双方的距离，开局 10 个结晶。',
    '你这边有{装|aura}，是护盾，开局 3 个、最多 5 个；{命|life}开局 10 个；{气|flare}是打王牌的能量，开局 0 个。',
    '旁边还有一个双方共用的{虚|dust}，用掉、打掉的结晶多半落到这里。',
    '整局就是结晶在这几个区域之间流动：挨打掉装、掉命，掉的命会变成自己的气。'
  ], ask: ['距里的结晶放在谁那边有区别吗？', '对手装只有 1 个，挨了 2/- 的攻击怎么办？'] },
  { title: '选女神和组牌', sec: 35, lines: [
    '开局前各选两位女神，摆出{塔罗牌|tarot}。两位不能是同一位，本体和异相也算同一位。',
    '看清对手的女神后，各自从自己两位的 22 张牌里，秘密选 7 张{通常牌|normal}和 3 张{王牌|special}。组好的牌不用给对手看。',
    '7 张通常牌洗成{牌库|deck}，3 张王牌{面朝下|unused}摆在面前。',
    '随机定先手，各摸 3 张，可以换一次牌；{集中力|vigor}先手 0、后手 1。'
  ], ask: ['眼前构筑可以 7 张通常牌都选同一位女神吗？', '组好的牌要给对手看吗？'] },
  { title: '一个回合', sec: 40, lines: [
    '每个回合分三个阶段，{版图|phase}上就印着。',
    '开始阶段：集中力 +1；场上的{付与牌|enhance}各掉 1 个结晶；可以选择{重构牌库|reshuffle}，把弃牌和盖牌洗回去，代价是命 −1；然后摸 2 张。',
    '主阶段二选一：随便组合打牌和做{基本动作|basic}；或者只打一张{全力|fullpower}牌。',
    '结束阶段：手牌超过 2 张，多的面朝下放成{盖牌|facedown}。双方的第一回合都跳过开始阶段。'
  ], ask: ['第一回合能重构牌库吗？', '牌库只剩 1 张，能先抽这张再重构吗？'] },
  { title: '基本动作', sec: 40, lines: [
    '{基本动作|basic}每做一次，付 1 点{集中力|vigor}，或者把 1 张手牌盖掉。',
    '**前进**：距→自己的装，把距离拉近。**后退**：自己的装→距，把距离拉远。',
    '**缠**：虚→自己的装，补护盾。**宿**：自己的装→自己的气，攒能量打王牌。',
    '**离脱**：虚→距，只能在{达人距离|master}用，也就是距离 2 以内；在达人距离内不能前进。'
  ], ask: ['装已经有 5 个结晶，还能前进吗？', '付了集中力，能选一个什么都移动不了的基本动作吗？'] },
  { title: '攻击和对应', sec: 45, lines: [
    '{攻击牌|attack}左上角是攻击距离，当前距离在范围里才能打；左下角是伤害，写成“装/命”，比如 3/1。',
    '挨打的人选扣哪边：扣装，结晶落到虚；扣命，结晶进自己的气。装不够扣就只能扣命，写“-”的那边不能选。',
    '挨打的人可以打一张{对应|reaction}牌插进来，先结算对应，再看一次距离，不对攻击就落空。',
    '{行动牌|action}不看距离，打出就结算效果。'
  ], ask: ['能对“对应出来的攻击”再对应吗？', '攻击被打消后，【攻击后】效果还结算吗？'] },
  { title: '付与、王牌和集中力', sec: 45, lines: [
    '{付与牌|enhance}打出后留在场上，按“纳”的数字放结晶，有结晶时效果一直有效；每个开始阶段掉 1 个，掉光就弃掉，触发弃置时的效果。',
    '{王牌|special}从自己的气里付消耗，用过翻成正面，不回牌库；写着{再起|resurrect}的，满足条件能翻回来再用。',
    '{集中力|vigor}最多 2。被{畏缩|shrink}时，下一次拿集中力改成只拿掉畏缩。牌库空了还要摸牌，每少摸一张受一次焦躁：装或命扣 1。',
    '流程就这些，接下来过一遍注意事项。'
  ], ask: ['装和虚加起来不够“纳”的数量，付与牌还能打吗？', '用过的王牌会进弃牌吗？', '畏缩时集中力已经是 2，又获得集中力会怎样？'] }
];

// 注意事项：主流程外的易错点，答案依据本站常见问题（tools/faq.json，出自规则书、総合ルール和官方 FAQ）。
// [标题, 答案, 问规则助手的问题]
const NOTES = [
  ['本体和异相不能一起选', '摇波和摇波·古刀算同一位女神，两柱必须是不同的女神。和对手选同一位女神是可以的。', '能同时选摇波和『第一章』摇波吗？'],
  ['7 张通常牌可以全来自一位女神', '规则只要求从两柱的牌池里选 7 张通常牌和 3 张王牌，没有规定每柱至少几张。', '眼前构筑可以 7 张通常牌都选同一位女神吗？'],
  ['没选的牌别收回盒子', '开局面朝下放在一边（游戏外），只有自己能看。枢·机器的「最终嗖寻」会拿某一方没选的王牌。', '没选进牌组的牌怎么处理？'],
  ['追加牌不算在 7+3 里', '追加牌、毒、TransForm 牌、兵员都不能选进牌组，开局另外摆好。本站组好牌后的“开局清单”会按女神列出来。', '追加牌能选进牌组吗？'],
  ['组合禁止：真红凶弹', '本体绯弥香和本体虚路一起选时，「真红凶弹」不能用；任一柱换成异相就可以用。这是新幕最终的禁止卡，没有全体禁止。', '绯弥香和虚路一起选时，「真红凶弹」能用吗？'],
  ['第一回合跳过开始阶段', '双方的第一回合都不加集中力、不摸牌，也不能重构牌库。', '第一回合能重构牌库吗？'],
  ['重构要在摸牌之前', '牌库只剩 1 张时，不能先摸再重构；不重构的话，缺的那张要受焦躁。连受两次焦躁时，每次分别选扣装还是扣命。', '牌库只剩 1 张，能先抽这张再重构吗？'],
  ['移动不了结晶的基本动作不能选', '装已经 5 个不能前进，装是 0 不能宿。就算付了集中力也一样。', '装已经有 5 个结晶，还能前进吗？'],
  ['距离不对，攻击牌打不出来', '攻击牌要当前距离在攻击距离里才能打。行动牌即使效果结算不了也能打，但牌上写的使用条件不满足就不能打。', '距不在攻击距离里，攻击牌能打出来吗？'],
  ['装不够时扣多少', '装不够承受装伤害时，只能选扣命。如果命那边是“-”，比如装只有 1 个挨了 2/-，就扣掉 1 个装为止，不会转去扣命。', '对手装只有 1 个，挨了 2/- 的攻击怎么办？'],
  ['一次攻击只能对应一张', '对应出来的攻击不能再被对应；一次攻击也不能用两张对应牌。带“对应”的牌在自己的主阶段也能正常打出。', '能对“对应出来的攻击”再对应吗？'],
  ['攻击被打消，攻击后效果也没了', '整个攻击被打消时，【攻击后】不结算；只是伤害被打消时，【攻击后】照常结算。', '攻击被打消后，【攻击后】效果还结算吗？'],
  ['打过牌就不能改全力', '标准行动里已经打过牌，就算那次攻击被对应打落空，也不能改成全力行动。', '标准行动打出的攻击被对应打失败了，还能改成全力行动吗？'],
  ['“终止”只管打出它的人', '我在对手回合用了带“终止”的对应牌，对手照样可以继续出牌。', '我在对手回合用了带“终止”的对应牌，对手就不能继续出牌了吗？'],
  ['纳不够也能打付与牌', '装和虚加起来不够纳的数量，有多少放多少；一个都放不上时，结算完展开时效果就立刻弃置。重构牌库时，上面还有结晶的付与牌留在场上。', '装和虚加起来不够“纳”的数量，付与牌还能打吗？'],
  ['破绽：自己掉命也算', '带“破绽”的付与牌，主人受到命伤害就直接变成盖牌，不触发弃置时效果。自己的牌让自己掉命也算，只有重构牌库的伤害例外。', '自己的牌效果让自己掉命，带“破绽”的付与牌会变成盖牌吗？'],
  ['用过的王牌不进弃牌', '用过的王牌正面朝上留在王牌区，状态是已使用，不进弃牌，也不会洗回牌库。', '用过的王牌会进弃牌吗？'],
  ['畏缩时集中力已满', '集中力已经是 2 又获得集中力时，只拿掉畏缩标记，集中力还是 2，不会因此多拿什么。', '畏缩时集中力已经是 2，又获得集中力会怎样？'],
  ['自己的盖牌随时能看', '自己的盖牌随时可以翻看，被对手效果弄成的盖牌也可以。', '自己的盖牌可以随时翻看吗？'],
  ['中文版卡面可能是旧的', '中文版约在 S5 时印刷，之后官方改过不少牌。本站按最终版 S10-2 写，卡上标“更新”的，你手里的卡面可能还是旧版，两人先说好用哪一版。', '中文版印刷后改过的卡，线下应该按哪一版打？']
];

// 图标速查，按桌上的位置分组
const GROUPS = [
  ['版图和结晶', ['board', 'sakura', 'distance', 'aura', 'life', 'flare', 'dust']],
  ['牌', ['tarot', 'normal', 'special', 'unused', 'deck', 'facedown']],
  ['牌的类型', ['attack', 'action', 'reaction', 'fullpower', 'enhance', 'resurrect']],
  ['回合和动作', ['phase', 'reshuffle', 'basic', 'master']],
  ['集中力', ['vigor', 'shrink']]
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const term = (text, id) => `<button type="button" class="term" data-t="${id}">${ICON(TERMS[id].icon)}${esc(text)}</button>`;
const line = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\{([^|}]+)\|(\w+)\}/g, (_, t, id) => term(t, id));
// 按钮里的术语只显示图和字，不能再是按钮
const label = (s) => esc(s).replace(/\{([^|}]+)\|(\w+)\}/g, (_, t, id) => `<span class="tlab">${ICON(TERMS[id].icon)}${esc(t)}</span>`);
const askBtn = (text, q) => `<button type="button" class="tq" data-q="${esc(q)}">问 <span>${label(text)}</span></button>`;
const MINUTES = Math.round(PARTS.reduce((s, p) => s + p.sec, 0) / 60);

document.getElementById('teach').innerHTML = `
  <p class="tlead">讲的人先照着念主流程（约 ${MINUTES} 分钟），再一条条过注意事项。<b>带下划线的词</b>点一下看图和解释；有疑问点「问」，规则助手马上回答。</p>
  <nav class="tnav">${PARTS.map((p, i) => `<a href="#p${i + 1}"><i>${i + 1}</i>${p.title}</a>`).join('')}<a href="#later">注意事项</a><a href="#icons">图标速查</a></nav>
  ${PARTS.map((p, i) => `<section class="tpart" id="p${i + 1}">
    <h2><span><i>${i + 1}</i>${p.title}</span><small>约 ${p.sec} 秒</small></h2>
    ${p.lines.map((s) => `<p class="tline">${line(s)}</p>`).join('')}
    <div class="tasks"><em>桌上常见疑问</em>${p.ask.map((q) => askBtn(q, q)).join('')}</div>
  </section>`).join('')}
  <section class="tpart" id="later">
    <h2><span><i>✓</i>注意事项</span><small>${NOTES.length} 条</small></h2>
    <p class="tnote">流程讲完后，一条一条过一遍。都是规则里写了、但最容易漏掉或吵起来的地方，点开就是答案。</p>
    <div class="tnotes">${NOTES.map(([t, a, q], i) => `<details class="tni"><summary><i>${i + 1}</i>${esc(t)}</summary><p>${line(a)}</p>${askBtn('还有疑问？问规则助手', q)}</details>`).join('')}</div>
    <p class="tnote">注意事项里没有的，点右下角「规则」问 AI，本站资料查不到会联网找。</p>
  </section>
  <a class="primary big tgo" href="/#/pick">讲完了，开始组牌</a>
  <h2 class="ticons" id="icons">图标速查<small>点图标看解释</small></h2>
  ${GROUPS.map(([g, ids]) => `<div class="tgrid"><h3>${g}</h3><div>${ids.map((id) => `<button type="button" class="tic" data-t="${id}">${ICON(TERMS[id].icon)}<span>${TERMS[id].name}</span></button>`).join('')}</div></div>`).join('')}
  <footer class="credits">依据新幕最终版（S10-2）规则书、総合ルール和官方 FAQ，用本站自己的话写成 · 图片：ふるよにコモンズ/BakaFire,TOKIAME（<a href="https://main-bakafire.ssl-lolipop.jp/furuyoni/na/rule.html" target="_blank" rel="noopener">素材与使用条款</a>），集中力卡截自<a href="https://main-bakafire.ssl-lolipop.jp/furuyoni/na/dl/furuyoni_rulebook.pdf" target="_blank" rel="noopener">新幕规则书</a> p12，版权归 BakaFire Party 所有 · 非官方玩家工具</footer>`;

// 术语注释：从底部弹出，图片、在哪儿看到、什么意思
const sheet = document.createElement('div');
sheet.className = 'tsheet hidden';
document.body.appendChild(sheet);
const close = () => sheet.classList.add('hidden');
function show(id) {
  const t = TERMS[id];
  sheet.innerHTML = `<div class="tsbg"></div><div class="tsbox" role="dialog" aria-label="${esc(t.name)}">
    <div class="tshd">${ICON(t.icon, 'big')}<b>${esc(t.name)}</b><button type="button" class="tsx" aria-label="关闭">×</button></div>
    <p><em>在哪儿看到</em>${esc(t.where)}</p><p><em>什么意思</em>${esc(t.what)}</p>
    <button type="button" class="primary wide tsask" data-q="${esc(`「${t.name}」是什么，怎么用？`)}">还不懂？问规则助手</button></div>`;
  sheet.classList.remove('hidden');
}
const ask = (q) => { close(); window.askRules?.(q); };
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-t]');
  if (t) return show(t.dataset.t);
  const q = e.target.closest('[data-q]');
  if (q) return ask(q.dataset.q);
  if (e.target.closest('.tsx,.tsbg')) close();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
