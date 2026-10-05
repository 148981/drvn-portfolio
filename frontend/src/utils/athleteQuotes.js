/**
 * athleteQuotes.js — 精選運動員語錄庫（瑞士極簡休息畫面用）
 * ─────────────────────────────────────────────────────────────
 * 涵蓋各種運動：健美 / 力量、籃球、田徑、游泳、網球、足球、拳擊、
 * 綜合格鬥、體操、自行車、美式足球、棒球、滑雪、登山等。
 * 每則：{ text, author, sport }
 *   - text 已翻成中文、控制在 1–2 行內（休息畫面大字排版）
 *   - author / sport 以小字標註（Swiss editorial credit line）
 *
 * getRestQuote()：隨機抽一句（同一次休息內固定）。
 * getPRQuote()：破紀錄專用語錄（PR 彩蛋搭配）。
 */

export const ATHLETE_QUOTES = [
    // ── 健美 / 力量 ─────────────────────────────
    { text: '最後三、四下，才是讓肌肉生長的關鍵。', author: 'Arnold Schwarzenegger', sport: 'Bodybuilding' },
    { text: '力量不來自勝利，而來自你不屈服的掙扎。', author: 'Arnold Schwarzenegger', sport: 'Bodybuilding' },
    { text: '每個人都想成功，但沒人想舉那些該死的重量。', author: 'Ronnie Coleman', sport: 'Bodybuilding' },
    { text: '在沒人看見的地方，你付出了多少？', author: 'Chris Bumstead', sport: 'Bodybuilding' },
    { text: '刺激肌肉，而不是毀滅它。', author: 'Lee Haney', sport: 'Bodybuilding' },
    { text: '離開健身房前，先確定自己毫無保留。', author: 'Tom Platz', sport: 'Bodybuilding' },
    { text: '做同樣的事，只會得到同樣的結果。', author: 'Jay Cutler', sport: 'Bodybuilding' },
    { text: '沒有藉口，把它舉起來就對了。', author: 'C.T. Fletcher', sport: 'Powerlifting' },
    { text: '大腦說到極限時，你其實只用了四成。', author: 'David Goggins', sport: 'Ultra Endurance' },
    { text: '紀律，就是做你不想做但必須做的事。', author: 'Mike Tyson', sport: 'Boxing' },

    // ── 籃球 ────────────────────────────────────
    { text: '在終點休息，而不是在半途。', author: 'Kobe Bryant', sport: 'Basketball' },
    { text: '你見過凌晨四點的洛杉磯嗎？', author: 'Kobe Bryant', sport: 'Basketball' },
    { text: '我可以接受失敗，但無法接受不去嘗試。', author: 'Michael Jordan', sport: 'Basketball' },
    { text: '我職業生涯投丟了九千多球——所以我成功。', author: 'Michael Jordan', sport: 'Basketball' },
    { text: '天賦贏得比賽，團隊與智慧贏得冠軍。', author: 'Michael Jordan', sport: 'Basketball' },
    { text: '壓力是特權——它只找得上配得起它的人。', author: 'LeBron James', sport: 'Basketball' },
    { text: '別讓任何人告訴你，你做不到。', author: 'Stephen Curry', sport: 'Basketball' },

    // ── 田徑 / 跑步 ─────────────────────────────
    { text: '痛苦是短暫的，放棄是永遠的。', author: 'Eliud Kipchoge', sport: 'Marathon' },
    { text: '沒有人類極限這回事。', author: 'Eliud Kipchoge', sport: 'Marathon' },
    { text: '我不是天生冠軍，我是練成的。', author: 'Usain Bolt', sport: 'Sprint' },
    { text: '訓練時流的汗，是比賽時的底氣。', author: 'Usain Bolt', sport: 'Sprint' },
    { text: '跑得慢沒關係，停下來才輸。', author: 'Mo Farah', sport: 'Distance Running' },

    // ── 游泳 ────────────────────────────────────
    { text: '你不能給自己設限，夢想越大越好。', author: 'Michael Phelps', sport: 'Swimming' },
    { text: '別人休息的時候，正是我超越的時候。', author: 'Michael Phelps', sport: 'Swimming' },
    { text: '水不會騙人——你練了多少，它都知道。', author: 'Katie Ledecky', sport: 'Swimming' },

    // ── 網球 ────────────────────────────────────
    { text: '冠軍會一直打，直到打對為止。', author: 'Billie Jean King', sport: 'Tennis' },
    { text: '我最大的對手，永遠是昨天的自己。', author: 'Rafael Nadal', sport: 'Tennis' },
    { text: '天賦只是起點，努力才是終點。', author: 'Roger Federer', sport: 'Tennis' },
    { text: '我不怕輸，我怕的是沒拚盡全力。', author: 'Serena Williams', sport: 'Tennis' },

    // ── 足球 ────────────────────────────────────
    { text: '天賦若不努力，只是浪費。', author: 'Cristiano Ronaldo', sport: 'Football' },
    { text: '我花了十七年又一百一十四天，才一夜成名。', author: 'Lionel Messi', sport: 'Football' },
    { text: '越努力練習，比賽越輕鬆。', author: 'Pelé', sport: 'Football' },

    // ── 拳擊 / 格鬥 ─────────────────────────────
    { text: '現在承受痛苦，然後以冠軍的身分活著。', author: 'Muhammad Ali', sport: 'Boxing' },
    { text: '冠軍不是在擂台上誕生的，那只是他被看見的地方。', author: 'Muhammad Ali', sport: 'Boxing' },
    { text: '每一天都是讓自己變強的機會。', author: 'Georges St-Pierre', sport: 'MMA' },
    { text: '我不相信天分，我相信重複。', author: 'Conor McGregor', sport: 'MMA' },

    // ── 體操 / 舉重 ─────────────────────────────
    { text: '先相信自己做得到，身體才會跟上。', author: 'Simone Biles', sport: 'Gymnastics' },
    { text: '槓鈴不會說謊，它只回應你的準備。', author: '呂小軍', sport: 'Weightlifting' },
    { text: '把每一次試舉，都當成人生唯一一次。', author: 'Lasha Talakhadze', sport: 'Weightlifting' },
    { text: '舉起來的那一刻，過去所有的苦都值得。', author: '郭婞淳', sport: 'Weightlifting' },

    // ── 自行車 / 耐力 ───────────────────────────
    { text: '腿在燃燒的時候，意志才剛開始。', author: 'Greg LeMond', sport: 'Cycling' },
    { text: '它不會變輕鬆，你只會變更快。', author: 'Greg LeMond', sport: 'Cycling' },

    // ── 美式足球 / 棒球 ────────────────────────
    { text: '想贏的意志，人人都有；願意準備的意志，才稀有。', author: 'Vince Lombardi', sport: 'American Football' },
    { text: '不是倒下與否，而是倒下後站不站得起來。', author: 'Vince Lombardi', sport: 'American Football' },
    { text: '別讓對失敗的恐懼，擋住你揮棒。', author: 'Babe Ruth', sport: 'Baseball' },
    { text: '努力是不會背叛你的。', author: '鈴木一朗', sport: 'Baseball' },
    { text: '把每個平凡的小事做到極致，就是不平凡。', author: '大谷翔平', sport: 'Baseball' },

    // ── 滑雪 / 登山 / 其他 ─────────────────────
    { text: '山不會遷就你，你只能變得更強。', author: 'Reinhold Messner', sport: 'Alpinism' },
    { text: '恐懼是路標——它指著你該去的方向。', author: 'Lindsey Vonn', sport: 'Alpine Skiing' },
    { text: '身體會記住每一次你沒有放棄。', author: 'Kílian Jornet', sport: 'Trail Running' },
];

// ── 破紀錄（PR）專用語錄：搭配 PR 彩蛋動畫 ──────────────────
export const PR_QUOTES = [
    { text: '紀錄存在的意義，就是被打破。', author: 'Usain Bolt', sport: 'Sprint' },
    { text: '你剛剛做到了昨天的你做不到的事。', author: 'DRVN', sport: 'New Apex' },
    { text: '極限只是一個等著被更新的數字。', author: 'Eliud Kipchoge', sport: 'Marathon' },
    { text: '這一下，重寫了你的歷史。', author: 'DRVN', sport: 'New Apex' },
    { text: '最強的對手是昨天的自己——你贏了。', author: 'Rafael Nadal', sport: 'Tennis' },
    { text: '別停在這裡，這只是新的起點。', author: 'Michael Phelps', sport: 'Swimming' },
];

export function getRestQuote() {
    return ATHLETE_QUOTES[Math.floor(Math.random() * ATHLETE_QUOTES.length)];
}

export function getPRQuote() {
    return PR_QUOTES[Math.floor(Math.random() * PR_QUOTES.length)];
}
