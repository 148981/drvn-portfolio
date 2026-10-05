import React from 'react';
import { Upload, Trophy, User, Camera } from 'lucide-react';

export const ExpertUploadCard = ({ onUpload }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-slide-up text-center">
        <div className="w-20 h-20 bg-glass-beige/10 text-glass-beige rounded-full flex items-center justify-center mb-6 ring-2 ring-glass-beige/20">
            <Trophy size={36} strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-semibold text-white mb-2">Golden Template</h2>
        <p className="text-glass-muted max-w-sm mb-10 text-sm leading-relaxed">
            Upload perfect form videos to create your reference model
        </p>

        <label className="group cursor-pointer relative w-full max-w-md">
            <input type="file" className="hidden" onChange={onUpload} accept="video/*" multiple />
            <div className="glass-card-light px-8 py-12 flex flex-col items-center gap-4 transition-all duration-300 group-hover:bg-glass-lightgray/30 group-hover:scale-[1.02] group-hover:shadow-2xl">
                <div className="p-4 bg-glass-beige/20 text-glass-beige rounded-[18px] group-hover:bg-glass-beige group-hover:text-glass-dark transition-all duration-300 shadow-lg">
                    <Upload size={24} strokeWidth={2} />
                </div>
                <span className="font-medium text-base text-white/90">Select Expert Files</span>
            </div>
        </label>
    </div>
);

export const UserUploadCard = ({ onUpload }) => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-slide-up text-center">
        <div className="w-20 h-20 bg-glass-blue/10 text-glass-blue rounded-full flex items-center justify-center mb-6 ring-2 ring-glass-blue/20">
            <User size={36} strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-semibold mb-2" style={{ fontFamily: 'var(--font-display)', color: '#E0D8D3' }}>Analyze Form</h2>
        <p className="max-w-sm mb-10 text-sm leading-relaxed" style={{ color: '#9A8F84' }}>
            Compare your workout against the <span className="font-medium" style={{ color: '#D4946A' }}>Golden Template</span>
        </p>

        <label className="group cursor-pointer relative w-full max-w-md">
            <input type="file" className="hidden" onChange={onUpload} accept="video/*" />
            <div className="glass-card-light px-8 py-12 flex flex-col items-center gap-4 transition-all duration-300 group-hover:bg-glass-lightgray/30 group-hover:scale-[1.02] group-hover:shadow-2xl">
                <div className="p-4 bg-glass-charcoal/30 text-glass-blue rounded-[18px] group-hover:bg-glass-blue group-hover:text-glass-dark transition-all duration-300 shadow-lg">
                    <Camera size={24} strokeWidth={2} />
                </div>
                <span className="font-medium text-base text-white/90">Upload User Video</span>
            </div>
        </label>
    </div>
);
