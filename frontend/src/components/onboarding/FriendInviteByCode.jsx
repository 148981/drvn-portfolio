/**
 * FriendInviteByCode.jsx
 * ─────────────────────────────────────────────────────────────
 * Onboarding STEP 7 — "輸入好友碼 → 預覽 → 邀請"
 *
 * 設計：沿用 STEP 7 的 magazine cover 視覺語言（URBAN.flare / smoke /
 * silverLine + serif 大字 + 全大寫小標）。
 *
 * 流程：
 *   1. 使用者輸入「Name#1234」或「#1234」(若搭配下方提示) → 即時校驗格式
 *   2. 按下「LOOKUP」/Enter → GET /api/social/friends/lookup
 *   3. 命中 → 顯示對方卡片 + CTA (邀請 / 已邀請 / 已是好友 / 已被邀請)
 *   4. 按下「邀請」 → POST /api/social/friends/request → 成功提示
 *
 * 完全與既有 followed[] 推薦邏輯解耦，不污染 step 7 既有畫面。
 * ─────────────────────────────────────────────────────────────
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import { pressProps } from '../../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, UserPlus, Check, AlertCircle, X } from 'lucide-react';
import {
    lookupFriendByCode,
    sendFriendInvite,
    parseFriendCode,
    FRIEND_INVITE_ERRORS,
} from '../../api/socialApi';
import { hapticTap } from '../../utils/haptics';

const EASE = [0.22, 1, 0.36, 1];

/**
 * @param {object} props
 * @param {string} props.myUserId       — current user id
 * @param {object} props.colors         — { flare, smoke, silverLine, charcoal, onDark, serif, sans }
 * @param {(uid:string)=>void} [props.onInvited]  — 通知父層加入 invited list（可選）
 */
