/**
 * DRVN 統一 Toast / Confirm 系統
 * ------------------------------------------------------------------
 * 取代散落各處的原生 alert() / confirm()，提供 Liquid Glass 風格、
 * 與 App 設計語言一致的回饋。可在任何地方以指令式 API 呼叫，
 * 不需要包 Provider — 第一次呼叫時會自動掛載一個 root。
 *
 * 用法：
 *   import { toast } from '../utils/toast';
 *   toast.success('已儲存');
 *   toast.error('儲存失敗，請稍後再試');
 *   toast.info('正在計算…');
 *
 *   import { confirmDialog } from '../utils/toast';
 *   const ok = await confirmDialog('確定要刪除這筆紀錄嗎？', { confirmText: '刪除', danger: true });
 *   if (ok) { ... }
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';

// ── DRVN palette（與 design-tokens.css 對齊）──
const C = {
  ink: '#161415',
  coral: '#F95C4B',
  ember: '#D94030',
  paper: '#F6F4F1',
  cream: '#E0D8D3',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#D94030',   // = ember；原本是 Tailwind 的 #EF4444，不在 DRVN 色票裡
};

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '!',
};

const ACCENT = {
  success: C.success,
  error: C.error,
  info: C.coral,
  warning: C.warning,
};

// ───────────────────────────────────────────────────────────────
// 內部事件匯流排（toast controller 訂閱）
// ───────────────────────────────────────────────────────────────
let _emit = null;
const _queue = [];

function dispatch(action) {
  if (_emit) _emit(action);
  else _queue.push(action); // controller 尚未掛載 → 暫存
}

// ───────────────────────────────────────────────────────────────
// Toast 單筆
// ───────────────────────────────────────────────────────────────
function ToastItem({ t, onClose }) {
  const accent = ACCENT[t.type] || C.coral;
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (t.duration === Infinity) return;
    const timer = setTimeout(() => setLeaving(true), t.duration);
    return () => clearTimeout(timer);
  }, [t.duration]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onClose(t.id), 260);
    return () => clearTimeout(timer);
  }, [leaving, onClose, t.id]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => setLeaving(true)}
      style={{
        pointerEvents: 'auto',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minWidth: 220,
        maxWidth: 'min(90vw, 420px)',
        padding: '14px 18px',
        marginTop: 10,
        borderRadius: 18,
        // Liquid Glass material
        background: 'linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.7) 100%)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: `0 10px 30px rgba(0,0,0,0.18), inset 0 1px 2px rgba(255,255,255,0.9)`,
        color: C.ink,
        transform: leaving ? 'translateY(-8px) scale(0.96)' : 'translateY(0) scale(1)',
        opacity: leaving ? 0 : 1,
        transition: 'all 0.26s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: 99,
          background: accent,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          fontWeight: 900,
          boxShadow: `0 0 10px ${accent}66`,
        }}
      >
        {ICONS[t.type] || ICONS.info}
      </div>
      <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'pre-line' }}>
        {t.message}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Confirm Modal
// ───────────────────────────────────────────────────────────────
function ConfirmModal({ c, onResolve }) {
  const [leaving, setLeaving] = useState(false);

  const close = useCallback(
    (result) => {
      setLeaving(true);
      setTimeout(() => onResolve(c.id, result), 200);
    },
    [c.id, onResolve]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <div
      onClick={() => close(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'rgba(22,20,21,0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 0.2s ease',
        pointerEvents: 'auto',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 28,
          padding: 26,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(246,244,241,0.88) 100%)',
          backdropFilter: 'blur(30px) saturate(160%)',
          WebkitBackdropFilter: 'blur(30px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.7)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.28), inset 0 1px 2px rgba(255,255,255,0.95)',
          transform: leaving ? 'scale(0.95)' : 'scale(1)',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          color: C.ink,
        }}
      >
        {c.title && (
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 900, letterSpacing: '-0.01em' }}>
            {c.title}
          </h3>
        )}
        <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: 'rgba(22,20,21,0.78)', whiteSpace: 'pre-line' }}>
          {c.message}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <motion.button {...pressProps('row')}
 onClick={() => close(false)}
 style={{
 flex: 1,
 padding: '12px 16px',
 borderRadius: 12,
 border: '1px solid rgba(22,20,21,0.12)',
 background: 'rgba(255,255,255,0.6)',
 color: 'rgba(22,20,21,0.65)',
 fontSize: 14,
 fontWeight: 700,
 cursor: 'pointer',
 }}
 >
            {c.cancelText || '取消'}
          </motion.button>
          <motion.button {...pressProps('row')}
 onClick={() => close(true)}
 style={{
 flex: 1,
 padding: '12px 16px',
 borderRadius: 12,
 border: 'none',
 background: c.danger
 ? `linear-gradient(135deg, ${C.ember} 0%, #B8321F 100%)`
 : `linear-gradient(135deg, ${C.coral} 0%, ${C.ember} 100%)`,
 color: '#fff',
 fontSize: 14,
 fontWeight: 800,
 cursor: 'pointer',
 boxShadow: c.danger
 ? '0 6px 18px rgba(217,64,48,0.4)'
 : '0 6px 18px rgba(249,92,75,0.45)',
 }}
 >
            {c.confirmText || '確定'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Controller — 掛載一次，管理所有 toast / confirm
// ───────────────────────────────────────────────────────────────
function ToastController() {
  const [toasts, setToasts] = useState([]);
  const [confirms, setConfirms] = useState([]);

  useEffect(() => {
    _emit = (action) => {
      if (action.kind === 'toast') {
        setToasts((prev) => [...prev, action.payload]);
      } else if (action.kind === 'confirm') {
        setConfirms((prev) => [...prev, action.payload]);
      }
    };
    // flush 任何在掛載前排隊的訊息
    while (_queue.length) _emit(_queue.shift());
    return () => {
      _emit = null;
    };
  }, []);

  const closeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const resolveConfirm = useCallback((id, result) => {
    setConfirms((prev) => {
      const found = prev.find((c) => c.id === id);
      if (found && found._resolve) found._resolve(result);
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  return createPortal(
    <>
      {/* Toast stack — 頂部置中 */}
      <div
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          left: 0,
          right: 0,
          zIndex: 2147483500,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onClose={closeToast} />
        ))}
      </div>
      {/* Confirm modals */}
      {confirms.map((c) => (
        <ConfirmModal key={c.id} c={c} onResolve={resolveConfirm} />
      ))}
    </>,
    document.body
  );
}

