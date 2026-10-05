// Motivational messages for different workout moments

// Famous fitness celebrity quotes (Classic & Modern Legends)
export const CELEBRITY_QUOTES = [
    // Arnold Schwarzenegger
    { quote: "身體在健身房對抗的阻力，以及你在生活中對抗的阻力，都能鍛造堅強的性格。", author: "Arnold Schwarzenegger" },
    { quote: "最糟糕的事情就是和別人一樣。", author: "Arnold Schwarzenegger" },
    { quote: "肌肉的痠痛是成長的入場券。", author: "Arnold Schwarzenegger" },

    // Ronnie Coleman
    { quote: "Yeah Buddy! Light Weight Baby!", author: "Ronnie Coleman" },
    { quote: "每個人都想成為健美冠軍，但沒人想舉起這該死的重量！", author: "Ronnie Coleman" },

    // The Rock
    { quote: "鮮血、汗水和尊重。前兩者是你付出的，最後一個是你贏得的。", author: "Dwayne 'The Rock' Johnson" },
    { quote: "專注，然後執行。", author: "Dwayne 'The Rock' Johnson" },

    // Muhammad Ali
    { quote: "即使我討厭訓練的每一分鐘，但我告訴自己：'別放棄，現在受苦，這輩子都將以冠軍的身份生活。'", author: "Muhammad Ali" },
    { quote: "別數日子，讓日子過得有價值。", author: "Muhammad Ali" },

    // Chris Bumstead (CBum)
    { quote: "冠軍心態不是在贏的時候建立的，而是在你想放棄時建立的。", author: "Chris Bumstead" },
    { quote: "標準要高，尤其是對自己。", author: "Chris Bumstead" },

    // David Goggins
    { quote: "當你覺得自己完全不行的時候，其實你只發揮了40%的實力。", author: "David Goggins" },
    { quote: "誰去背那艘船？我要去背那艘船！(Who's gonna carry the boats?)", author: "David Goggins" },

    // Others
    { quote: "我們都會成功的 (We're all gonna make it).", author: "Zyzz" },
    { quote: "不管是多麼微小的進步，都是進步。", author: "Kai Greene" },
    { quote: "你的想法會變成現實 (Thoughts become things).", author: "Kai Greene" },
    { quote: "紀律等於自由。", author: "Jocko Willink" },
    { quote: "比起後悔的痛苦，訓練的痛苦輕多了。", author: "健身哲學" }
];