export default function FriendInviteByCode({ myUserId, colors, onInvited }) {
    const { flare, smoke, silverLine, charcoal, onDark, serif, sans } = colors;

    const [raw, setRaw] = useState('');
    const [hit, setHit] = useState(null);          // lookup 命中的 athlete
    const [phase, setPhase] = useState('idle');    // idle | looking | found | inviting | invited | error
    const [errCode, setErrCode] = useState(null);  // FORMAT / NOT_FOUND / ...
    const inputRef = useRef(null);

    /* 即時格式校驗：只有完整 Name#XXXX 才算 valid，提供按鈕 enable 信號 */
    const isWellFormed = useMemo(() => {
        try { parseFriendCode(raw); return true; }
        catch { return false; }
    }, [raw]);

    const reset = useCallback(() => {
        setHit(null); setErrCode(null); setPhase('idle');
    }, []);

    const handleLookup = useCallback(async () => {
        if (!isWellFormed || phase === 'looking') return;
        hapticTap();
        setPhase('looking'); setErrCode(null); setHit(null);
        try {
            const data = await lookupFriendByCode(raw, myUserId);
            setHit(data);
            setPhase('found');
        } catch (e) {
            setErrCode(e.message || 'NETWORK');
            setPhase('error');
        }
    }, [raw, isWellFormed, myUserId, phase]);

    const handleInvite = useCallback(async () => {
        if (!hit || phase === 'inviting') return;
        hapticTap();
        setPhase('inviting'); setErrCode(null);
        try {
            await sendFriendInvite(myUserId, hit.user_id);
            setPhase('invited');
            if (typeof onInvited === 'function') onInvited(hit.user_id);
        } catch (e) {
            setErrCode(e.message || 'NETWORK');
            setPhase('error');
        }
    }, [hit, myUserId, phase, onInvited]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleLookup(); }
    };

    /* ─── 顯示用 ─── */
    const errMsg = errCode ? FRIEND_INVITE_ERRORS[errCode] || FRIEND_INVITE_ERRORS.NETWORK : '';

    /* relation 對應到 CTA 狀態 */
    const ctaState = useMemo(() => {
        if (!hit) return null;
        if (phase === 'invited' || hit.relation === 'outgoing') return 'pending';
        if (hit.relation === 'friend') return 'friend';
        if (hit.relation === 'incoming') return 'incoming';
        return 'invite';
    }, [hit, phase]);

    return (
        <div style={{
            marginBottom: 22,
            background: 'linear-gradient(135deg, rgba(245,245,245,0.05) 0%, rgba(245,245,245,0.02) 100%)',
            border: `1px solid ${silverLine}`,
            borderRadius: 18, padding: '18px 16px 16px',
            position: 'relative', overflow: 'hidden',
        }}>
            {/* 小標 — 雜誌風 */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
            }}>
                <span style={{
                    width: 6, height: 6, background: flare, borderRadius: '50%',
                }} />
                <span style={{
                    fontSize: 12, letterSpacing: '0.24em', fontWeight: 800,
                    color: onDark(0.62), fontFamily: sans,
                }}>邀請碼加入</span>
                <span style={{ flex: 1, height: 1, background: onDark(0.08) }} />
                <span style={{
                    fontSize: 12, letterSpacing: '0.18em',
                    color: onDark(0.4), fontFamily: serif, fontStyle: 'italic',
                }}>輸入碼 / 加好友</span>
            </div>

            {/* 輸入列 + LOOKUP 按鈕 */}
            <div style={{
                display: 'flex', gap: 8, alignItems: 'stretch',
            }}>
                <div style={{
                    flex: 1, position: 'relative',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${silverLine}`,
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center',
                    paddingLeft: 12,
                }}>
                    <Search size={14} color={onDark(0.5)} style={{ flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        type="text"
                        value={raw}
                        onChange={(e) => { setRaw(e.target.value); if (phase !== 'idle') reset(); }}
                        onKeyDown={handleKeyDown}
                        placeholder="例：Iris Chen#6615"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        style={{
                            flex: 1, border: 'none', outline: 'none', background: 'transparent',
                            padding: '11px 10px', fontSize: 14, color: smoke,
                            fontFamily: sans, letterSpacing: '0.01em',
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    />
                    {raw && (
                        <motion.button {...pressProps('row')} type="button"
 onClick={() => { setRaw(''); reset(); inputRef.current?.focus(); }}
 style={{
 background: 'transparent', border: 'none',
 color: onDark(0.4), cursor: 'pointer',
 padding: '0 10px', display: 'flex', alignItems: 'center',
 }}>
                            <X size={13} />
                        </motion.button>
                    )}
                </div>

                <motion.button type="button" whileTap={{ scale: 0.95 }}
                    disabled={!isWellFormed || phase === 'looking'}
                    onClick={handleLookup}
                    style={{
                        padding: '0 16px',
                        fontSize: 9, letterSpacing: '0.22em', fontWeight: 800,
                        background: isWellFormed ? flare : 'rgba(245,245,245,0.08)',
                        color: isWellFormed ? '#fff' : onDark(0.35),
                        border: 'none', borderRadius: 12,
                        cursor: isWellFormed && phase !== 'looking' ? 'pointer' : 'not-allowed',
                        fontFamily: sans, flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 6,
                        minWidth: 78, justifyContent: 'center',
                        transition: 'background .2s',
                    }}>
                    {phase === 'looking' ? (
                        <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                            style={{
                                width: 10, height: 10, borderRadius: '50%',
                                border: '1.5px solid currentColor', borderTopColor: 'transparent',
                            }}
                        />
                    ) : 'LOOKUP'}
                </motion.button>
            </div>

            {/* 提示 / 錯誤訊息 */}
            <div style={{ minHeight: 18, marginTop: 8 }}>
                <AnimatePresence mode="wait">
                    {phase === 'error' && (
                        <motion.div key="err"
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25, ease: EASE }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                fontSize: 11, color: flare, fontFamily: serif, fontStyle: 'italic',
                            }}>
                            <AlertCircle size={12} />
                            <span>{errMsg}</span>
                        </motion.div>
                    )}
                    {phase === 'idle' && !raw && (
                        <motion.div key="hint"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                fontSize: 11, color: onDark(0.4), fontFamily: serif,
                                fontStyle: 'italic',
                            }}>
                            從朋友的個人檔複製他的 #碼貼上 — Enter 直接查
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* 命中卡片 */}
            <AnimatePresence>
                {(phase === 'found' || phase === 'inviting' || phase === 'invited') && hit && (
                    <motion.div
                        key="hit"
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        style={{
                            marginTop: 12, padding: '12px 12px',
                            background: '#1A1718',
                            border: `1px solid ${silverLine}`,
                            borderRadius: 12,
                            display: 'flex', alignItems: 'center', gap: 11,
                        }}>
                        {/* avatar */}
                        <div style={{
                            width: 44, height: 44, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${flare} 0%, #B03020 100%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, overflow: 'hidden',
                            fontFamily: serif, fontSize: 18, color: '#fff', fontWeight: 400,
                        }}>
                            {hit.avatar ? (
                                <img loading="lazy" decoding="async" src={hit.avatar} alt="" style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                }} />
                            ) : (hit.name || '?').slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontFamily: serif, fontSize: 16, color: smoke, lineHeight: 1.15,
                                letterSpacing: '-0.01em', whiteSpace: 'nowrap',
                                overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                                {hit.name}
                                <span style={{
                                    color: flare, fontStyle: 'italic',
                                    fontVariantNumeric: 'tabular-nums', marginLeft: 2,
                                }}>#{hit.discriminator}</span>
                            </div>
                            <div style={{
                                fontSize: 11, color: onDark(0.5), marginTop: 2,
                                fontFamily: sans, letterSpacing: '0.06em',
                            }}>
                                {hit.tag || 'DRVN ATHLETE'}
                            </div>
                        </div>
                        {/* CTA */}
                        <CtaButton
                            state={ctaState}
                            busy={phase === 'inviting'}
                            onClick={handleInvite}
                            colors={colors}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── 子按鈕：根據 relation 切換樣式 ─── */
function CtaButton({ state, busy, onClick, colors }) {
    const { flare, smoke, charcoal, onDark, sans } = colors;

    const cfgMap = {
        invite:   { label: '＋ 邀請',   solid: true,  icon: <UserPlus size={11} />, disabled: false },
        pending:  { label: '邀請已送出', solid: false, icon: <Check size={11} />,     disabled: true  },
        friend:   { label: '✓ 已是好友', solid: false, icon: null,                   disabled: true  },
        incoming: { label: '對方已邀請', solid: false, icon: null,                   disabled: true  },
    };
    const cfg = cfgMap[state] || cfgMap.invite;

    return (
        <motion.button type="button"
            whileTap={cfg.disabled ? undefined : { scale: 0.93 }}
            disabled={cfg.disabled || busy}
            onClick={onClick}
            style={{
                padding: '8px 12px',
                fontSize: 9, letterSpacing: '0.16em', fontWeight: 800,
                background: cfg.solid ? flare : 'transparent',
                color: cfg.solid ? '#fff' : (cfg.disabled ? onDark(0.5) : flare),
                border: cfg.solid ? 'none' : `1.5px solid ${cfg.disabled ? onDark(0.25) : flare}`,
                borderRadius: 999,
                cursor: cfg.disabled ? 'default' : 'pointer',
                fontFamily: sans, flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 5,
                minWidth: 86, justifyContent: 'center',
            }}>
            {busy ? (
                <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                    style={{
                        width: 10, height: 10, borderRadius: '50%',
                        border: '1.5px solid currentColor', borderTopColor: 'transparent',
                    }}
                />
            ) : (
                <>
                    {cfg.icon}
                    <span>{cfg.label}</span>
                </>
            )}
        </motion.button>
    );
}
