// 🏠 主頁卡牌註冊表 + 顯示/隱藏狀態儲存
//
// 主頁的每個可移除區塊（block）都在這裡註冊。
// - 長按主頁任意卡牌 → 進入編輯模式（抖動），右上角 ⊖ 移除
// - 左上角「＋」→ 加回被移除的卡牌
// - 設定頁「功能卡牌區」→ 被移除的功能仍可從那裡進入 / 加回主頁
//
// 儲存：localStorage `drvn_home_hidden_cards_<userId>`（JSON string[]）
// 變更會廣播 window 事件 HOME_CARDS_EVENT，主頁與設定頁即時同步。

export const HOME_CARDS_EVENT = 'drvn-home-cards-changed';

export const HOME_CARDS = [
    { id: 'insight',  title: '每日摘要與天氣', desc: '摘要 / 天氣 / 提醒輪播', route: null },
    { id: 'week',     title: '本週行程',       desc: '週曆與每日議程',        route: '/master-journey-mobile' },
    { id: 'run',      title: '跑步卡',         desc: '今日跑步計劃 / 最新跑步', route: '/cardio-tracker-mobile' },
    { id: 'feed',     title: '最新動態',       desc: '近 30 天所有運動紀錄',   route: '/activity-feed-mobile' },
    { id: 'calendar', title: '活動紀錄',       desc: '本月訓練月曆',          route: '/activity-feed-mobile' },
    { id: 'status',   title: '恢復與營養',     desc: '恢復電量 + 今日熱量',    route: '/nutrition-mobile' },
    { id: 'pr',       title: '個人紀錄',       desc: 'PR 獎盃櫃',             route: '/power-pr-tracker-mobile' },
    { id: 'body',     title: '身體數據',       desc: 'InBody 與體態趨勢',     route: '/body-analysis-mobile' },
    {
        id: 'more', title: '更多操作', desc: '健身人格 / 音樂專注 / 每週回顧', route: null,
        subLinks: [
            { label: '健身人格', route: '/personality-mobile' },
            { label: '音樂專注', route: '/sonic-focus-mobile' },
            { label: '每週回顧', route: '/weekly-recap-mobile' },
        ],
    },
    // ⚠️ 「今日焦點」hero 卡是 App 核心動作，固定顯示、不可移除。
];

const storageKey = (userId) => `drvn_home_hidden_cards_${userId || 'guest'}`;

export const getHiddenHomeCards = (userId) => {
    try {
        const raw = localStorage.getItem(storageKey(userId));
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter(id => HOME_CARDS.some(c => c.id === id)) : [];
    } catch (_) { return []; }
};

const save = (userId, ids) => {
    try { localStorage.setItem(storageKey(userId), JSON.stringify(ids)); } catch (_) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent(HOME_CARDS_EVENT, { detail: { userId, hidden: ids } })); } catch (_) { /* ignore */ }
};

export const hideHomeCard = (userId, id) => {
    const cur = getHiddenHomeCards(userId);
    if (!cur.includes(id)) save(userId, [...cur, id]);
};

export const restoreHomeCard = (userId, id) => {
    save(userId, getHiddenHomeCards(userId).filter(x => x !== id));
};

export const getCardMeta = (id) => HOME_CARDS.find(c => c.id === id) || null;
