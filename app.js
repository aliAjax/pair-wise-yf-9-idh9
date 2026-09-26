/* ============================================================
 * 第 1 层：共享规则存档（数据层）
 * shared[] 只负责存档与增删改；
 * 游戏上的 overrides[gameId][sharedId] = { text, confirmedBase }
 * 记录每款游戏对共享规则的改写。
 * ============================================================ */

const storageKey = "zfl18-boardgame-rule-cards";
const today = new Date();

const categoryDefs = [
  { key: "forgets", title: "容易忘的规则" },
  { key: "disputes", title: "常见争议" },
  { key: "setup", title: "开局准备" },
  { key: "scoring", title: "计分提醒" }
];
const categoryTitles = Object.fromEntries(categoryDefs.map((def) => [def.key, def.title]));

function createDefaultState() {
  const orleans = {
    id: crypto.randomUUID(),
    name: "奥尔良",
    minPlayers: 2,
    maxPlayers: 4,
    duration: 90,
    complexity: "中",
    lastPlayed: "2025-11-20",
    cover: "",
    forgets: ["商站建造前先确认道路或水路连接", "袋中随从抽完后不是重洗弃堆，而是从已回袋内容继续抽"],
    disputes: ["事件顺序和玩家动作结算先后", "科技板是否能替代所有同类随从"],
    setup: ["按人数放置货物板块", "每位玩家拿起始随从、商人和个人板"],
    scoring: ["货物分数", "商站和市民乘区块", "金币和建筑剩余加分"]
  };
  const gaia = {
    id: crypto.randomUUID(),
    name: "盖亚计划",
    minPlayers: 1,
    maxPlayers: 4,
    duration: 150,
    complexity: "重",
    lastPlayed: "2025-08-02",
    cover: "",
    forgets: ["联邦连接时卫星数量和能量消耗要一起核对", "研究升到顶必须拿对应科技板限制"],
    disputes: ["被动充能是否能拒绝", "星球改造费用受哪些能力影响"],
    setup: ["随机终局计分板和回合得分板", "按种族设置起始资源和母星"],
    scoring: ["科技轨排名", "联邦和建筑分"]
  };
  const azul = {
    id: crypto.randomUUID(),
    name: "花砖物语",
    minPlayers: 2,
    maxPlayers: 4,
    duration: 45,
    complexity: "轻",
    lastPlayed: "2026-03-15",
    cover: "",
    forgets: ["每轮结束先铺墙再补工厂展示区", "地板线扣分后清空对应砖"],
    disputes: ["同色砖放置限制是否看整面墙", "中央区起始玩家标记是否必须拿"],
    setup: ["按人数放工厂圆盘", "每个圆盘补4块砖"],
    scoring: ["横竖相邻即时分", "完整行列和颜色终局加分"]
  };

  // 示例：一条同系列共享的计分规则，默认适用于三款游戏
  const sharedScoring = {
    id: crypto.randomUUID(),
    category: "scoring",
    text: "结算前先确认：剩余资源/金钱按规则书比例折算，未达到最低单位不计分。",
    gameIds: [orleans.id, gaia.id, azul.id],
    createdAt: today.toISOString().slice(0, 10)
  };

  return {
    selectedId: orleans.id,
    games: [orleans, gaia, azul],
    shared: [sharedScoring],
    overrides: {}
  };
}

