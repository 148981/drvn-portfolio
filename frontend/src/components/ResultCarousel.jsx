import React from 'react';
import { motion } from 'framer-motion';

const HighlightCard = ({ item }) => {
  const isBest = item.type === 'best';
  
  return (
    <div className="flex-none w-screen h-full flex items-center justify-center snap-center px-5 py-10">
      <div className="w-full h-full max-h-[75dvh] bg-[#1E1E1E] rounded-[24px] p-6 flex flex-col relative overflow-hidden shadow-2xl border border-white/5">
        <h2 className="text-white text-2xl font-bold">{item.title}</h2>
        <p className="text-[#A0A0A0] text-lg mt-2">分數: {item.score?.toFixed(0) || 0}</p>
        
        {/* 如果是最差動作，顯示專屬的紅色警告與教練提示 */}
        {!isBest && (
          <div className="mt-4 p-4 bg-[#FF453A]/20 rounded-[18px] border border-[#FF453A]/30">
            <p className="text-[#FF453A] text-sm font-bold mb-1">⚠️ 弱項分析: {item.weak_point}</p>
            <p className="text-[#FF453A] text-sm leading-relaxed">{item.coach_tip}</p>
          </div>
        )}

        {/* 這裡未來放入影片播放器與透明 Canvas 疊加 landmarks */}
        <div className="flex-1 bg-black rounded-[18px] mt-5 flex items-center justify-center border border-white/10">
           <span className="text-white/50 text-sm font-medium">AR 骨架回放區塊</span>
        </div>
      </div>
    </div>
  );
};

export default function ResultCarousel({ highlightsData, onRetry }) {
  if (!highlightsData || highlightsData.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-[#161415] z-50 flex flex-col">
      {/* 橫向滑動容器 */}
      <div className="flex-1 w-full overflow-x-auto flex snap-x snap-mandatory hide-scrollbar">
        {highlightsData.map((item, idx) => (
          <HighlightCard key={item.type || idx} item={item} />
        ))}
      </div>
      
      {/* 底部放一個重新測試的按鈕 */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center pb-safe">
        <motion.button 
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          className="bg-[#F95C4B] px-8 py-3.5 rounded-full shadow-lg shadow-[#F95C4B]/20 border border-[#F95C4B]/50"
        >
          <span className="text-white font-bold text-sm tracking-wide">重新測試</span>
        </motion.button>
      </div>
      
      {/* 隱藏原生滾動條的樣式 */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
