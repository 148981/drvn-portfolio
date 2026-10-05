import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { AlertTriangle, Home } from 'lucide-react';

/**
 * 全螢幕錯誤邊界 — 用於健身完成卡等「記錄完成後」的畫面。
 * 若子元件 render 崩潰，不要留白屏卡死，改顯示可離開的 fallback，
 * 並仍呼叫 onExit 讓使用者能切回主畫面。
 */
class CompletionErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('CompletionErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    background: 'linear-gradient(180deg, #0F1117 0%, #1A1D29 100%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: 32, textAlign: 'center', color: '#fff',
                }}>
                    <AlertTriangle size={40} style={{ color: '#D4AF37', marginBottom: 18 }} />
                    <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>訓練已記錄</h2>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', maxWidth: 280, margin: '0 0 28px', lineHeight: 1.6 }}>
                        你的數據已成功儲存，但完成畫面載入時發生問題。可以直接返回，紀錄不會遺失。
                    </p>
                    <motion.button {...pressProps('row')}
 onClick={() => this.props.onExit && this.props.onExit()}
 style={{
 display: 'flex', alignItems: 'center', gap: 8,
 padding: '14px 28px', borderRadius: 18, border: 'none', cursor: 'pointer',
 background: '#D4AF37', color: '#0F1117', fontSize: 14, fontWeight: 800,
 }}
 >
                        <Home size={16} /> 返回主畫面
                    </motion.button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default CompletionErrorBoundary;
