const HERO_THEMES = {
    push: {
        key: 'push',
        label: '推力 / 胸肩三頭',
        image: '/workout-heroes/push-color.png',
        base: '#171614',
        imagePosition: 'center',
        imageSize: 'cover',
        overlay: 'linear-gradient(90deg, rgba(12,11,10,0.92) 0%, rgba(12,11,10,0.54) 38%, rgba(12,11,10,0.12) 72%, rgba(12,11,10,0.28) 100%)',
    },
    pull: {
        key: 'pull',
        label: '拉力 / 背與二頭',
        image: '/workout-heroes/pull-color.png',
        base: '#102025',
        imagePosition: 'center',
        imageSize: 'cover',
        overlay: 'linear-gradient(90deg, rgba(8,18,21,0.94) 0%, rgba(8,18,21,0.58) 38%, rgba(8,18,21,0.1) 72%, rgba(8,18,21,0.3) 100%)',
    },
    lower: {
        key: 'lower',
        label: '下肢 / 腿臀後鏈',
        image: '/download/7a1f0261de4715fd78874ac0d42d55b1.jpg',
        base: '#191817',
        imagePosition: 'center 62%',
        imageSize: 'cover',
        overlay: 'linear-gradient(90deg, rgba(18,17,15,0.94) 0%, rgba(18,17,15,0.56) 42%, rgba(18,17,15,0.12) 75%, rgba(18,17,15,0.34) 100%)',
    },
    upper: {
        key: 'upper',
        label: '上半身 / 推拉綜合',
        image: '/download/Gemini_Generated_Image_ovyquxovyquxovyq.png',
        base: '#1B1B18',
        imagePosition: 'center',
        imageSize: 'cover',
        overlay: 'linear-gradient(90deg, rgba(19,19,16,0.94) 0%, rgba(19,19,16,0.62) 36%, rgba(19,19,16,0.16) 72%, rgba(19,19,16,0.38) 100%)',
    },
    fullbody: {
        key: 'fullbody',
        label: '全身 / A-B 循環',
        image: '/assets/kettlebell_woman.png',
        base: '#25342E',
        imagePosition: '78% 52%',
        imageSize: 'contain',
        overlay: 'linear-gradient(90deg, rgba(21,30,27,0.98) 0%, rgba(21,30,27,0.84) 42%, rgba(61,78,69,0.34) 74%, rgba(249,92,75,0.18) 100%)',
    },
    arms: {
        key: 'arms',
        label: '肩臂 / 二頭三頭',
        image: '/workout-heroes/push-color.png',
        base: '#241713',
        imagePosition: '76% center',
        imageSize: 'cover',
        overlay: 'linear-gradient(90deg, rgba(29,18,15,0.96) 0%, rgba(29,18,15,0.64) 42%, rgba(85,34,26,0.16) 72%, rgba(249,92,75,0.26) 100%)',
    },
    core: {
        key: 'core',
        label: '核心 / 穩定控制',
        image: '/assets/kettlebell_woman.png',
        base: '#26312C',
        imagePosition: '82% 54%',
        imageSize: 'contain',
        overlay: 'linear-gradient(90deg, rgba(24,31,28,0.98) 0%, rgba(24,31,28,0.86) 44%, rgba(70,85,76,0.36) 76%, rgba(207,198,184,0.16) 100%)',
    },
    hourglass: {
        key: 'hourglass',
        label: '沙漏 / 肩背臀',
        image: '/desktop/_ (12)拷貝3.jpeg',
        base: '#34362F',
        imagePosition: 'center',
        imageSize: 'cover',
        overlay: 'linear-gradient(90deg, rgba(31,33,28,0.95) 0%, rgba(31,33,28,0.62) 40%, rgba(31,33,28,0.14) 72%, rgba(110,72,58,0.26) 100%)',
    },
    default: {
        key: 'default',
        label: '綜合訓練',
        image: '/desktop/singin6.png',
        base: '#2D2924',
        imagePosition: 'center',
        imageSize: 'cover',
        overlay: 'linear-gradient(90deg, rgba(31,28,24,0.94) 0%, rgba(31,28,24,0.64) 42%, rgba(31,28,24,0.18) 75%, rgba(31,28,24,0.36) 100%)',
    },
};

