// 页面展示层：只负责渲染与交互。
// 共享规则的存档见 shared-store.js，引用判定见 shared-resolver.js。
const storageKey = "zfl18-boardgame-rule-cards";
const today = new Date();

const CATEGORY_LABELS = {
  forgets: "容易忘的规则",
  disputes: "常见争议",
  setup: "开局准备",
  scoring: "计分提醒"
};

const seedGameIds = {
  orleans: crypto.randomUUID(),
  gaia: crypto.randomUUID(),
  azul: crypto.randomUUID()
};

const defaultState = {
  selectedId: "",
  games: [
    {
      id: seedGameIds.orleans,
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
    },
    {
      id: seedGameIds.gaia,
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
      scoring: ["终局计分板", "科技轨排名", "联邦和建筑分"]
    },
    {
      id: seedGameIds.azul,
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
    }
  ],
  sharedRules: [
    {
      id: crypto.randomUUID(),
      text: "两人局需要按说明书启用对应的变体设置",
      category: "setup",
      gameIds: [seedGameIds.orleans, seedGameIds.gaia],
      overrides: {}
    }
  ]
};

let state = loadState();
if (!state.selectedId) state.selectedId = state.games[0]?.id || "";

let editingSharedId = "";
let editingOverride = null;
let sharedFormCheckedIds = new Set();

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
  sharedRuleForm: document.querySelector("#sharedRuleForm"),
  sharedCategoryInput: document.querySelector("#sharedCategoryInput"),
  sharedTextInput: document.querySelector("#sharedTextInput"),
  sharedGameChecks: document.querySelector("#sharedGameChecks"),
  sharedSubmitBtn: document.querySelector("#sharedSubmitBtn"),
  sharedCancelBtn: document.querySelector("#sharedCancelBtn"),
  sharedRuleList: document.querySelector("#sharedRuleList"),
  sharedCount: document.querySelector("#sharedCount")
};

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    const state = { ...structuredClone(defaultState), ...parsed };
    // 旧版本存档没有共享规则字段，按空列表处理，不注入示例数据。
    state.sharedRules = SharedRuleStore.normalizeAll(parsed.sharedRules);
    const gameIds = new Set(state.games.map((game) => game.id));
    for (const rule of state.sharedRules) {
      rule.gameIds = rule.gameIds.filter((id) => gameIds.has(id));
      for (const gameId of Object.keys(rule.overrides)) {
        if (!gameIds.has(gameId)) delete rule.overrides[gameId];
      }
    }
    return state;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function daysSince(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getFilteredGames() {
  const keyword = els.searchInput.value.trim();
  const player = els.playerFilter.value;
  const complexity = els.complexityFilter.value;
  const games = state.games.filter((game) => {
    const text = SharedRuleResolver.buildSearchText(state, game);
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
  const allRuleCount = state.games.reduce((sum, game) => sum + SharedRuleResolver.countRules(state, game), 0);
  const stale = [...state.games].sort((a, b) => daysSince(b.lastPlayed) - daysSince(a.lastPlayed))[0];
  els.gameCount.textContent = state.games.length;
  els.ruleCount.textContent = allRuleCount;
  els.staleGame.textContent = stale ? `${daysSince(stale.lastPlayed)}天` : "-";
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

function renderDetail() {
  const game = state.games.find((item) => item.id === state.selectedId) || state.games[0];
  if (!game) {
    els.detailView.innerHTML = `<p class="empty">先添加一个桌游。</p>`;
    return;
  }
  state.selectedId = game.id;
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
      ${SharedRuleStore.CATEGORIES.map((key) => renderRuleSection(key, game)).join("")}
      <form class="add-rule" id="ruleForm">
        <select id="ruleTypeInput">
          ${SharedRuleStore.CATEGORIES.map((key) => `<option value="${key}">${CATEGORY_LABELS[key]}</option>`).join("")}
        </select>
        <textarea id="ruleTextInput" rows="3" placeholder="补充一条聚会前要看的提醒" required></textarea>
        <button class="primary" type="submit">加入规则卡片</button>
      </form>
      <div class="detail-actions">
        <button id="playedTodayBtn" type="button">标记今天玩过</button>
        <button id="deleteGameBtn" type="button">删除桌游</button>
      </div>
    </div>
  `;
}

function renderRuleSection(key, game) {
  const entries = SharedRuleResolver.getEntriesForCategory(state, game, key);
  return `
    <section class="rule-section">
      <h3>${CATEGORY_LABELS[key]}</h3>
      <ul class="rule-list">
        ${entries.map((entry) => renderRuleEntry(entry, game)).join("") || `<li><span>暂无内容。</span></li>`}
      </ul>
    </section>
  `;
}

function renderRuleEntry(entry, game) {
  if (entry.kind === "local") {
    return `
      <li>
        <span>${escapeHtml(entry.text)}</span>
        <button type="button" title="删除" data-rule-key="${entry.category}" data-rule-index="${entry.index}">×</button>
      </li>
    `;
  }

  const sharedNames = entry.sharedWith
    .map((gameId) => state.games.find((item) => item.id === gameId)?.name)
    .filter(Boolean);
  const sourceLine = `来自共享规则${sharedNames.length ? ` · 与 ${sharedNames.map(escapeHtml).join("、")} 共享` : ""}`;
  const editing = editingOverride && editingOverride.ruleId === entry.ruleId && editingOverride.gameId === game.id;

  if (editing) {
    return `
      <li class="shared-entry">
        <div class="shared-entry-main">
          <textarea rows="2" data-override-text>${escapeHtml(entry.text)}</textarea>
          <p class="shared-origin">共享版：${escapeHtml(entry.sharedText)}</p>
        </div>
        <div class="shared-entry-actions">
          <button type="button" data-override-action="save" data-rule-id="${entry.ruleId}">保存</button>
          <button type="button" data-override-action="cancel" data-rule-id="${entry.ruleId}">取消</button>
        </div>
      </li>
    `;
  }

  return `
    <li class="shared-entry">
      <div class="shared-entry-main">
        <span>${escapeHtml(entry.text)}</span>
        <span class="shared-tags">
          <span class="pill shared">共享</span>
          ${entry.overridden ? `<span class="pill overridden">已改写</span>` : ""}
          ${entry.pending ? `<span class="pill pending">待确认</span>` : ""}
        </span>
        <p class="shared-origin">${sourceLine}</p>
        ${entry.overridden ? `<p class="shared-origin">共享版：${escapeHtml(entry.sharedText)}</p>` : ""}
      </div>
      <div class="shared-entry-actions">
        <button type="button" data-override-action="edit" data-rule-id="${entry.ruleId}">改写</button>
        ${entry.pending ? `<button type="button" data-override-action="confirm" data-rule-id="${entry.ruleId}">核对</button>` : ""}
      </div>
    </li>
  `;
}

function renderSharedGameChecks() {
  const validIds = new Set(state.games.map((game) => game.id));
  sharedFormCheckedIds = new Set([...sharedFormCheckedIds].filter((id) => validIds.has(id)));
  els.sharedGameChecks.innerHTML =
    state.games
      .map(
        (game) => `
        <label class="shared-check">
          <input type="checkbox" value="${game.id}" ${sharedFormCheckedIds.has(game.id) ? "checked" : ""} />
          <span>${escapeHtml(game.name)}</span>
        </label>
      `
      )
      .join("") || `<p class="empty">暂无桌游，先在上方添加。</p>`;
}

function renderSharedList() {
  els.sharedCount.textContent = `${state.sharedRules.length}条`;
  els.sharedRuleList.innerHTML =
    state.sharedRules
      .map((rule) => {
        const names = rule.gameIds
          .map((gameId) => state.games.find((game) => game.id === gameId)?.name)
          .filter(Boolean);
        const pending = SharedRuleResolver.countPending(rule);
        return `
          <article class="shared-card">
            <p class="shared-text">${escapeHtml(rule.text)}</p>
            <div class="game-meta">
              <span class="pill">${CATEGORY_LABELS[rule.category]}</span>
              ${pending ? `<span class="pill pending">${pending}款游戏待确认</span>` : ""}
            </div>
            <p class="shared-games-line">适用：${names.map(escapeHtml).join("、") || "未勾选游戏"}</p>
            <div class="shared-card-actions">
              <button type="button" data-shared-action="edit" data-rule-id="${rule.id}">编辑</button>
              <button type="button" data-shared-action="remove" data-rule-id="${rule.id}">移除</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="empty">还没有共享规则，可在上方添加。</p>`;
}

function renderAll() {
  saveState();
  renderSummary();
  renderList();
  renderDetail();
  renderSharedGameChecks();
  renderSharedList();
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
  els.gameForm.reset();
  setDefaultDate();
  renderAll();
}

function submitSharedRule(event) {
  event.preventDefault();
  const text = els.sharedTextInput.value.trim();
  if (!text) return;
  const category = els.sharedCategoryInput.value;
  const gameIds = [...sharedFormCheckedIds];
  if (editingSharedId) {
    SharedRuleStore.updateRule(state, editingSharedId, { text, category, gameIds });
  } else {
    SharedRuleStore.addRule(state, { text, category, gameIds });
  }
  resetSharedForm();
  renderAll();
}

function startEditSharedRule(ruleId) {
  const rule = SharedRuleStore.findRule(state, ruleId);
  if (!rule) return;
  editingSharedId = ruleId;
  sharedFormCheckedIds = new Set(rule.gameIds);
  els.sharedTextInput.value = rule.text;
  els.sharedCategoryInput.value = rule.category;
  els.sharedSubmitBtn.textContent = "更新共享规则";
  els.sharedCancelBtn.hidden = false;
  renderAll();
}

function removeSharedRule(ruleId) {
  const rule = SharedRuleStore.findRule(state, ruleId);
  if (!rule) return;
  // 移除共享规则时，各游戏保留当前实际生效的文字，转为本地规则。
  for (const gameId of rule.gameIds) {
    const game = state.games.find((item) => item.id === gameId);
    if (!game) continue;
    const text = SharedRuleResolver.getEffectiveText(rule, gameId);
    if (text && !game[rule.category].includes(text)) game[rule.category].push(text);
  }
  if (editingSharedId === ruleId) resetSharedForm();
  if (editingOverride?.ruleId === ruleId) editingOverride = null;
  SharedRuleStore.removeRule(state, ruleId);
  renderAll();
}

function resetSharedForm() {
  editingSharedId = "";
  sharedFormCheckedIds = new Set();
  els.sharedRuleForm.reset();
  els.sharedSubmitBtn.textContent = "保存共享规则";
  els.sharedCancelBtn.hidden = true;
}

function handleOverrideAction(button, game) {
  const ruleId = button.dataset.ruleId;
  const action = button.dataset.overrideAction;
  if (action === "edit") {
    editingOverride = { ruleId, gameId: game.id };
  } else if (action === "cancel") {
    editingOverride = null;
  } else if (action === "save") {
    const textarea = button.closest("li")?.querySelector("[data-override-text]");
    const text = textarea?.value.trim();
    if (!text) return;
    SharedRuleStore.setOverride(state, ruleId, game.id, text);
    editingOverride = null;
  } else if (action === "confirm") {
    SharedRuleStore.confirmOverride(state, ruleId, game.id);
  }
  renderAll();
}

function setDefaultDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 2);
  els.lastPlayedInput.value = date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.searchInput.addEventListener("input", renderAll);
els.playerFilter.addEventListener("change", renderAll);
els.complexityFilter.addEventListener("change", renderAll);
els.sortMode.addEventListener("change", renderAll);
els.gameForm.addEventListener("submit", addGame);
els.sharedRuleForm.addEventListener("submit", submitSharedRule);

els.sharedCancelBtn.addEventListener("click", () => {
  resetSharedForm();
  renderAll();
});

els.sharedGameChecks.addEventListener("change", (event) => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;
  if (input.checked) sharedFormCheckedIds.add(input.value);
  else sharedFormCheckedIds.delete(input.value);
});

els.sharedRuleList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-shared-action]");
  if (!button) return;
  const ruleId = button.dataset.ruleId;
  if (button.dataset.sharedAction === "edit") startEditSharedRule(ruleId);
  if (button.dataset.sharedAction === "remove") removeSharedRule(ruleId);
});

els.gameList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-game-id]");
  if (!card) return;
  state.selectedId = card.dataset.gameId;
  editingOverride = null;
  renderAll();
});

els.detailView.addEventListener("submit", (event) => {
  if (event.target.id !== "ruleForm") return;
  event.preventDefault();
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;
  const key = document.querySelector("#ruleTypeInput").value;
  const text = document.querySelector("#ruleTextInput").value.trim();
  if (!text) return;
  game[key].push(text);
  renderAll();
});

els.detailView.addEventListener("click", (event) => {
  const game = state.games.find((item) => item.id === state.selectedId);
  if (!game) return;

  const overrideButton = event.target.closest("[data-override-action]");
  if (overrideButton) {
    handleOverrideAction(overrideButton, game);
    return;
  }

  const ruleButton = event.target.closest("[data-rule-key]");
  const playedButton = event.target.closest("#playedTodayBtn");
  const deleteButton = event.target.closest("#deleteGameBtn");

  if (ruleButton) {
    const key = ruleButton.dataset.ruleKey;
    const index = Number(ruleButton.dataset.ruleIndex);
    game[key].splice(index, 1);
    renderAll();
  }

  if (playedButton) {
    game.lastPlayed = new Date().toISOString().slice(0, 10);
    renderAll();
  }

  if (deleteButton) {
    SharedRuleStore.detachGame(state, game.id);
    state.games = state.games.filter((item) => item.id !== game.id);
    state.selectedId = state.games[0]?.id || "";
    editingOverride = null;
    renderAll();
  }
});

els.sharedCategoryInput.innerHTML = SharedRuleStore.CATEGORIES.map(
  (key) => `<option value="${key}">${CATEGORY_LABELS[key]}</option>`
).join("");

setDefaultDate();
renderAll();
