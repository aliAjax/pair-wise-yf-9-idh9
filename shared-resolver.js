// 共享规则引用判定层
// 根据存档（shared-store.js）计算每款游戏实际生效的规则内容，供搜索、统计与展示使用。
// 不修改数据，也不渲染页面（app.js）。
window.SharedRuleResolver = (() => {
  // 游戏实际生效的共享条目。同一共享规则在一款游戏里只出现一次。
  function getSharedEntries(state, gameId) {
    const seen = new Set();
    const entries = [];
    for (const rule of state.sharedRules || []) {
      if (seen.has(rule.id) || !rule.gameIds.includes(gameId)) continue;
      seen.add(rule.id);
      const override = rule.overrides?.[gameId];
      entries.push({
        kind: "shared",
        ruleId: rule.id,
        category: rule.category,
        text: override?.text ?? rule.text,
        sharedText: rule.text,
        overridden: Boolean(override),
        pending: Boolean(override?.pending),
        sharedWith: rule.gameIds.filter((id) => id !== gameId)
      });
    }
    return entries;
  }

  // 某款游戏对某条共享规则实际生效的文字（改写优先）。
  function getEffectiveText(rule, gameId) {
    return rule.overrides?.[gameId]?.text ?? rule.text;
  }

  // 某一分类下的展示条目：本地规则在前，共享规则在后。
  function getEntriesForCategory(state, game, category) {
    const local = (game[category] || []).map((text, index) => ({ kind: "local", category, text, index }));
    const shared = getSharedEntries(state, game.id).filter((entry) => entry.category === category);
    return [...local, ...shared];
  }

  // 实际生效的全部规则文字，供搜索使用。
  function getEffectiveTexts(state, game) {
    const texts = window.SharedRuleStore.CATEGORIES.flatMap((category) => game[category] || []);
    return texts.concat(getSharedEntries(state, game.id).map((entry) => entry.text));
  }

  // 统计按实际生效内容计算：本地条数 + 适用的共享规则数（同一共享规则只算一次）。
  function countRules(state, game) {
    const localCount = window.SharedRuleStore.CATEGORIES.reduce((sum, category) => sum + (game[category]?.length || 0), 0);
    return localCount + getSharedEntries(state, game.id).length;
  }

  function buildSearchText(state, game) {
    return `${game.name}${getEffectiveTexts(state, game).join("")}`;
  }

  // 某条共享规则下仍待确认的改写数量。
  function countPending(rule) {
    return Object.values(rule.overrides || {}).filter((override) => override.pending).length;
  }

  return {
    getSharedEntries,
    getEffectiveText,
    getEntriesForCategory,
    getEffectiveTexts,
    countRules,
    buildSearchText,
    countPending
  };
})();