export const getWorkoutHeroTheme = (focus = '') => {
    const text = String(focus).toLowerCase();
    const hasFullBody = /全身|full[\s-]?body|\bfb[-\s]?[abc]\b/.test(text);
    const hasUpper = /上半身|\bupper\b|胸背|推拉同日|push[\s-]?pull/.test(text);
    const hasLower = /下肢|下半身|腿|臀|股四頭|四頭|後鏈|glute|leg|quad|hamstring|lower/.test(text);
    const hasPush = /推力|\bpush\b|胸|chest/.test(text);
    const hasPull = /拉力|\bpull\b|背|back/.test(text);
    const hasShoulders = /肩|shoulder|delt/.test(text);
    const hasArms = /手臂|肩臂|二頭|三頭|臂|biceps|triceps|\barms?\b/.test(text);
    const hasCore = /核心|腹|core|abs/.test(text);
    const hasGlutes = /臀|蜜桃|glute/.test(text);

    if (/沙漏|hourglass/.test(text) || (hasShoulders && hasPull && hasGlutes && !hasPush)) return HERO_THEMES.hourglass;
    if (hasFullBody) return HERO_THEMES.fullbody;
    if (hasUpper || (hasPush && hasPull) || (hasPull && hasShoulders && hasArms && !hasLower)) return HERO_THEMES.upper;
    if (hasLower) return HERO_THEMES.lower;
    if (hasCore && hasShoulders && !hasPush && !hasPull) return HERO_THEMES.core;
    if (hasCore && !hasPush && !hasPull && !hasShoulders && !hasArms) return HERO_THEMES.core;
    if (hasArms && !hasPush && !hasPull) return HERO_THEMES.arms;
    if (hasPull) return HERO_THEMES.pull;
    if (hasPush || hasShoulders) return HERO_THEMES.push;
    if (hasArms) return HERO_THEMES.arms;
    if (hasCore) return HERO_THEMES.core;
    return HERO_THEMES.default;
};

export const WORKOUT_HERO_PREVIEW_CASES = [
    '推力強化 (胸·肩·三頭)',
    '胸大肌結構 (胸·三頭)',
    '推力結構 (胸·肩·核心)',
    '拉力強化 (背·二頭)',
    '背肌結構 (背·二頭)',
    '下肢結構 (腿·臀)',
    '股四頭專項 (腿前·腿後)',
    '臀與後鏈雕塑 (臀·腿後)',
    '上半身結構 (胸·背·肩·臂)',
    '上半身 A (推 — 胸·肩·三頭)',
    '上半身 B (拉 — 背·二頭·後肩)',
    '胸背拮抗 (推拉同日)',
    '全身結構 A (推·股四頭)',
    '全身結構 B (拉·後鏈)',
    '全身結構 C (綜合)',
    '全身沙漏型強化 (肩·背·臀)',
    '肩臂雕塑 (肩·二頭·三頭)',
    '手臂維度 (二頭·三頭)',
    '肩部立體 (肩·二頭·三頭)',
    '核心結構 (腹)',
    '沙漏型強化 (肩·臀)',
    '上半身輪廓 (背·肩)',
    '下肢後鏈 (臀·核心)',
    '後鏈與蜜桃臀 (背·臀)',
    '肩頸線條與核心 (肩·腹)',
    '前側主導 (股四頭·核心)',
    '後鏈主導 (臀大肌·腿後·核心)',
    '下半身與核心 (腿·臀·腹)',
    '上半身專項 (胸·肩·背·臂)',
    '下半身專項 (腿前·臀/腿後·腹)',
    '針對性特訓 (胸·肩·臂)',
    '背·肩·臂',
    '臀腿後鏈特訓',
];

export const WORKOUT_HERO_THEMES = HERO_THEMES;