// ───────────────────────────────────────────────────────────────
// 自動掛載 root（瀏覽器環境）
// ───────────────────────────────────────────────────────────────
let _mounted = false;
function ensureMounted() {
  if (_mounted || typeof document === 'undefined') return;
  _mounted = true;
  const el = document.createElement('div');
  el.id = 'drvn-toast-root';
  document.body.appendChild(el);
  createRoot(el).render(<ToastController />);
}

let _id = 0;
function show(type, message, duration = 3200) {
  ensureMounted();
  const payload = { id: ++_id, type, message: String(message ?? ''), duration };
  dispatch({ kind: 'toast', payload });
  return payload.id;
}

export const toast = {
  success: (msg, duration) => show('success', msg, duration),
  error: (msg, duration) => show('error', msg, duration ?? 4200),
  info: (msg, duration) => show('info', msg, duration),
  warning: (msg, duration) => show('warning', msg, duration),
  show,
};

/**
 * 取代 window.confirm — 回傳 Promise<boolean>
 */
export function confirmDialog(message, opts = {}) {
  ensureMounted();
  return new Promise((resolve) => {
    const payload = {
      id: ++_id,
      message: String(message ?? ''),
      title: opts.title,
      confirmText: opts.confirmText,
      cancelText: opts.cancelText,
      danger: !!opts.danger,
      _resolve: resolve,
    };
    dispatch({ kind: 'confirm', payload });
  });
}

export default toast;
