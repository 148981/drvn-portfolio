/**
 * prismGlass.js — 選份量卡的「透亮玻璃」每次打開換一組顏色
 * ──────────────────────────────────────────────────────────────
 * 底是 Mist 冷灰；上面疊三團很淡的粉彩（像一疊半透明的玻璃片透過來的光），
 * 顏色、位置、角度每次打開都不同 —— 但永遠從同一組粉彩裡挑，所以不會亂。
 * 回傳 CSS 變數，給 .lg-prism（styles/liquid-glass.css）用。
 */
const PASTELS = [
    [246, 226, 150],  // 淡黃
    [249, 196, 176],  // 蜜桃
    [244, 180, 214],  // 粉紅
    [206, 186, 242],  // 淡紫
    [176, 208, 246],  // 天藍
    [168, 228, 218],  // 湖水
    [196, 234, 190],  // 薄荷
];

// 小而穩定的偽亂數：同一個 seed 得到同一組（重繪不會閃）
const rng = (seed) => {
    let t = Math.floor((seed || Math.random()) * 2 ** 31) || 1;
    return () => {
        t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
};

export function prismPalette(seed) {
    const r = rng(seed);
    // 挑三個相鄰的顏色（色環上相鄰 → 和諧），起點隨機
    const start = Math.floor(r() * PASTELS.length);
    const pick = (i) => PASTELS[(start + i * (r() > 0.5 ? 1 : 2)) % PASTELS.length];
    const [a, b, c] = [pick(0), pick(1), pick(2)];
    const rgba = (x, al) => `rgba(${x[0]},${x[1]},${x[2]},${al})`;
    const pos = () => `${Math.round(10 + r() * 80)}% ${Math.round(8 + r() * 84)}%`;
    return {
        '--pz-a': rgba(a, 0.62),
        '--pz-b': rgba(b, 0.55),
        '--pz-c': rgba(c, 0.50),
        '--pz-a-at': pos(),
        '--pz-b-at': pos(),
        '--pz-c-at': pos(),
        '--pz-rim': `${Math.round(r() * 360)}deg`,
        // 邊緣光暈用的同一組顏色，透明度低很多（微微的）
        '--pz-a-edge': rgba(a, 0.55),
        '--pz-b-edge': rgba(b, 0.50),
        '--pz-c-edge': rgba(c, 0.50),
    };
}

export default prismPalette;
