import React from 'react';
import { useNavigate } from 'react-router-dom';
import { History, ArrowLeft, ArrowRight } from 'lucide-react';
import { DrvnLift as Dumbbell } from './ui/DrvnGlyphs';   // DRVN 槓鈴，取代 lucide 的啞鈴

const FontStyle = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tenor+Sans&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap');
        
        .font-tenor { font-family: 'Tenor Sans', sans-serif; }
        .font-jakarta { font-family: 'Plus Jakarta Sans', sans-serif; }
    `}</style>
);

const AnalysisChoiceMobile = () => {
    const navigate = useNavigate();

    const choices = [
        {
            id: 'multi',
            title: '多動作教練',
            subtitle: '6 個動作・跟範本比對姿勢',
            icon: Dumbbell,
            action: () => navigate('/exercise-selector-mobile'),
            gradient: 'linear-gradient(135deg, #E24837 0%, #ED5847 30%, #F46554 50%, #ED5847 70%, #C23324 100%)',
            borderColor: 'rgba(244, 101, 84, 0.25)',
            innerHighlight: 'rgba(255, 255, 255, 0.25)',
            textColor: '#F6F4F1', // Paper
            iconColor: 'rgba(246, 244, 241, 0.6)'
        },
        {
            id: 'history',
            title: '查看歷史',
            subtitle: '查看過往紀錄',
            icon: History,
            action: () => navigate('/exercise-history-mobile'),
            gradient: 'linear-gradient(135deg, #C5C3BD 0%, #D8D6CD 30%, #EBEAE6 50%, #D8D6CD 70%, #B8B5AB 100%)',
            borderColor: 'rgba(235, 234, 230, 0.35)',
            innerHighlight: 'rgba(255, 255, 255, 0.45)',
            textColor: '#161415', // Deep Black
            iconColor: 'rgba(22, 20, 21, 0.6)'
        },
        /* 「測試模式」是開發驗收用的批次工具（/pose-validation-mobile），
           不是給使用者的功能，先從畫面上拿掉。路由還在，打網址進得去。 */
    ];

    return (
        <div
            className="min-h-[100dvh] flex flex-col font-sans relative page-top-safe"
            style={{
                backgroundColor: '#161415',
                maxWidth: '430px',
                margin: '0 auto',
                backgroundImage: `url('${encodeURI('/download/workoutanalysis.png')}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
                // 🔧 移除 backgroundAttachment:'fixed' — iOS WKWebView 對 fixed+cover
                // 有知名渲染 bug（背景被放大/模糊/不顯示），預設 scroll 即正確

            }}
        >
            <FontStyle />
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-black/60 z-0 pointer-events-none" />

            {/* Header — 收斂上方留白，讓兩張主卡進入首屏 */}
            <div className="pt-10 px-8 pb-4 relative z-10 text-center">
                <h1 className="text-5xl font-normal tracking-tighter text-[#F6F4F1] mb-1.5 font-tenor">
                    分析
                </h1>
                <p className="text-[12px] font-black text-white/20 tracking-[0.4em] font-jakarta">
                    選擇你的操作
                </p>
            </div>

            {/* Choice Cards
                ⚠️ 原本是 flex-1 ＋ space-y-4：兩張卡擠在最上面，底下空掉將近四成畫面，
                   看起來像「還有東西沒載完」。改成在可用高度裡平均分佈。
                內層那個 min-h-full ＋ justify-evenly 是必要的組合：
                  · 內容不滿一屏 → 上／中／下三段留白相等
                  · 內容超過一屏（小螢幕、字放大）→ 從頂端開始正常捲動
                直接在捲動容器上寫 justify-center/evenly 會讓超出的內容被卡在上緣捲不到。 */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative z-10">
                <div className="min-h-full px-5 flex flex-col justify-evenly gap-4"
                    style={{ paddingTop: 8, paddingBottom: 'var(--nav-clearance, 96px)' }}>
                {choices.map((choice) => {
                    const Icon = choice.icon;
                    return (
                        <div
                            key={choice.id}
                            data-onboard={choice.id === 'multi' ? 'analysis-multi-coach' : `analysis-${choice.id}`}
                            onClick={choice.action}
                            className={`${choice.compact ? 'p-6 rounded-[26px]' : 'p-9 rounded-[34px]'} cursor-pointer transition-all active:scale-[0.98] relative overflow-hidden group shadow-2xl`}
                            style={{
                                background: choice.gradient,
                                border: `1px solid ${choice.borderColor}`,
                                boxShadow: `inset 0 1.5px 0 ${choice.innerHighlight}, 0 20px 40px rgba(0, 0, 0, 0.3)`
                            }}
                        >
                            {/* Brushed Aluminum Texture Overlay */}
                            <div 
                                className="absolute inset-0 pointer-events-none mix-blend-overlay"
                                style={{
                                    backgroundImage: 'url("https://www.transparenttextures.com/patterns/brushed-alum.png")',
                                    opacity: choice.id === 'multi' ? 0.12 : 0.15,
                                }}
                            />

                            {/* Radial Specular Highlight for realistic metallic gloss */}
                            <div 
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                    background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%)',
                                    mixBlendMode: 'overlay'
                                }}
                            />

                            <div className="relative z-10 flex justify-between items-center">
                                <div>
                                    <div className={`w-8 h-8 rounded-full ${choice.compact ? 'mb-3' : 'mb-7'} flex items-center justify-center`} style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}>
                                        <Icon size={18} color={choice.iconColor || choice.textColor} />
                                    </div>
                                    <h3 className={`${choice.compact ? 'text-xl mb-1.5' : 'text-3xl mb-3'} font-normal leading-none font-tenor tracking-tighter`} style={{ color: choice.textColor }}>
                                        {choice.title}
                                    </h3>
                                    <p className="text-[11px] font-black tracking-[0.22em] opacity-40 font-jakarta" style={{ color: choice.textColor }}>
                                        {choice.subtitle}
                                    </p>
                                </div>

                                <div className={`${choice.compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm group-hover:bg-white group-hover:scale-110 transition-all duration-500`}>
                                    <ArrowRight size={choice.compact ? 17 : 20} color={choice.textColor} className="group-hover:text-black transition-colors" />
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* 這一行原本是英文，而且在教使用者「歷史在哪裡」——
                    上面那張「查看歷史」卡自己就講完了，整段刪掉。 */}
                </div>
            </div>
        </div>
    );
};

export default AnalysisChoiceMobile;
