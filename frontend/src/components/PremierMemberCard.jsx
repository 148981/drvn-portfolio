/**
 * PremierMemberCard — 設定頁最上面的會員專屬卡（只給訂閱者與永久會員）
 * ─────────────────────────────────────────────────────────────
 * 材質：深色拉絲鈦金屬（final-drvn-design-system §4.2 .ti-brushed-dark 同一張照片）
 * 字：PREMIER（金）／ DRVNNER（銀）兩行 Tenor Sans，金屬漸層字
 * 特效：進場字距收攏、由模糊變清楚 → 字面金屬流光（每 5 秒一次）→ 整張卡斜光掃過 → 右上角暖金氛圍燈呼吸
 *       系統「減少動態效果」開著時全部停在靜止畫面。
 * 點下去 → 會員方案頁（MembershipPlanSheet）。
 * 字級只用這頁原有的三種：28（同「設定」標題）／ 12 ／ 11。
 */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { openPlanSheet, planSummary, useMembership } from '../utils/membership';
import './MembershipCardMaterial.css';

const GOLD = '#D4C5A5';
const PAPER = '#F6F4F1';

const CSS = `
@keyframes drvnPremierShine { 0% { background-position: 160% 0; } 55%, 100% { background-position: -60% 0; } }
@keyframes drvnPremierSweep { 0% { transform: translateX(-130%) skewX(-18deg); } 45%, 100% { transform: translateX(260%) skewX(-18deg); } }
@keyframes drvnPremierGlow { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: .9; transform: scale(1.08); } }
.drvn-premier-word {
  display: inline-block; font-family: var(--font-display, 'Tenor Sans', sans-serif);
  font-size: 28px; line-height: 1.05; letter-spacing: .16em;
  background-size: 250% 100%; background-position: 160% 0;
  -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;
}
.drvn-premier-word.gold { background-image: linear-gradient(100deg, #8B7F72 0%, #C68E5D 30%, #FFF3D6 46%, #D4C5A5 54%, #8B7F72 100%); }
.drvn-premier-word.silver { background-image: linear-gradient(100deg, #9A968F 0%, #D9D6D0 30%, #FFFFFF 46%, #CFC6B8 56%, #8D8984 100%); }
.drvn-premier-live .drvn-premier-word { animation: drvnPremierShine 5s cubic-bezier(0.16,1,0.3,1) 1s infinite; }
.drvn-premier-live .drvn-premier-word.silver { animation-delay: 1.15s; }
.drvn-premier-sweep { position: absolute; top: -20%; bottom: -20%; width: 38%; pointer-events: none; mix-blend-mode: screen;
  background: linear-gradient(90deg, transparent, rgba(255,243,214,.16), transparent); transform: translateX(-130%) skewX(-18deg); }
.drvn-premier-live .drvn-premier-sweep { animation: drvnPremierSweep 6s cubic-bezier(0.16,1,0.3,1) .6s infinite; }
.drvn-premier-glow { position: absolute; right: -40px; top: -60px; width: 220px; height: 220px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(circle, rgba(212,197,165,.30) 0%, rgba(198,142,93,.10) 45%, transparent 70%); filter: blur(8px); opacity: .7; }
.drvn-premier-live .drvn-premier-glow { animation: drvnPremierGlow 6s ease-in-out infinite; }
`;

/** 一行字：進場是「字距收攏＋去模糊」（tracking-in），之後金屬流光由 CSS 接手 */
function Word({ text, tone, delay, still }) {
    return (
        <span style={{ display: 'block' }}>
        <motion.span
            className={`drvn-premier-word ${tone}`}
            initial={still ? false : { opacity: 0, letterSpacing: '0.5em', filter: 'blur(6px)' }}
            animate={{ opacity: 1, letterSpacing: '0.16em', filter: 'blur(0px)' }}
            transition={{ duration: 0.9, ease: RISE_EASE, delay }}
        >
            {text}
        </motion.span>
        </span>
    );
}

export default function PremierMemberCard({ premier = true }) {
    const { info } = useMembership();
    const still = useReducedMotion();
    const { name, line } = planSummary(info);

    return (
        <>
            <style>{CSS}</style>
            <motion.button
                {...pressProps('card')}
                onClick={() => { haptic('light'); openPlanSheet(); }}
                aria-label={premier ? `PREMIER DRVNNER，${name}，查看方案` : '一般會員，查看會員方案'}
                initial={still ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: RISE_EASE }}
                className={`drvn-membership-card ${premier ? 'is-premier' : 'is-standard'}${!still && premier ? ' drvn-premier-live' : ''}`}
                style={{
                    position: 'relative', overflow: 'hidden', isolation: 'isolate',
                    width: '100%', minHeight: 148, borderRadius: 24, padding: 20, textAlign: 'left',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18,
                    color: PAPER,
                }}
            >
                {premier && <span className="drvn-premier-sweep" aria-hidden />}
                <span className="drvn-membership-rim" aria-hidden="true" />

                <span style={{ position: 'relative', zIndex: 1 }}>
                    {premier && <Word text="PREMIER" tone="gold" delay={0.1} still={still} />}
                    <Word text="DRVNNER" tone="silver" delay={0.3} still={still} />
                </span>

                <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: premier ? GOLD : PAPER }}>{premier ? name : '一般會員'}</span>
                        {premier && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'rgba(246,244,241,0.76)', marginTop: 2 }}>{line}</span>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: 'rgba(246,244,241,0.66)', flexShrink: 0 }}>
                        方案<ChevronRight size={14} />
                    </span>
                </span>
            </motion.button>
        </>
    );
}