function normalizeState(raw) {
  const state = {
    selectedId: "",
    games: [],
    shared: [],
    overrides: {},
    ...(raw || {})
  };

  state.games = (state.games || []).map((game) => ({
    forgets: [],
    disputes: [],
    setup: [],
    scoring: [],
    ...game
  }));

  const gameIdSet = new Set(state.games.map((game) => game.id));
  const sharedIdSet = new Set();

  state.shared = (Array.isArray(state.shared) ? state.shared : [])
    .filter((rule) => rule && typeof rule.text === "string" && categoryTitles[rule.category])
    .map((rule) => {
      const gameIds = [...new Set((Array.isArray(rule.gameIds) ? rule.gameIds : []).filter((id) => gameIdSet.has(id)))];
      sharedIdSet.add(rule.id);
      return { ...rule, gameIds };
    });

  // 清掉指向已删除游戏 / 已删除共享规则的改写
  for (const [gameId, map] of Object.entries(state.overrides || {})) {
    if (!gameIdSet.has(gameId)) {
      delete state.overrides[gameId];
      continue;
    }
    for (const sharedId of Object.keys(map)) {
      if (!sharedIdSet.has(sharedId)) delete map[sharedId];
    }
    if (Object.keys(map).length === 0) delete state.overrides[gameId];
  }

  if (!gameIdSet.has(state.selectedId)) state.selectedId = state.games[0]?.id || "";
  return state;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return createDefaultState();
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return createDefaultState();
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

/* ---- 共享规则存档操作 ---- */

function addSharedRule({ category, text, gameIds }) {
  state.shared.push({
    id: crypto.randomUUID(),
    category,
    text,
    gameIds: [...new Set(gameIds)],
    createdAt: new Date().toISOString().slice(0, 10)
  });
}

function updateSharedRule(sharedId, { category, text, gameIds }) {
  const rule = state.shared.find((item) => item.id === sharedId);
  if (!rule) return;
  const nextGameIds = new Set(gameIds);

  // 取消勾选的游戏：把当前生效文字固化成本地规则，再清掉引用与改写
  for (const gameId of rule.gameIds) {
    if (nextGameIds.has(gameId)) continue;
    detachShared(rule, gameId, category);
  }

  rule.category = category;
  rule.text = text;
  rule.gameIds = [...nextGameIds];
}

function deleteSharedRule(sharedId) {
  const index = state.shared.findIndex((item) => item.id === sharedId);
  if (index === -1) return;
  const rule = state.shared[index];

  // 移除共享规则：所有适用游戏保留当前文字（固化为本地规则）
  for (const gameId of rule.gameIds) detachShared(rule, gameId, rule.category);
  state.shared.splice(index, 1);
}

// 让一款游戏与某条共享规则脱钩：保留当前生效文字为本地条目
function detachShared(rule, gameId, category) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game || !categoryTitles[category]) return;

  const override = state.overrides[gameId]?.[rule.id];
  const keptText = override ? override.text : rule.text;
  if (!game[category].includes(keptText)) game[category].push(keptText);

  if (state.overrides[gameId]) {
    delete state.overrides[gameId][rule.id];
    if (Object.keys(state.overrides[gameId]).length === 0) delete state.overrides[gameId];
  }
}

// 游戏侧：改写 / 保留改写 / 采用新版 / 恢复共享
function saveOverride(gameId, sharedId, text) {
  const rule = state.shared.find((item) => item.id === sharedId);
  if (!rule) return;
  if (!state.overrides[gameId]) state.overrides[gameId] = {};
  if (text === rule.text) {
    delete state.overrides[gameId][sharedId];
    if (Object.keys(state.overrides[gameId]).length === 0) delete state.overrides[gameId];
    return;
  }
  const existing = state.overrides[gameId][sharedId];
  state.overrides[gameId][sharedId] = {
    text,
    // 已核对过的基线原文保留；新改写以当前共享原文为基线
    confirmedBase: existing?.confirmedBase ?? rule.text
  };
}

function confirmOverride(gameId, sharedId, choice) {
  const rule = state.shared.find((item) => item.id === sharedId);
  const override = state.overrides[gameId]?.[sharedId];
  if (!rule || !override) return;
  if (choice === "adopt") {
    // 采用共享新版：清除改写，直接引用共享内容
    delete state.overrides[gameId][sharedId];
    if (Object.keys(state.overrides[gameId]).length === 0) delete state.overrides[gameId];
  } else {
    // 保留改写：以新版原文为已核对基线，待确认标记解除
    override.confirmedBase = rule.text;
  }
}

function removeOverride(gameId, sharedId) {
  if (!state.overrides[gameId]?.[sharedId]) return;
  delete state.overrides[gameId][sharedId];
  if (Object.keys(state.overrides[gameId]).length === 0) delete state.overrides[gameId];
}

