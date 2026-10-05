import React, { createContext, useContext, useState, useEffect } from 'react';
import { installI18nAutoTranslate, restoreOriginalText } from '../utils/i18nAutoTranslate';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    // 🔒 語言暫時鎖定中文（英文翻譯尚未完整）。即使 localStorage 之前存了 'en'
    //    也強制回到 'zh'，避免使用者卡在半套英文。未來開放英文時改回讀 localStorage。
    const LANGUAGE_LOCKED_ZH = true;
    const [language, setLanguageState] = useState(() => {
        if (LANGUAGE_LOCKED_ZH) {
            localStorage.setItem('app_language', 'zh');
            return 'zh';
        }
        return localStorage.getItem('app_language') || 'zh';
    });

    // 🌐 中文是 App 的原生文案，不需要、也不該跑 DOM 字串替換翻譯層
    //    （舊版在 zh 模式下會把空字串替換回「日」，造成每字之間插「日」的亂碼）。
    //    只有切到英文時才掛載自動翻譯。
    useEffect(() => {
        if (language === 'en') {
            return installI18nAutoTranslate('en');
        }
        // 中文模式：把先前被翻成英文的文字還原回原始中文
        restoreOriginalText();
        return undefined;
    }, [language]);

    // 🔁 切換語言：DOM 字串替換式翻譯難以「乾淨還原」（尤其切回中文常殘留英文，
    //    或還原不全）。最穩的做法是寫入 localStorage 後整頁重載——重載後 App 以
    //    目標語言原生啟動：中文完全不經翻譯層、英文則乾淨地重跑一次翻譯。
    const setLanguage = (next) => {
        if (next === language) return;
        localStorage.setItem('app_language', next);
        setLanguageState(next);
        if (typeof window !== 'undefined') {
            // 微延遲確保 localStorage 寫入完成再重載
            setTimeout(() => window.location.reload(), 0);
        }
    };

    // 核心翻譯工具：根據目前的語言回傳對應的字串
    const t = (zhStr, enStr) => {
        return language === 'zh' ? zhStr : enStr;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};
