/**
 * 首頁問候語 —— 單一來源。
 *
 * 原本只有早安／午安／晚安三句，看時間決定，每天講一樣的話。
 * 改成看「現在發生什麼事」：練完了、連續幾天、今天要練什麼、還沒開始過。
 * 情境有優先級，同一個情境裡有數句輪替，所以同一天不同時段也不會完全一樣。
 *
 * 寫作規則（跟 drvn-interface-standard 一致）：
 *   · 中文 ≤ 8 字 —— 首頁那行是 32px，再長就折行
 *   · 講使用者的狀態或今天要做的事，不講系統做了什麼
 *   · 不催促、不說教、不評價
 */

/* 每一組：id（情境）、when（成立條件）、lines（該情境的候選句）。
   由上往下比對，第一個成立的就是它 —— 所以「已經練完」排在「今天要練」前面。 */
const GREETINGS = [
    {
        id: 'done',
        when: (c) => c.strengthDone || c.runDone,
        lines: [
            ['今天做完了', 'Done for today'],
            ['這一次算數', 'That one counted'],
            ['收工', 'Session closed'],
            ['又累積一次', 'One more in the bank'],
        ],
    },
    {
        id: 'week-complete',
        when: (c) => c.weekTarget > 0 && c.weekDone >= c.weekTarget,
        lines: [
            ['這週練滿了', 'Week complete'],
            ['這週的份做完了', "This week's done"],
        ],
    },
    { id: 'streak-30', when: (c) => c.streak >= 30, lines: [['三十天了', 'Thirty days in']] },
    { id: 'streak-14', when: (c) => c.streak >= 14, lines: [['兩週沒斷', 'Two weeks unbroken']] },
    { id: 'streak-7', when: (c) => c.streak >= 7, lines: [['連續一週', 'A full week']] },
    { id: 'streak-3', when: (c) => c.streak >= 3, lines: [['第三天了', 'Day three']] },
    {
        id: 'newcomer',
        when: (c) => c.isNew,
        lines: [
            ['從第一次開始', 'Start with one'],
            ['先做一次就好', 'Just do one'],
        ],
    },
    {
        id: 'day-dual',
        when: (c) => c.dayType === 'dual',
        lines: [
            ['今天兩趟', 'Two sessions today'],
            ['重訓加跑步', 'Lift and run'],
        ],
    },
    {
        id: 'day-strength',
        when: (c) => c.dayType === 'strength',
        lines: [
            ['今天練重訓', 'Lift day'],
            ['今天變強一點', 'A little stronger today'],
            ['今天加重量', 'Add weight today'],
        ],
    },
    {
        id: 'day-run',
        when: (c) => c.dayType === 'run',
        lines: [
            ['今天跑步', 'Run day'],
            ['去跑一段', 'Go for a run'],
            ['出門跑', 'Go run'],
        ],
    },
    {
        id: 'day-makeup',
        when: (c) => c.dayType === 'makeup',
        lines: [
            ['今天補課', 'Make-up day'],
            ['把那一課補回來', 'Catch it back up'],
        ],
    },
    {
        id: 'day-rest',
        when: (c) => c.dayType === 'rest',
        lines: [
            ['休息也是訓練', 'Rest is training'],
            ['今天讓身體修', 'Let the body repair'],
            ['不練也在進步', 'Still progressing'],
        ],
    },
    {
        id: 'late-night',
        when: (c) => c.hour >= 23 || c.hour < 5,
        lines: [
            ['夜深了', 'Late one'],
            ['還醒著', 'Still up'],
        ],
    },
    {
        id: 'morning',
        when: (c) => c.hour >= 5 && c.hour < 12,
        lines: [
            ['早安', 'Good morning'],
            ['新的一天', 'New day'],
            ['趁早動', 'Move early'],
        ],
    },
    {
        id: 'afternoon',
        when: (c) => c.hour >= 12 && c.hour < 18,
        lines: [
            ['午安', 'Good afternoon'],
            ['下午了', 'Afternoon'],
            ['還有半天', 'Half a day left'],
        ],
    },
    {
        id: 'evening',
        when: () => true,                       // 收尾，一定成立
        lines: [
            ['晚安', 'Good evening'],
            ['今天還來得及', 'Still time today'],
            ['一天要收尾了', 'Winding down'],
        ],
    },
];

/** 這一輪要取第幾句。用 3 小時一桶，同一個時段內重繪不會跳字。 */
const bucketOf = (now) => Math.floor(now.getTime() / (3 * 60 * 60 * 1000));

/**
 * @param {object} ctx
 *   hour          {number}  0–23
 *   dayType       {string}  'strength' | 'run' | 'dual' | 'makeup' | 'rest'
 *   strengthDone  {boolean} 今天的重訓已完成
 *   runDone       {boolean} 今天的跑步已完成
 *   streak        {number}  連續天數
 *   weekDone      {number}  本週已完成次數
 *   weekTarget    {number}  本週目標次數
 *   isNew         {boolean} 還沒有任何訓練紀錄
 * @returns {{ zh: string, en: string, id: string }}
 */
export function pickGreeting(ctx = {}, now = new Date()) {
    const c = {
        hour: Number.isFinite(ctx.hour) ? ctx.hour : now.getHours(),
        dayType: ctx.dayType || null,
        strengthDone: !!ctx.strengthDone,
        runDone: !!ctx.runDone,
        streak: Number(ctx.streak) || 0,
        weekDone: Number(ctx.weekDone) || 0,
        weekTarget: Number(ctx.weekTarget) || 0,
        isNew: !!ctx.isNew,
    };
    const group = GREETINGS.find((g) => g.when(c)) || GREETINGS[GREETINGS.length - 1];
    const [zh, en] = group.lines[bucketOf(now) % group.lines.length];
    return { zh, en, id: group.id };
}

/** 全部句子（給測試與盤點用） */
export const GREETING_LINES = GREETINGS.flatMap((g) => g.lines.map(([zh, en]) => ({ id: g.id, zh, en })));

export default { pickGreeting, GREETING_LINES };