function deleteGame(gameId) {
  state.games = state.games.filter((game) => game.id !== gameId);
  delete state.overrides[gameId];
  state.shared.forEach((rule) => {
    rule.gameIds = rule.gameIds.filter((id) => id !== gameId);
  });
  if (state.selectedId === gameId) state.selectedId = state.games[0]?.id || "";
}

/* ============================================================
 * 第 2 层：引用判定（解析层，纯函数）
 * 搜索、统计、详情都只认这里算出的「生效内容」，不直接读存档。
 * ============================================================ */

// 一条共享规则在一款游戏里的生效形态
function getEffectiveSharedItem(gameId, rule) {
  const override = state.overrides[gameId]?.[rule.id];
  const sharedText = rule.text;
  if (!override) {
    return {
      key: `shared:${rule.id}`,
      sharedId: rule.id,
      category: rule.category,
      text: sharedText,
      origin: "shared", // 直接引用共享
      pending: false
    };
  }
  return {
    key: `shared:${rule.id}`,
    sharedId: rule.id,
    category: rule.category,
    text: override.text,
    origin: "override", // 游戏改写
    pending: override.confirmedBase !== sharedText
  };
}

// 某分类下的生效条目：共享在前（按共享库存档顺序），游戏本地在后
function resolveCategory(game, category) {
  const sharedItems = state.shared
    .filter((rule) => rule.category === category && rule.gameIds.includes(game.id))
    .map((rule) => getEffectiveSharedItem(game.id, rule));
  const localItems = game[category].map((text, index) => ({
    key: `local:${category}:${index}`,
    category,
    text,
    origin: "local",
    pending: false
  }));
  return [...sharedItems, ...localItems];
}

// 一款游戏四类的全部生效条目，按原四类顺序
function resolveGame(game) {
  return categoryDefs.map((def) => ({ category: def.key, title: def.title, items: resolveCategory(game, def.key) }));
}

function getEffectiveRules(game) {
  // 同一共享规则在一款游戏里只会出现一次；key 去重兜底
  const seen = new Set();
  return resolveGame(game).flatMap((section) =>
    section.items.filter((item) => (seen.has(item.key) ? false : seen.add(item.key)))
  );
}

function getEffectiveText(game) {
  return `${game.name}${getEffectiveRules(game).map((item) => item.text).join("")}`;
}

function countPending() {
  let total = 0;
  for (const game of state.games) {
    total += getEffectiveRules(game).filter((item) => item.pending).length;
  }
  return total;
}

/* ============================================================
 * 第 3 层：页面展示
 * ============================================================ */

let state = loadState();
if (!state.selectedId) state.selectedId = state.games[0]?.id || "";

// 共享规则表单草稿：编辑中的输入不依赖重渲染，避免输入时被刷新
const sharedDraft = { editingId: "", category: "forgets", text: "", gameIds: [] };
// 详情里正在改写的规则
const overrideDraft = { gameId: "", sharedId: "", text: "" };