// Exercise-specific form tips (Multiple tips per exercise for variety)
export const EXERCISE_TIPS = {
    // Chest
    "Barbell Bench Press": [
        "⚠️ 關鍵：肩胛骨全程保持後收下沉，不要聳肩",
        "腿部要用力踩死地面，提供穩定的底座",
        "下放時槓鈴觸碰乳頭連線，吸氣蓄力",
        "推起時專注用胸肌發力，而不是手臂",
        "手腕保持中立，不要向後折",
        "手肘與身體呈45-60度夾角，保護肩膀"
    ],
    "Dumbbell Bench Press": [
        "推到頂端時，手臂不要完全鎖死，保持胸肌張力",
        "下放得越深，胸肌伸展感越強（但不要超過肩膀舒適度）",
        "想像要把兩隻手臂的手肘靠在一起",
        "核心要收緊，背部微拱是可以的",
        "啞鈴路徑要直上直下，不要畫弧線"
    ],
    "Incline Dumbbell Press": [
        "座椅角度調至30-45度，專攻上胸",
        "落點在鎖骨下方，不要太低",
        "手肘不要外開，保持稍微內收",
        "推起時專注感受鎖骨下方的肌肉收縮"
    ],
    "Push-ups": [
        "核心繃緊！屁股不要塌下去，身體呈一直線",
        "手指張開抓地，增加手腕穩定性",
        "下去時胸口儘量貼近地面",
        "推起時，想像要把地板推離自己",
        "手肘不要外開90度，夾角保持45度"
    ],
    "Cable Fly": [
        "像是在抱一顆大樹，手肘保持微彎固定",
        "重點是胸肌的拉伸和擠壓，不是推重量",
        "身體微前傾，核心穩定",
        "回放時控制速度，感受胸肌被拉開"
    ],

    // Back
    "Pull-ups": [
        "⚠️ 啟動第一步：先下沉肩胛骨，再彎曲手臂",
        "想像把你的『手肘』拉進口袋裡，而不是用手拉",
        "下巴要過槓，但不要仰頭去湊",
        "離心階段（下放）要慢，完全伸直手臂",
        "核心用力，避免身體前後擺動借力"
    ],
    "Lat Pulldown": [
        "⚠️ 關鍵：肩膀始終保持下沉，不要聳肩！",
        "身體微微後傾，挺胸，不要含胸",
        "想像手只是鉤子，力量專注在背部兩側",
        "下拉至上胸處即可，不用拉到肚子",
        "回放時感受背闊肌被強烈拉伸"
    ],
    "Seated Cable Row": [
        "拉回來時挺胸，用力夾緊肩胛骨",
        "身體可以隨動作微幅前後，但不要過度搖晃",
        "不要用下背慣性甩大重量",
        "手肘緊貼身體兩側向後拉",
        "下放時讓背部肌肉充分伸展，肩膀稍微前引"
    ],
    "Deadlift": [
        "⚠️ 腰背絕對要挺直，圓背會受傷",
        "槓鈴貼著小腿拉起，路徑垂直",
        "啟動時腿部推地，不是用腰拉",
        "頂端收縮夾臀，不要過度後仰",
        "核心要像被打了一拳一樣繃緊"
    ],
    "Single Arm Dumbbell Row": [
        "背部保持平直，與地面近似平行",
        "將啞鈴拉向臀部方向，而不是腋下",
        "拉起時稍微旋轉軀幹增加收縮",
        "手肘緊貼身體，不要外開"
    ],

    // Legs
    "Barbell Back Squat": [
        "起槓前先深吸一口氣進腹腔，繃緊核心",
        "下蹲時膝蓋要對準腳尖方向",
        "想像屁股往後下方找椅子坐",
        "重心始終在腳掌中央，腳跟不能離地",
        "背部保持平直，像一塊鋼板一樣",
        "下蹲深度至少大腿平行地面"
    ],
    "Leg Press": [
        "推出去時膝蓋不要完全鎖死！保留微彎",
        "屁股和下背部死死貼住椅背，不要懸空",
        "腳掌放低一點更刺激股四頭肌",
        "腳掌放高一點更刺激臀部",
        "控制下放速度，不要自由落體"
    ],
    "Romanian Deadlift": [
        "⚠️ 膝蓋微彎鎖定角度，動作過程中不要蹲",
        "想像用屁股去頂身後的牆壁",
        "槓鈴貼著大腿上下滑動",
        "感受到大腿後側有強烈拉扯感就對了",
        "背部全程保持平直，絕對不能彎腰"
    ],
    "Lunges": [
        "跨距要大，後膝蓋接近地面",
        "軀幹保持正直，不要過度前傾",
        "前腳掌踩穩，後腳跟抬起",
        "專注於前腳臀部和大腿發力蹬起"
    ],
    "Leg Extension": [
        "背部緊貼椅背，握手把穩定身體",
        "踢到頂端停頓一秒，擠壓股四頭肌",
        "下放要有控制，不要讓配重片撞擊",
        "腳尖勾起，增加肌肉感受度"
    ],

    // Shoulders
    "Overhead Barbell Press": [
        "屁股夾緊，核心繃緊，保護腰椎",
        "槓鈴軌跡要直直上下，下巴稍微避開",
        "推到頂點時，頭部稍微前伸（像探頭窗外）",
        "手肘一定要在槓鈴的正下方支撐",
        "不要借腿部的力量蹬起來（那是Push-Press）"
    ],
    "Dumbbell Shoulder Press": [
        "手肘不要完全外開，要在身體前方一點（約45度）",
        "背部貼緊椅背，不拱腰",
        "推舉至手臂伸直但不要鎖死肘關節",
        "下放至耳朵高度即可"
    ],
    "Dumbbell Lateral Raises": [
        "手肘保持微彎固定，不要伸直鎖死",
        "想像雙手拿著水壺在倒水（小拇指高於大拇指）",
        "只要舉到肩膀高度即可，不用更高",
        "專注三角肌中束發力，脖子（斜方肌）放鬆",
        "下放要慢，對抗地心引力"
    ],
    "Face Pull": [
        "將繩索拉向額頭/眼睛高度",
        "手肘要向外打開並向後拉",
        "專注於後三角肌和肩袖肌群",
        "大拇指朝後，動作頂端做外旋"
    ],

    // Arms
    "Barbell Curls": [
        "大臂（上臂）夾緊身體，不要前後晃動",
        "身體不要向後仰借力甩重量",
        "舉到頂端停頓一秒，用力擠壓二頭肌",
        "下放速度要比舉起來慢",
        "手腕保持中立或微捲，不要過度後折"
    ],
    "Hammer Curls": [
        "手掌相對（對握），像握著槌子",
        "訓練二頭肌外側和前臂",
        "動作過程保持大臂不動",
        "交替做可以舉更重，雙手做更穩定"
    ],
    "Triceps Pushdown": [
        "大臂像是被釘在身體兩側一樣如果不准動",
        "只有前臂在動當槓桿",
        "下壓到底時，用力把手臂伸直鎖死",
        "身體微前傾，重心壓在上面",
        "手腕打直，不要用手腕去壓"
    ],
    "Skull Crushers": [
        "小心！不要真的敲到頭",
        "大臂保持垂直地面或稍微向後傾",
        "手肘不要外開，夾緊頭部兩側",
        "只動前臂，感受三頭肌長頭拉伸"
    ],

    // Core
    "Plank": [
        "像是做伏地挺身撐住",
        "屁股不要翹高，也不要塌腰",
        "核心用力縮緊，對抗地心引力",
        "保持呼吸，不要憋氣",
        "視線看雙手間的地面"
    ],
    "Crunches": [
        "不要抱頭硬拉脖子！手輕放耳邊即可",
        "是用腹肌把上半身『捲』起來",
        "下背部始終貼地",
        "頂端用力吐氣擠壓腹肌"
    ],

    // Cardio
    "Treadmill Run": [
        "保持抬頭挺胸，視線看前方",
        "步頻加快，步伐適中，不要跨大步",
        "落地輕盈，避免重重跺腳",
        "放鬆肩膀和手臂，自然擺動"
    ],
    "Cycling": [
        "座椅高度：腳踩到底時膝蓋微彎",
        "核心收緊穩定骨盆，不要左右扭",
        "畫圓踩踏，提拉時也要用力",
        "肩膀放鬆，不要死抓手把"
    ],

    // Default fallback
    "default": [
        "專注於目標肌群的收縮和伸展",
        "保持呼吸：用力時吐氣，放鬆時吸氣",
        "不要犧牲動作品質來換取大重量",
        "最後幾下才是肌肉生長的關鍵",
        "動作全程保持控制，不要借力甩動",
        "核心時刻收緊，保護你的脊椎"
    ]
};

