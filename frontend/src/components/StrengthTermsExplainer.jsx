import React from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════════════
// StrengthTermsExplainer — 重訓系統的「？」說明
//
// 為什麼會有這支（2026-08 UI 稽核）：
//   跑步系統有 EffortExplanationModal（結構好：分級顏色 / 怎麼算 / 進度條意義），
//   營養系統有 HelpCircle 彈窗機制，
//   但重訓系統對 HelpTip / InfoTooltip / Tooltip / HelpCircle / FirstTimeHint
//   全域搜尋是 **0 筆** —— 整個系統沒有任何「？」基礎設施。
//
//   偏偏重訓才是術語最重的一塊：訓練進行中的畫面會同時出現
//   1RM、RPE、LOAD、耗力分數、訓練分區，全都沒有就地解釋。
//   使用者只能靠猜，或者乾脆忽略這些數字 —— 那這些數字就白算了。
//
// 內容原則：
//   · 複雜規則一律列點，不寫成一大段
//   · 先講「這對我有什麼用」，再講「怎麼算出來的」
//   · 誠實標示估算：是推估就說是推估，不假裝精準
// ══════════════════════════════════════════════════════════════════════════

const INK = '#161415';
const CORAL = '#F95C4B';

const SECTIONS = [
    {
        key: '1rm',
        term: '1RM',
        zh: '單次最大重量',
        bullets: [
            '你這個動作「拚盡全力只能做 1 下」的重量。',
            '我們不會叫你真的去試 —— 那很危險。這個數字是從你平常做的重量與次數推估出來的。',
            '沒有歷史紀錄時，會先用你這一組的重量與次數反推，之後練得越多就越準。',
            '所以它是**估計值**，用來抓訓練強度的方向，不是你的實測成績。',
        ],
    },
    {
        key: 'zone',
        term: '訓練分區',
        zh: '最大肌力 / 肌肥大 / 肌耐力',
        bullets: [
            '同樣一個動作，用不同重量練，長出來的東西不一樣。',
            '**最大肌力**（約 85% 以上）：練「更用力」的能力，次數少、休息長。',
            '**肌肥大**（約 65–85%）：練「更大塊」，這是多數人增肌的區間。',
            '**肌耐力**（約 65% 以下）：練「撐更久」，次數多、重量輕。',
            '畫面上的百分比是相對於你的推估 1RM，超出區間不代表做錯，只是效果會偏向另一邊。',
        ],
    },
    {
        key: 'rpe',
        term: 'RPE',
        zh: '自覺費力程度',
        bullets: [
            '做完這一組，你自己覺得有多累 —— 1 是幾乎沒感覺，10 是再多一下都做不動。',
            '常用的抓法：**RPE 8 ≈ 還能再做 2 下**、RPE 9 ≈ 還能再做 1 下、RPE 10 ≈ 力竭。',
            '這是主觀的，但正因為主觀才有價值：它反映的是你「今天」的狀態，睡不好、壓力大都會誠實反映出來。',
            '課表寫「目標 RPE 8」的意思是：重量調到讓你做完剛好還剩 2 下的程度。',
        ],
    },
    {
        key: 'load',
        term: '耗力分數 / LOAD',
        zh: '這一組有多硬',
        bullets: [
            '把「重量相對你的水準有多重」和「你回報的 RPE」合起來算成一個分數。',
            '用途是讓你一眼看出這一組是熱身、是主課、還是已經在邊緣。',
            '它不是卡路里，也不是訓練量 —— 那兩個是另外算的。',
            '分數本身沒有好壞，只有適不適合今天的目標。',
        ],
    },
    {
        key: 'volume',
        term: '訓練量',
        zh: '總共推了多少',
        bullets: [
            '算法很單純：每一組的 **重量 × 次數**，全部加起來。',
            '單位是公斤（kg），所以數字通常很大 —— 幾千公斤是正常的。',
            '它衡量的是「總工作量」，不是強度：輕重量做很多下，訓練量也可以很高。',
            '看趨勢比看單日有意義：同樣的課表，訓練量慢慢往上就是在進步。',
        ],
    },
];

/**
 * @param {boolean}  isOpen
 * @param {Function} onClose
 * @param {string}   [focusKey]  只想看某一段時傳入（'1rm' | 'zone' | 'rpe' | 'load' | 'volume'）
 */
export default function StrengthTermsExplainer({ isOpen, onClose, focusKey = null }) {
    const sections = focusKey ? SECTIONS.filter((s) => s.key === focusKey) : SECTIONS;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 100250,
                        background: 'rgba(22,20,21,0.55)',
                        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                    }}
                >
                    <motion.div
                        onClick={(e) => e.stopPropagation()}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 34, stiffness: 320 }}
                        style={{
                            width: '100%', maxWidth: 430, maxHeight: '88dvh',
                            display: 'flex', flexDirection: 'column',
                            background: '#F6F4F1', borderRadius: '28px 28px 0 0',
                        }}
                    >
                        <div style={{
                            flexShrink: 0, padding: '22px 24px 14px',
                            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                            borderBottom: '1px solid rgba(22,20,21,0.08)',
                        }}>
                            <div>
                                <p style={{
                                    margin: 0, fontSize: 9, fontWeight: 900, letterSpacing: '0.26em',
                                    textTransform: 'uppercase', color: CORAL,
                                }}>
                                    What these mean
                                </p>
                                <h3 style={{
                                    margin: '8px 0 0', fontSize: 22, fontWeight: 500,
                                    letterSpacing: '-0.02em', color: INK,
                                }}>
                                    畫面上那些數字
                                </h3>
                            </div>
                            <motion.button {...pressProps('row')}
 type="button"
 aria-label="關閉"
 onClick={onClose}
 style={{
 width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
 border: 'none', cursor: 'pointer',
 background: 'rgba(22,20,21,0.06)', color: INK,
 display: 'flex', alignItems: 'center', justifyContent: 'center',
 }}
 >
                                <X size={17} strokeWidth={2.2} />
                            </motion.button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px max(28px, env(safe-area-inset-bottom))' }}>
                            {sections.map((s, i) => (
                                <div key={s.key} style={{ marginTop: i === 0 ? 0 : 24 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
                                        <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{s.term}</span>
                                        <span style={{ fontSize: 11.5, color: 'rgba(22,20,21,0.45)' }}>{s.zh}</span>
                                    </div>
                                    <ul style={{
                                        margin: 0, padding: '0 0 0 16px', listStyle: 'disc',
                                        fontSize: 12.5, lineHeight: 1.75, color: 'rgba(22,20,21,0.62)',
                                    }}>
                                        {s.bullets.map((b, j) => (
                                            <li key={j} style={{ marginBottom: 4 }}>
                                                {b.split('**').map((part, k) => (
                                                    k % 2 === 1
                                                        ? <b key={k} style={{ color: INK, fontWeight: 700 }}>{part}</b>
                                                        : <React.Fragment key={k}>{part}</React.Fragment>
                                                ))}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}

                            <p style={{
                                margin: '26px 0 0', fontSize: 11, lineHeight: 1.7,
                                color: 'rgba(22,20,21,0.40)',
                            }}>
                                這些數字是拿來幫你判斷「今天練得怎麼樣」的參考，不是成績單。
                                身體的感受永遠優先於畫面上的分數。
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