const els = {
  searchInput: document.querySelector("#searchInput"),
  playerFilter: document.querySelector("#playerFilter"),
  complexityFilter: document.querySelector("#complexityFilter"),
  sortMode: document.querySelector("#sortMode"),
  gameForm: document.querySelector("#gameForm"),
  nameInput: document.querySelector("#nameInput"),
  minPlayersInput: document.querySelector("#minPlayersInput"),
  maxPlayersInput: document.querySelector("#maxPlayersInput"),
  durationInput: document.querySelector("#durationInput"),
  complexityInput: document.querySelector("#complexityInput"),
  lastPlayedInput: document.querySelector("#lastPlayedInput"),
  coverInput: document.querySelector("#coverInput"),
  gameList: document.querySelector("#gameList"),
  detailView: document.querySelector("#detailView"),
  gameCount: document.querySelector("#gameCount"),
  ruleCount: document.querySelector("#ruleCount"),
  staleGame: document.querySelector("#staleGame"),
  visibleCount: document.querySelector("#visibleCount"),
  sharedForm: document.querySelector("#sharedForm"),
  sharedCategoryInput: document.querySelector("#sharedCategoryInput"),
  sharedTextInput: document.querySelector("#sharedTextInput"),
  sharedGamePicker: document.querySelector("#sharedGamePicker"),
  sharedSubmitBtn: document.querySelector("#sharedSubmitBtn"),
  sharedCancelBtn: document.querySelector("#sharedCancelBtn"),
  sharedHint: document.querySelector("#sharedHint"),
  sharedList: document.querySelector("#sharedList"),
  sharedSummary: document.querySelector("#sharedSummary")
};

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getFilteredGames() {
  const keyword = els.searchInput.value.trim();
  const player = els.playerFilter.value;
  const complexity = els.complexityFilter.value;
  const games = state.games.filter((game) => {
    // 搜索按实际生效内容计算（含共享 / 改写后的文字）
    const text = getEffectiveText(game);
    const matchesKeyword = !keyword || text.includes(keyword);
    const matchesPlayer = player === "all" || (Number(player) >= game.minPlayers && Number(player) <= game.maxPlayers);
    const matchesComplexity = complexity === "all" || game.complexity === complexity;
    return matchesKeyword && matchesPlayer && matchesComplexity;
  });

  if (els.sortMode.value === "name") return games.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (els.sortMode.value === "complexity") {
    const rank = { 轻: 1, 中: 2, 重: 3 };
    return games.sort((a, b) => rank[b.complexity] - rank[a.complexity]);
  }
  return games.sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed));
}

function renderSummary() {
  // 统计按实际生效内容计算，一条共享规则在一款游戏里只算一次
  const allRuleCount = state.games.reduce((sum, game) => sum + getEffectiveRules(game).length, 0);
  const pending = countPending();
  const stale = [...state.games].sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed))[0];
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = allRuleCount;
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
  els.ruleCount.title = pending ? `其中有 ${pending} 条改写待核对` : "";
  els.ruleCount.classList.toggle("attention", pending > 0);
}

