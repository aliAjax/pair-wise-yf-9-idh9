// 共享规则存档层
// 只负责共享规则的数据结构与增删改：分类、适用游戏、各游戏的改写与待确认标记。
// 生效内容的判定见 shared-resolver.js，页面展示见 app.js。
window.SharedRuleStore = (() => {
  const CATEGORIES = ["forgets", "disputes", "setup", "scoring"];

  function isValidCategory(category) {
    return CATEGORIES.includes(category);
  }

  // 规整单条共享规则：分类合法化、适用游戏去重、改写只保留仍适用的游戏。
  function normalizeRule(rule) {
    if (!rule || typeof rule !== "object") return null;
    const gameIds = [...new Set(Array.isArray(rule.gameIds) ? rule.gameIds.filter(Boolean) : [])];
    const overrides = {};
    if (rule.overrides && typeof rule.overrides === "object") {
      for (const [gameId, override] of Object.entries(rule.overrides)) {
        if (!gameIds.includes(gameId)) continue;
        if (!override || typeof override.text !== "string" || !override.text.trim()) continue;
        overrides[gameId] = { text: override.text, pending: Boolean(override.pending) };
      }
    }
    return {
      id: rule.id || crypto.randomUUID(),
      text: String(rule.text || "").trim(),
      category: isValidCategory(rule.category) ? rule.category : CATEGORIES[0],
      gameIds,
      overrides
    };
  }

  function normalizeAll(rules) {
    if (!Array.isArray(rules)) return [];
    return rules.map(normalizeRule).filter((rule) => rule && rule.text);
  }

  function findRule(state, ruleId) {
    return state.sharedRules.find((rule) => rule.id === ruleId);
  }

  function addRule(state, { text, category, gameIds }) {
    const rule = normalizeRule({ id: crypto.randomUUID(), text, category, gameIds, overrides: {} });
    if (!rule.text) return null;
    state.sharedRules.push(rule);
    return rule;
  }

  // 更新共享规则。正文变化时，各游戏的改写版保留并标记待确认，核对后才解除。
  function updateRule(state, ruleId, { text, category, gameIds }) {
    const rule = findRule(state, ruleId);
    if (!rule) return null;
    const nextText = String(text || "").trim();
    if (!nextText) return null;
    const textChanged = nextText !== rule.text;
    rule.text = nextText;
    if (isValidCategory(category)) rule.category = category;
    rule.gameIds = [...new Set((gameIds || []).filter(Boolean))];
    for (const gameId of Object.keys(rule.overrides)) {
      if (!rule.gameIds.includes(gameId)) {
        delete rule.overrides[gameId];
      } else if (textChanged) {
        rule.overrides[gameId].pending = true;
      }
    }
    return rule;
  }

  function removeRule(state, ruleId) {
    state.sharedRules = state.sharedRules.filter((rule) => rule.id !== ruleId);
  }

  // 游戏从收藏中删除时，同步清理共享规则里的引用与改写。
  function detachGame(state, gameId) {
    for (const rule of state.sharedRules) {
      rule.gameIds = rule.gameIds.filter((id) => id !== gameId);
      delete rule.overrides[gameId];
    }
  }

  // 游戏改写共享内容。改写与共享版一致时视为放弃改写；新改写默认已核对。
  function setOverride(state, ruleId, gameId, text) {
    const rule = findRule(state, ruleId);
    if (!rule || !rule.gameIds.includes(gameId)) return;
    const nextText = String(text || "").trim();
    if (!nextText) return;
    if (nextText === rule.text) {
      delete rule.overrides[gameId];
      return;
    }
    rule.overrides[gameId] = { text: nextText, pending: false };
  }

  // 核对完成后解除待确认标记。
  function confirmOverride(state, ruleId, gameId) {
    const override = findRule(state, ruleId)?.overrides?.[gameId];
    if (override) override.pending = false;
  }

  return {
    CATEGORIES,
    normalizeAll,
    findRule,
    addRule,
    updateRule,
    removeRule,
    detachGame,
    setOverride,
    confirmOverride
  };
})();
