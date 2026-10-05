/**
 * ViewPicker — 選機位（模板建立頁與分析頁共用）
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼要有這個元件
 * ────────────────
 *   模板建立與分析都要選機位，而且兩邊必須**長得一樣、意思一樣**。
 *   各寫一份的話遲早會漂移（這個專案已經在 EXERCISE_INFO 上吃過三次虧）。
 *
 * 標籤怎麼寫
 * ────────
 *   舊版寫「已驗證 / 可計分」—— 那是內部語彙，使用者看不出差在哪。
 *   改成直接講這個角度**能給你什麼**：
 *
 *     正面 0°     抓得到 膝蓋內夾        ← 做過刻意犯錯的對照實驗
 *     正側面 90°  量蹲深、軀幹前傾        ← 量得到也會給分，但沒做過對照實驗
 *
 *   「抓得到」與「量」的用字差異就是驗證與否的差別，不用另外解釋。
 *
 * 模板狀態要一眼看見
 * ────────────────
 *   有沒有模板決定「能不能分析」，是最重要的一件事，不能只用一個小圓點。
 *   → 左側 3px 色條（綠＝已就緒、橘＝需建立）＋ 明確文字標籤。
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { viewsFor, VIEW_STATE } from '../lib/exerciseSpec';

const C = {
  ink: '#262523',
  paper: '#F6F4F1',
  sub: '#6E6E6E',
  faint: '#9C9C9C',
  hairline: '#DCDCDC',
  olive: '#5A7A3A',
  oliveLite: '#8FBF6A',
  orange: '#F95C4B',
};
const MONO = '"SF Mono", "JetBrains Mono", Menlo, monospace';
const EASE = [0.16, 1, 0.3, 1];

/** 這個機位能給使用者什麼 —— 用「抓得到 / 量」區分驗證與否 */
function capabilityOf(v) {
  if (v.state === VIEW_STATE.VALIDATED && v.catches?.length) {
    return { verb: '抓得到', what: v.catches.join('、') };
  }
  return { verb: '量', what: (v.measures || []).slice(0, 2).join('、') };
}

export default function ViewPicker({
  exerciseKey,
  value,              // 目前選到的 view code
  onChange,
  templates,          // 後端回的 { [view]: { exists, reps } }；null = 還在查
  requireTemplate,    // true = 分析頁（沒模板不能用）；false = 模板建立頁
}) {
  const views = viewsFor(exerciseKey);
  if (views.length < 2) return null;

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {views.map((v, i) => {
        const on = v.code === value;
        const tpl = templates?.[v.code];
        const built = !!tpl?.exists;
        const weak = tpl?.quality?.level === 'weak';
        const cap = capabilityOf(v);
        // 綠＝已就緒、琥珀＝有模板但基準偏弱、橘＝還沒建
        const bar = built ? (weak ? '#C68E5D' : C.olive) : C.orange;

        return (
          <motion.button
            key={v.code}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
            whileTap={{ scale: 0.985 }}
            onClick={() => { if (!on) onChange?.(v.code); }}
            style={{
              flex: 1, position: 'relative', overflow: 'hidden',
              padding: '12px 12px 12px 15px', borderRadius: 4,
              cursor: on ? 'default' : 'pointer', textAlign: 'left',
              transition: 'background .18s, border-color .18s',
              background: on ? C.ink : C.paper,
              border: `1px solid ${on ? C.ink : C.hairline}`,
            }}>

            {/* 左側色條 —— 有沒有模板，一眼看到 */}
            <span aria-hidden style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
              background: bar,
            }} />

            {/* 模板狀態 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: MONO, fontSize: 9, fontWeight: 800,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              color: built
                ? (weak ? '#C68E5D' : (on ? C.oliveLite : C.olive))
                : (on ? '#E8A598' : C.orange),
            }}>
              {built && !weak && <Check size={10} strokeWidth={3.4} />}
              {built ? (weak ? '基準偏弱' : '已就緒')
                     : (requireTemplate ? '需先建模板' : '尚未建立')}
            </div>

            {/* 機位名稱 */}
            <div style={{
              fontSize: 15, fontWeight: 700, marginTop: 5, letterSpacing: '-0.015em',
              color: on ? C.paper : C.ink,
            }}>{v.name}</div>

            {/* 這個角度能給你什麼 —— 取代看不懂的「已驗證 / 可計分」 */}
            <div style={{
              fontSize: 11, lineHeight: 1.45, marginTop: 4,
              color: on ? 'rgba(246,244,241,0.62)' : C.sub,
            }}>
              <span style={{
                fontWeight: 700,
                color: v.state === VIEW_STATE.VALIDATED
                  ? (on ? C.oliveLite : C.olive)
                  : (on ? 'rgba(246,244,241,0.62)' : C.faint),
              }}>{cap.verb}</span>
              {' '}{cap.what}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