function renderList() {
  const games = getFilteredGames();
  els.visibleCount.textContent = `${games.length}个匹配`;
  els.gameList.innerHTML =
    games
      .map((game) => {
        const selected = game.id === state.selectedId ? "selected" : "";
        return `
          <article class="game-card ${selected}" data-game-id="${game.id}">
            <div class="cover">
              ${
                game.cover
                  ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />`
                  : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`
              }
              <span class="stale-ribbon">${daysSince(game.lastPlayed)}天未玩</span>
            </div>
            <div class="game-body">
              <h3>${escapeHtml(game.name)}</h3>
              <div class="game-meta">
                <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
                <span class="pill">${game.duration}分钟</span>
                <span class="pill heavy">${escapeHtml(game.complexity)}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">没有符合筛选的桌游。</p>`;
}

/* ---- 游戏详情（展示层） ---- */

function renderDetail() {
  const game = state.games.find((item) => item.id === state.selectedId) || state.games[0];
  if (!game) {
    els.detailView.innerHTML = `<p class="empty">先添加一个桌游。</p>`;
    return;
  }
  state.selectedId = game.id;
  const sections = resolveGame(game);

  els.detailView.innerHTML = `
    <div class="quick-card">
      <div class="detail-cover">
        ${game.cover ? `<img src="${game.cover}" alt="${escapeHtml(game.name)}封面" />` : `<span>${escapeHtml(game.name.slice(0, 2))}</span>`}
      </div>
      <div>
        <h2>${escapeHtml(game.name)}</h2>
        <div class="game-meta">
          <span class="pill">${game.minPlayers}-${game.maxPlayers}人</span>
          <span class="pill">${game.duration}分钟</span>
          <span class="pill heavy">${escapeHtml(game.complexity)}</span>
          <span class="pill">${daysSince(game.lastPlayed)}天未玩</span>
        </div>
      </div>
      ${sections.map((section) => renderRuleSection(game, section)).join("")}
      <form class="add-rule" id="ruleForm">
        <select id="ruleTypeInput">
          ${categoryDefs.map((def) => `<option value="${def.key}">${def.title}（仅本游戏）</option>`).join("")}
        </select>
        <textarea id="ruleTextInput" rows="3" placeholder="补充一条只属于 ${escapeHtml(game.name)} 的本地提醒" required></textarea>
        <button class="primary" type="submit">加入规则卡片</button>
      </form>
      <div class="detail-actions">
        <button id="playedTodayBtn" type="button">标记今天玩过</button>
        <button id="deleteGameBtn" type="button">删除桌游</button>
      </div>
    </div>
  `;
}

function originBadge(item) {
  if (item.origin === "shared") return `<em class="tag tag-shared">共享</em>`;
  if (item.pending) return `<em class="tag tag-pending">改写 · 待确认</em>`;
  return `<em class="tag tag-override">改写</em>`;
}

function renderRuleActions(game, item) {
  if (item.origin === "local") {
    return `<button type="button" title="删除本地规则" data-action="delete-local" data-category="${item.category}" data-index="${item.key.split(":").pop()}">×</button>`;
  }
  const editing = overrideDraft.sharedId === item.sharedId && overrideDraft.gameId === game.id;
  if (editing) return "";
  return `
    <button type="button" title="改写为该游戏专用文字" data-action="override" data-shared-id="${item.sharedId}">改写</button>
    ${
      item.origin === "override"
        ? `<button type="button" title="放弃改写，恢复共享原文" data-action="restore" data-shared-id="${item.sharedId}">恢复</button>`
        : ""
    }
  `;
}

function renderRuleSection(game, section) {
  const items = section.items;
  return `
    <section class="rule-section">
      <h3>${section.title}</h3>
      <ul class="rule-list">
        ${
          items
            .map((item) => {
              const editing = overrideDraft.sharedId === item.sharedId && overrideDraft.gameId === game.id;
              if (editing) {
                const rule = state.shared.find((shared) => shared.id === item.sharedId);
                return `
                  <li class="override-edit-row">
                    <form class="override-form" data-shared-id="${item.sharedId}">
                      ${
                        item.pending
                          ? `<p class="pending-note">共享原文已更新，核对后标记才会解除：<br />共享新版：${escapeHtml(rule.text)}</p>`
                          : ""
                      }
                      <textarea rows="3" data-override-text>${escapeHtml(overrideDraft.text)}</textarea>
                      <div class="override-actions">
                        <button class="primary" type="submit">保存改写</button>
                        <button type="button" data-action="cancel-override">取消</button>
                        ${
                          item.pending
                            ? `
                              <button type="button" data-action="confirm-keep" data-shared-id="${item.sharedId}">保留并核对</button>
                              <button type="button" data-action="confirm-adopt" data-shared-id="${item.sharedId}">采用新版</button>
                            `
                            : ""
                        }
                      </div>
                    </form>
                  </li>
                `;
              }
              return `
                <li class="${item.pending ? "pending" : ""}">
                  <span class="rule-text">${originBadge(item)}${escapeHtml(item.text)}</span>
                  <span class="rule-actions">${renderRuleActions(game, item)}</span>
                </li>
                ${
                  item.pending
                    ? `<li class="pending-banner">
                        <span>共享原文已更新，请核对这条改写。</span>
                        <span class="pending-banner-actions">
                          <button type="button" data-action="confirm-keep" data-shared-id="${item.sharedId}">保留改写</button>
                          <button type="button" data-action="confirm-adopt" data-shared-id="${item.sharedId}">采用新版</button>
                        </span>
                      </li>`
                    : ""
                }
              `;
            })
            .join("") || `<li><span class="rule-text">暂无内容。</span></li>`
        }
      </ul>
    </section>
  `;
}

/* ---- 共享规则库面板（展示层） ---- */

function startEditShared(rule) {
  sharedDraft.editingId = rule.id;
  sharedDraft.category = rule.category;
  sharedDraft.text = rule.text;
  sharedDraft.gameIds = [...rule.gameIds];
  renderSharedPanel();
  els.sharedTextInput.focus();
}

function resetSharedDraft() {
  sharedDraft.editingId = "";
  sharedDraft.category = "forgets";
  sharedDraft.text = "";
  sharedDraft.gameIds = [];
  overrideDraft.sharedId = "";
}

function renderSharedPanel() {
  const selected = new Set(sharedDraft.gameIds);
  const pending = countPending();
  els.sharedSummary.textContent = `${state.shared.length}条共享 · ${pending}条待核对`;

  els.sharedCategoryInput.value = sharedDraft.category;
  els.sharedTextInput.value = sharedDraft.text;
  els.sharedSubmitBtn.textContent = sharedDraft.editingId ? "保存修改" : "加入共享规则";
  els.sharedCancelBtn.hidden = !sharedDraft.editingId;
  els.sharedHint.textContent = state.games.length === 0 ? "请先添加桌游，再勾选适用游戏。" : "";

  els.sharedGamePicker.innerHTML = `
    <span class="picker-label">适用游戏</span>
    ${
      state.games
        .map(
          (game) => `
        <label class="game-chip">
          <input type="checkbox" value="${game.id}" ${selected.has(game.id) ? "checked" : ""} />
          <span>${escapeHtml(game.name)}</span>
        </label>
      `
        )
        .join("") || `<span class="empty">暂无游戏</span>`
    }
  `;

  els.sharedList.innerHTML =
    state.shared
      .map((rule) => {
        const names = rule.gameIds
          .map((id) => state.games.find((game) => game.id === id)?.name)
          .filter(Boolean);
        const overrideCount = state.games.reduce(
          (sum, game) => sum + (state.overrides[game.id]?.[rule.id] ? 1 : 0),
          0
        );
        return `
          <article class="shared-card" data-shared-id="${rule.id}">
            <div class="shared-card-head">
              <em class="tag tag-cat">${categoryTitles[rule.category]}</em>
              ${overrideCount ? `<em class="tag tag-override">${overrideCount}款改写</em>` : ""}
              <button type="button" class="shared-edit" data-action="edit-shared" data-shared-id="${rule.id}">编辑</button>
              <button type="button" title="删除共享规则（各游戏保留当前文字）" data-action="delete-shared" data-shared-id="${rule.id}">删除</button>
            </div>
            <p class="shared-text">${escapeHtml(rule.text)}</p>
            <div class="game-meta">
              ${names.length ? names.map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join("") : `<span class="empty">未勾选适用游戏（仅存档）</span>`}
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">还没有共享规则。同一系列通用的规则只维护一份，再勾选适用的游戏。</p>`;
}

function renderAll() {
  saveState();
  renderSummary();
  renderList();
  renderDetail();
  renderSharedPanel();
}

async function addGame(event) {
  event.preventDefault();
  const minPlayers = Number(els.minPlayersInput.value);
  const maxPlayers = Math.max(minPlayers, Number(els.maxPlayersInput.value));
  const cover = await readFileAsDataUrl(els.coverInput.files[0]);
  const game = {
    id: crypto.randomUUID(),
    name: els.nameInput.value.trim(),
    minPlayers,
    maxPlayers,
    duration: Number(els.durationInput.value),
    complexity: els.complexityInput.value,
    lastPlayed: els.lastPlayedInput.value,
    cover,
    forgets: ["本局开始前先补充容易忘的规则。"],
    disputes: [],
    setup: ["整理组件并按人数调整初始设置。"],
    scoring: ["确认终局计分项和即时得分项。"]
  };
  state.games.unshift(game);
  state.selectedId = game.id;
  resetSharedDraft();
  els.gameForm.reset();
  setDefaultDate();
  renderAll();
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---- 事件：筛选与游戏列表 ---- */

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  state.selectedId = card.dataset.gameId;
  overrideDraft.sharedId = "";
  renderAll();
});

/* ---- 事件：游戏详情 ---- */

els.detailView.addEventListener("submit", (event) => {
  if (event.target.id === "ruleForm") {
    event.preventDefault();
    const game = state.games.find((item) => item.id === state.selectedId);
    if (!game) return;
    const key = document.querySelector("#ruleTypeInput").value;
    const text = document.querySelector("#ruleTextInput").value.trim();
    if (!text) return;
    game[key].push(text);
    renderAll();
    return;
  }

  const overrideForm = event.target.closest(".override-form");
  if (overrideForm) {
    event.preventDefault();
    const game = state.games.find((item) => item.id === state.selectedId);
    if (!game) return;
    const sharedId = overrideForm.dataset.sharedId;
    const text = overrideForm.querySelector("[data-override-text]").value.trim();
    if (!text) return;
    saveOverride(game.id, sharedId, text);
    overrideDraft.sharedId = "";
    renderAll();
  }
});

els.detailView.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const sharedId = actionEl.dataset.sharedId;

  if (action === "delete-local") {
    const category = actionEl.dataset.category;
    const index = Number(actionEl.dataset.index);
    game[category].splice(index, 1);
    renderAll();
  }

  if (action === "override") {
    const item = getEffectiveSharedItem(game.id, state.shared.find((rule) => rule.id === sharedId));
    overrideDraft.gameId = game.id;
    overrideDraft.sharedId = sharedId;
    overrideDraft.text = item.text;
    renderAll();
    const editor = els.detailView.querySelector("[data-override-text]");
    if (editor) {
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  if (action === "cancel-override") {
    overrideDraft.sharedId = "";
    renderAll();
  }

  if (action === "restore") {
    removeOverride(game.id, sharedId);
    overrideDraft.sharedId = "";
    renderAll();
  }

  if (action === "confirm-keep") {
    confirmOverride(game.id, sharedId, "keep");
    overrideDraft.sharedId = "";
    renderAll();
  }

  if (action === "confirm-adopt") {
    confirmOverride(game.id, sharedId, "adopt");
    overrideDraft.sharedId = "";
    renderAll();
  }
});

// 顶部的「标记今天玩过 / 删除桌游」按钮没有 data-action，单独判定
els.detailView.addEventListener("click", (event) => {
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");
  if (!playedButton && !deleteButton) return;
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  if (playedButton) {
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    renderAll();
  }
  if (deleteButton) {
    deleteGame(game.id);
    resetSharedDraft();
    renderAll();
  }
});

/* ---- 事件：共享规则库 ---- */

els.sharedGamePicker.addEventListener("change", (event) => {
  if (event.target.tagName !== "INPUT") return;
  const id = event.target.value;
  if (event.target.checked) {
    if (!sharedDraft.gameIds.includes(id)) sharedDraft.gameIds.push(id);
  } else {
    sharedDraft.gameIds = sharedDraft.gameIds.filter((gameId) => gameId !== id);
  }
});

els.sharedCategoryInput.addEventListener("change", () => {
  sharedDraft.category = els.sharedCategoryInput.value;
});

els.sharedTextInput.addEventListener("input", () => {
  sharedDraft.text = els.sharedTextInput.value;
});

els.sharedCancelBtn.addEventListener("click", () => {
  resetSharedDraft();
  renderSharedPanel();
});

els.sharedForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const category = sharedDraft.category;
  const text = sharedDraft.text.trim();
  if (!text) {
    els.sharedHint.textContent = "请先填写共享内容。";
    return;
  }
  if (sharedDraft.gameIds.length === 0) {
    els.sharedHint.textContent = "请至少勾选一款适用游戏。";
    return;
  }
  if (sharedDraft.editingId) {
    updateSharedRule(sharedDraft.editingId, { category, text, gameIds: sharedDraft.gameIds });
  } else {
    addSharedRule({ category, text, gameIds: sharedDraft.gameIds });
  }
  resetSharedDraft();
  renderAll();
});

els.sharedList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const rule = state.shared.find((item) => item.id === button.dataset.sharedId);
  if (!rule) return;

  if (button.dataset.action === "edit-shared") {
    startEditShared(rule);
  }

  if (button.dataset.action === "delete-shared") {
    deleteSharedRule(rule.id);
    if (sharedDraft.editingId === rule.id) resetSharedDraft();
    renderAll();
  }
});

setDefaultDate();
renderAll();
