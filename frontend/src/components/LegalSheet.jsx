import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { LEGAL_DOCS } from '../data/legalDocs';

/**
 * LegalSheet — 法律文件全屏閱讀層（免責聲明 / 隱私政策 / 服務條款）
 * ─────────────────────────────────────────────────────────────
 * 用法：
 *   const [legalDoc, setLegalDoc] = useState(null); // 'disclaimer' | 'privacy' | 'terms' | null
 *   <LegalSheet doc={legalDoc} onClose={() => setLegalDoc(null)} />
 *
 * 以 createPortal 掛到 body，任何頁面（含登入頁、設定 modal 內）皆可直接使用。
 */
const LegalSheet = ({ doc, onClose }) => {
    if (!doc || !LEGAL_DOCS[doc]) return null;
    const { title, body } = LEGAL_DOCS[doc];

    return ReactDOM.createPortal(
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 300000,
                background: '#161415', color: '#F6F4F1',
                display: 'flex', flexDirection: 'column',
            }}
        >
            {/* Header */}
            <div style={{
                padding: '54px 24px 16px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)',
                flexShrink: 0,
            }}>
                <div>
                    <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#F95C4B', margin: '0 0 6px' }}>
                        — Legal
                    </p>
                    <h1 style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', margin: 0 }}>{title}</h1>
                </div>
                <motion.button {...pressProps('row')}
 onClick={onClose}
 aria-label="關閉"
 style={{
 width: 36, height: 36, borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)',
 background: 'rgba(255,255,255,0.08)', color: '#F6F4F1',
 display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
 }}
 >
                    <X size={18} />
                </motion.button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '20px 24px 48px' }}>
                <pre style={{
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                    fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.85, color: 'rgba(255,255,255,0.72)',
                }}>
                    {body}
                </pre>
            </div>
        </div>,
        document.body
    );
};

export default LegalSheet;
