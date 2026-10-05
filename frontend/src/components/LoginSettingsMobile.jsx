import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Power, Save, RefreshCw } from 'lucide-react';
import MobileNavigation from './MobileNavigation';
import { getUserId } from '../utils/auth';
import { toast } from '../utils/toast';
import { syncUserScope } from '../utils/userScopedStorage';
import { getMembershipPreview, setMembershipPreview } from '../utils/membership';


const LoginSettingsMobile = () => {
    const navigate = useNavigate();
    const [currentUserId, setCurrentUserId] = useState('');
    const [isDemoMode, setIsDemoMode] = useState(false);
    const [memberPreview, setMemberPreview] = useState(getMembershipPreview());
    const pickPreview = (mode) => { setMembershipPreview(mode); setMemberPreview(mode); };

    useEffect(() => {
        // Load initial state
        const storedId = getUserId();
        const storedDemo = localStorage.getItem('IS_DEMO_MODE_OVERRIDE'); // We might use this later or just rely on manual ID

        setCurrentUserId(storedId);
    }, []);

    const handleSave = () => {
        if (!currentUserId.trim()) {
            toast.error('請輸入 User ID');
            return;
        }
        localStorage.setItem('userId', currentUserId.trim());
        syncUserScope();   // 🩹 帳號隔離

        // Reload to apply changes across the entire app
        window.location.reload();
    };

    const handleResetDemo = () => {
        localStorage.setItem('userId', getUserId());
        syncUserScope();   // 🩹 帳號隔離
        window.location.reload();
    };

    return (
        <div className="min-h-[100dvh] font-sans bg-[#161415] text-[#F6F4F1] pb-4 overflow-x-hidden page-top-safe" style={{ maxWidth: '430px', margin: '0 auto' }}>
            {/* Header */}
            <div className="pt-12 px-6 pb-6 bg-[#161415]">
                <div className="flex items-center gap-4 mb-2">
                    <motion.button {...pressProps('pill')} onClick={() => navigate(-1)} className="bg-white/10 p-2 rounded-full">
                        <ArrowLeft size={20} />
                    </motion.button>
                    <h1 className="text-3xl text-white leading-none uppercase" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}>
                        Settings
                    </h1>
                </div>
            </div>

            <div className="px-5 space-y-6">

                {/* 1. Account Switcher Card */}
                <div className="rounded-[28px] p-6 border border-white/[0.07]" style={{ background: 'linear-gradient(165deg, #2A2724 0%, #161415 62%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)' }}>
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-white font-sans">Account</h3>
                            <p className="text-[9px] text-white/40 font-black mt-1 uppercase tracking-[0.22em]">Switch User Identity</p>
                        </div>
                        <User className="text-[#F95C4B]" size={24} />
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-white/40 uppercase tracking-wider block mb-2">Current User ID</label>
                            <input
                                type="text"
                                value={currentUserId}
                                onChange={(e) => setCurrentUserId(e.target.value)}
                                className="w-full bg-black/30 text-white placeholder-white/20 px-4 py-4 rounded-[18px] border border-white/10 focus:border-[#F95C4B]/50 focus:ring-1 focus:ring-[#F95C4B]/50 text-lg font-mono outline-none transition-all"
                            />
                        </div>

                        <motion.button {...pressProps('pill')}
 onClick={handleSave}
 className="w-full bg-[#F95C4B] text-white font-bold py-4 rounded-[18px] flex items-center justify-center gap-2"
 >
                            <RefreshCw size={18} strokeWidth={2.5} />
                            Switch & Reload
                        </motion.button>
                    </div>
                </div>

                {/* 開發用：預覽免費版／會員版（只影響這台裝置的畫面，不改伺服器上的會員資料） */}
                <div className="rounded-[28px] p-6 border border-white/[0.07]" style={{ background: 'linear-gradient(165deg, #2A2724 0%, #161415 62%)' }}>
                    <h3 className="text-xl font-bold text-white">預覽會員畫面</h3>
                    <p className="text-[12px] text-white/40 mt-1 mb-4">只影響這台裝置，不改伺服器資料</p>
                    <div className="flex bg-black/40 rounded-full p-1 border border-white/10">
                        {[['', '依伺服器'], ['free', '免費版'], ['member', '會員版']].map(([mode, label]) => (
                            <motion.button key={label} {...pressProps('pill')} onClick={() => pickPreview(mode || null)}
                                className={`flex-1 py-2 rounded-full text-[13px] font-bold ${(memberPreview || '') === mode ? 'bg-[#F95C4B] text-white' : 'text-white/55'}`}>
                                {label}
                            </motion.button>
                        ))}
                    </div>
                </div>

                {/* 2. Reset / Demo Zone */}
                <div className="rounded-[28px] p-6 border border-white/[0.07]" style={{ background: 'linear-gradient(165deg, #2A2724 0%, #161415 62%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)' }}>
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-white font-sans">Emergency</h3>
                            <p className="text-[9px] text-white/40 font-black mt-1 uppercase tracking-[0.22em]">Reset to Safe State</p>
                        </div>
                        <Power className="text-[#D94030]" size={24} />
                    </div>

                    <p className="text-sm text-white/60 mb-6 leading-relaxed">
                        If data is not loading or features are broken, reset to the default <b>Demo / Guest User</b>.
                    </p>

                    <motion.button {...pressProps('pill')}
 onClick={handleResetDemo}
 className="w-full bg-[#D94030]/10 text-[#D94030] border border-[#D94030]/20 font-bold py-4 rounded-[18px] flex items-center justify-center gap-2 hover:bg-[#D94030]/20"
 >
                        <Power size={18} strokeWidth={2.5} />
                        Reset to Demo User
                    </motion.button>
                </div>

            </div>

            <MobileNavigation />
        </div>
    );
};

export default LoginSettingsMobile;
