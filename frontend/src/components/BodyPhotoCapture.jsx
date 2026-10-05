import React, { useState, useRef, useCallback, useEffect } from 'react';
import { pressProps } from '../utils/nutritionMotion';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, X, RotateCcw, Check, Eye, EyeOff } from 'lucide-react';
import { savePhoto, getPhotos } from '../utils/bodyPhotoManager';
import { haptic } from '../utils/haptics';

const BodyPhotoCapture = ({ userId, bodyWeight, bodyFat, onCapture, onClose }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [captured, setCaptured] = useState(null);
    const [showGhost, setShowGhost] = useState(true);
    const [ghostPhoto, setGhostPhoto] = useState(null);
    const [facingMode, setFacingMode] = useState('environment');
    const [error, setError] = useState(null);

    // Load ghost overlay (previous photo)
    useEffect(() => {
        const photos = getPhotos(userId);
        const latest = photos.length > 0 ? photos[0] : null;
        if (latest) setGhostPhoto(latest.image);
    }, [userId]);

    // Start camera
    const startCamera = useCallback(async () => {
        try {
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
            const s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1920 } },
                audio: false,
            });
            setStream(s);
            if (videoRef.current) {
                videoRef.current.srcObject = s;
            }
            setError(null);
        } catch (err) {
            console.error('Camera error:', err);
            setError('無法開啟相機，請確認權限設定');
        }
    }, [facingMode]);

    useEffect(() => {
        startCamera();
        return () => {
            if (stream) stream.getTracks().forEach(t => t.stop());
        };
    }, [facingMode]);

    // Capture photo
    const handleCapture = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCaptured(dataUrl);

        haptic('success');
    };

    // Save & done
    const handleSave = () => {
        if (!captured) return;
        const record = savePhoto(userId, captured, { bodyWeight, bodyFat });
        if (onCapture) onCapture(record);
        if (onClose) onClose();
    };

    // Flip camera
    const flipCamera = () => {
        setFacingMode(f => f === 'environment' ? 'user' : 'environment');
    };

    // Retake
    const retake = () => {
        setCaptured(null);
    };

    return (
        <motion.div
            className="fixed inset-0 z-[200] bg-black flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5"
                style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 50px))' }}>
                <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose}
 className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                    <X size={20} color="white" />
                </motion.button>
                <div className="flex gap-2">
                    {ghostPhoto && (
                        <motion.button {...pressProps('icon')} onClick={() => setShowGhost(!showGhost)}
 className="w-10 h-10 rounded-full flex items-center justify-center"
 style={{ background: showGhost ? 'rgba(253,111,47,0.8)' : 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                            {showGhost ? <Eye size={16} color="white" /> : <EyeOff size={16} color="white" />}
                        </motion.button>
                    )}
                    <motion.button {...pressProps('icon')} aria-label="重來" onClick={flipCamera}
 className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center">
                        <RotateCcw size={16} color="white" />
                    </motion.button>
                </div>
            </div>

            {/* Camera / Preview Area */}
            <div className="flex-1 relative overflow-hidden">
                {!captured ? (
                    <>
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="absolute inset-0 w-full h-full object-cover"
                            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                        />
                        {/* Ghost Overlay */}
                        {showGhost && ghostPhoto && (
                            <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.3 }}>
                                <img loading="lazy" decoding="async" src={ghostPhoto} alt="ghost" className="w-full h-full object-cover"
                                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
                            </div>
                        )}
                        {/* Alignment grid */}
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="w-full h-full" style={{
                                background: `linear-gradient(to right, transparent 33%, rgba(255,255,255,0.08) 33%, rgba(255,255,255,0.08) 33.3%, transparent 33.3%, transparent 66.6%, rgba(255,255,255,0.08) 66.6%, rgba(255,255,255,0.08) 66.9%, transparent 66.9%),
                                             linear-gradient(to bottom, transparent 33%, rgba(255,255,255,0.08) 33%, rgba(255,255,255,0.08) 33.3%, transparent 33.3%, transparent 66.6%, rgba(255,255,255,0.08) 66.6%, rgba(255,255,255,0.08) 66.9%, transparent 66.9%)`
                            }} />
                        </div>
                        {/* Ghost label */}
                        {showGhost && ghostPhoto && (
                            <div className="absolute top-20 left-0 right-0 flex justify-center pointer-events-none">
                                <span className="px-3 py-1.5 rounded-full text-[11px] font-bold text-white/70"
                                    style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
                                    👻 上次拍攝疊影 · 對齊身形輪廓
                                </span>
                            </div>
                        )}
                    </>
                ) : (
                    <img loading="lazy" decoding="async" src={captured} alt="captured" className="absolute inset-0 w-full h-full object-cover" />
                )}
            </div>

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 z-30 pb-10 pt-6"
                style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', paddingBottom: 'max(40px, calc(env(safe-area-inset-bottom, 34px) + 20px))' }}>

                {/* Privacy note */}
                <div className="flex justify-center mb-4">
                    <span className="text-[11px] font-bold text-white/40 flex items-center gap-1">
                        🔒 照片僅保存在您的設備中
                    </span>
                </div>

                {!captured ? (
                    <div className="flex justify-center">
                        <motion.button {...pressProps('icon')} onClick={handleCapture}
 className="w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center">
                            <div className="w-[60px] h-[60px] rounded-full bg-white" />
                        </motion.button>
                    </div>
                ) : (
                    <div className="flex justify-center gap-6">
                        <motion.button {...pressProps('icon')} onClick={retake}
 className="px-8 py-3.5 rounded-full text-white text-[14px] font-bold"
 style={{ background: 'rgba(255,255,255,0.15)' }}>
                            重拍
                        </motion.button>
                        <motion.button {...pressProps('icon')} onClick={handleSave}
 className="px-8 py-3.5 rounded-full text-white text-[14px] font-black flex items-center gap-2"
 style={{ background: '#FD6F2F', boxShadow: '0 4px 20px rgba(253,111,47,0.4)' }}>
                            <Check size={16} /> 儲存
                        </motion.button>
                    </div>
                )}

                {error && (
                    <p className="text-center text-[12px] text-red-400 mt-3">{error}</p>
                )}
            </div>
        </motion.div>
    );
};

export default BodyPhotoCapture;
