import React from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { trackError } from '../utils/telemetry';

/**
 * RouteErrorBoundary — 路由層級的錯誤邊界。
 * 包住所有頁面，任何一頁在 render 時丟例外時只會降級成這個友善畫面，
 * 而不是讓整個 App 變成白畫面。建議用 location.pathname 當 key，
 * 讓使用者切換頁面時自動清除錯誤狀態。
 */
class RouteErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, componentStack: '' };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // 開發時把元件堆疊留在 state —— 錯誤頁要說得出「哪一個元件炸的」
        this.setState({ componentStack: String(errorInfo?.componentStack || '') });
        // 保留 console.error（terser 不會清掉），方便正式環境回報
        console.error('Route Error Boundary caught an error:', error, errorInfo);
        // 📡 上報自建 telemetry（/api/telemetry/events, type:'error'）—
        //    上市後在 /api/telemetry/dashboard 的 Errors Top 10 直接可見哪一頁在崩。
        try {
            trackError('route_crash', {
                path: window.location.pathname + window.location.hash,
                message: String(error?.message || error).slice(0, 300),
                stack: String(error?.stack || '').slice(0, 500),
                component: String(errorInfo?.componentStack || '').slice(0, 300),
            });
        } catch { /* 回報失敗不影響降級頁 */ }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null, componentStack: '' });
    };

    handleHome = () => {
        this.setState({ hasError: false, error: null, componentStack: '' });
        // 回首頁：App 用 HashRouter（main.jsx），只改 hash 即可在同一份文件內導回，
        // 不依賴 router context；舊的 '/mobile-home' 在 file:// / drvn:// 下會指到不存在的檔案
        window.location.assign('#/mobile-home');
    };

    render() {
        if (this.state.hasError) {
            // 🇨🇭 瑞士極簡錯誤頁 — Paper 底、編輯排版、hairline、單一 coral 強調
            const SWISS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, sans-serif';
            return (
                <div style={{
                    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', padding: '0 34px',
                    background: '#F6F4F1', color: '#161415', fontFamily: SWISS,
                }}>
                    {/* Issue line */}
                    <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#F95C4B', margin: '0 0 14px' }}>
                        — System Notice
                    </p>
                    {/* 大標：Swiss display */}
                    <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.02, margin: '0 0 18px', textTransform: 'uppercase' }}>
                        頁面<br />暫時迷路了
                    </h1>
                    <div style={{ height: 1, background: 'rgba(22,20,21,0.12)', marginBottom: 18 }} />
                    <p style={{ fontSize: 13, color: 'rgba(22,20,21,0.55)', maxWidth: 300, lineHeight: 1.75, margin: '0 0 34px' }}>
                        畫面載入時發生未預期的錯誤 — 你的訓練資料都在，沒有遺失。
                        重試一次，或先回首頁。
                    </p>
                    {/* 🛠 開發模式：把真正的錯誤講出來。
                        錯誤頁把訊息藏起來，等於每次崩潰都要重開 DevTools 才知道發生什麼事 ——
                        正式版維持只給友善文案，開發版直接把 message + 元件堆疊印在畫面上。 */}
                    {import.meta.env?.DEV && (
                        <div style={{
                            maxWidth: 560, marginBottom: 28, padding: '14px 16px', borderRadius: 12,
                            background: 'rgba(249,92,75,0.06)', border: '1px solid rgba(249,92,75,0.28)',
                        }}>
                            <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.22em', color: '#F95C4B', margin: '0 0 8px' }}>
                                DEV ONLY · 錯誤內容
                            </p>
                            <pre style={{
                                margin: 0, fontSize: 11.5, lineHeight: 1.6, color: '#161415',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            }}>
{String(this.state.error?.message || this.state.error || '(no message)')}
                            </pre>
                            {this.state.error?.stack && (
                                <pre style={{
                                    margin: '10px 0 0', fontSize: 10.5, lineHeight: 1.55, color: 'rgba(22,20,21,0.6)',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflow: 'auto',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}>
{String(this.state.error.stack).split('\n').slice(0, 8).join('\n')}
                                </pre>
                            )}
                            {this.state.componentStack && (
                                <pre style={{
                                    margin: '10px 0 0', fontSize: 10.5, lineHeight: 1.55, color: 'rgba(22,20,21,0.45)',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}>
{this.state.componentStack.split('\n').slice(0, 6).join('\n')}
                                </pre>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 300 }}>
                        <motion.button {...pressProps('row')} onClick={this.handleRetry} style={{
 padding: '15px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
 background: '#161415', color: '#F6F4F1', border: 'none',
 borderRadius: 999, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', cursor: 'pointer',
 }}>
                            <RefreshCw size={14} /> 重試
                        </motion.button>
                        <motion.button {...pressProps('row')} onClick={this.handleHome} style={{
 padding: '15px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
 background: 'transparent', color: '#161415', border: '1px solid rgba(22,20,21,0.2)',
 borderRadius: 999, fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', cursor: 'pointer',
 }}>
                            <Home size={14} /> 回首頁
                        </motion.button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default RouteErrorBoundary;