export const MOTIVATIONAL_MESSAGES = {
    preWorkout: [
        "今天是你與自己的戰鬥！",
        "踏進這裡，就已經贏了一半！",
        "把外面的煩惱都忘掉，現在只有你和重量。",
        "是時候升級你的身體了！",
        "別想太多，做就對了！"
    ],

    duringRest: [
        "調整呼吸，專注下一組。",
        "滑手機會冷掉，保持專注！",
        "感受心跳恢復，準備爆發。",
        "想想你為什麼開始。",
        "每一組都在積累，不要浪費。",
        "痛苦是軟弱離開身體的過程。"
    ],

    midWorkout: [
        "這就是區分強者與弱者的時候！",
        "堅持住，身體正在改變！",
        "不要停下來，你已經建立起勢頭了！",
        "現在放棄就前功盡棄了！",
        "流汗的感覺很棒，對吧？"
    ],

    nearCompletion: [
        "最後幾組！用盡全力！",
        "把最後的力量都擠出來！",
        "不要保留，這是最後的衝刺！",
        "完美的句點，堅持到底！",
        "想想完成後的成就感！"
    ],

    postWorkout: [
        "訓練結束！去補充蛋白質吧！🍗",
        "你做到了！明天的你會感謝今天的你。",
        "尊重！你戰勝了懶惰。",
        "帶著這份自信去面對生活吧！",
        "休息是為了走更長遠的路，好好睡一覺。"
    ],

    setCompletion: [
        "漂亮！",
        "標準！",
        "輕鬆！",
        "再來！",
        "穩！",
        "很棒！"
    ]
};

// Get a random celebrity quote
export const getCelebrityQuote = () => {
    const quote = CELEBRITY_QUOTES[Math.floor(Math.random() * CELEBRITY_QUOTES.length)];
    return `"${quote.quote}" - ${quote.author}`;
};

// Get exercise-specific tip (Randomly selects one from available tips)
export const getExerciseTip = (exerciseName) => {
    let tips = EXERCISE_TIPS.default;

    // Try exact match first
    if (EXERCISE_TIPS[exerciseName]) {
        tips = EXERCISE_TIPS[exerciseName];
    } else {
        // Try partial match
        for (const [key, val] of Object.entries(EXERCISE_TIPS)) {
            if (exerciseName.toLowerCase().includes(key.toLowerCase()) ||
                key.toLowerCase().includes(exerciseName.toLowerCase())) {
                tips = val;
                break;
            }
        }
    }

    // Select random tip from array
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    return `💡 技巧：${randomTip}`;
};

// Get a random message from a category
export const getMotivationalMessage = (category) => {
    const messages = MOTIVATIONAL_MESSAGES[category] || MOTIVATIONAL_MESSAGES.duringRest;
    return messages[Math.floor(Math.random() * messages.length)];
};

// Get message based on workout progress
export const getProgressMessage = (completedExercises, totalExercises) => {
    const progress = completedExercises / totalExercises;

    if (progress === 0) {
        return getMotivationalMessage('preWorkout');
    } else if (progress < 0.3) {
        return "開始得很順利！保持節奏 💪";
    } else if (progress < 0.5) {
        return getMotivationalMessage('midWorkout');
    } else if (progress < 0.8) {
        return "超過一半了！你做得很棒 🔥";
    } else if (progress < 1) {
        return getMotivationalMessage('nearCompletion');
    } else {
        return getMotivationalMessage('postWorkout');
    }
};
