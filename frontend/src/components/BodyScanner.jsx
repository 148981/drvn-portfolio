import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { pressProps } from '../utils/nutritionMotion';
import Cropper from 'react-easy-crop';
import getCroppedImg from './cropUtils'; // 引入剛剛建立的工具

// 這裡我們復用上一版的 SVG 路徑，作為對齊用的「幽靈疊影」
// 為了簡化，這裡只保留了輪廓，並統一填色
const SilhouetteOverlay = () => (
    <svg viewBox="0 0 1000 1200" style={{ width: '100%', height: '100%', opacity: 0.4 }}>
        <g fill="#FFFFFF" stroke="#333" strokeWidth="5">
            {/* 簡化的上半身輪廓組合 */}
            <path d="M390 350 Q320 360 310 420 Q290 500 320 550 Q290 620 320 660 L345 650 Q330 600 340 550 Z" />
            <path d="M610 350 Q680 360 690 420 Q710 500 680 550 Q710 620 680 660 L655 650 Q670 600 660 550 Z" />
            <path d="M500 370 Q430 365 390 400 Q420 460 495 450 Z" />
            <path d="M500 370 Q570 365 610 400 Q580 460 505 450 Z" />
            <path d="M495 455 L430 460 Q420 520 440 560 L500 570 L560 560 Q580 520 570 460 L505 455 Z" />
            <path d="M480 680 L400 700 Q390 800 420 880 L490 870 Q485 780 480 680 Z" />
            <path d="M520 680 L600 700 Q610 800 580 880 L510 870 Q515 780 520 680 Z" />
            <path d="M425 900 Q400 980 410 1080 L460 1080 Q470 980 480 900 Z" />
            <path d="M575 900 Q600 980 590 1080 L540 1080 Q530 980 520 900 Z" />
            {/* 頭部示意 (選用) */}
            <circle cx="500" cy="200" r="80" />
        </g>
    </svg>
);

const BodyScanner = ({ onScanComplete, onCancel, ghostImage }) => {
    const [imageSrc, setImageSrc] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    // 處理檔案上傳
    const onFileChange = async (e) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            let imageDataUrl = await readFile(file);
            setImageSrc(imageDataUrl);
        }
    };

    const readFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => resolve(reader.result), false);
            // 少了 error/abort 就會永遠卡住（讀不到的檔案不會觸發 load）
            reader.addEventListener('error', () => reject(new Error('讀取照片失敗')), false);
            reader.addEventListener('abort', () => reject(new Error('讀取照片被中斷')), false);
            reader.readAsDataURL(file);
        });
    };

    // 當使用者停止拖曳/縮放時，紀錄裁切區域的像素數據
    const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    // 執行裁切並輸出結果
    const showResult = useCallback(async () => {
        try {
            const croppedImageBase64 = await getCroppedImg(imageSrc, croppedAreaPixels);
            // 將裁切好的標準圖片傳回給父層
            onScanComplete(croppedImageBase64);
        } catch (e) {
            console.error(e);
        }
    }, [imageSrc, croppedAreaPixels, onScanComplete]);

    if (!imageSrc) {
        return (
            <div style={{ padding: 40, textAlign: 'center', border: '2px dashed #666', borderRadius: 18, color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)', height: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <input type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} id="file-upload" />
                <label htmlFor="file-upload" style={{ cursor: 'pointer', fontSize: 18, fontWeight: 'bold', padding: '16px 32px', backgroundColor: '#333', borderRadius: '28px', marginBottom: '16px' }}>
                    📸 CHOOSE PHOTO
                </label>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '8px' }}>Upload a photo to align with the muscle overlay.</div>

                {onCancel && (
                    <motion.button {...pressProps('row')} onClick={onCancel} style={{ marginTop: '24px', background: 'transparent', border: 'none', color: '#999', fontSize: '14px', textDecoration: 'underline' }}>
                        Cancel
                    </motion.button>
                )}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <div style={{
                position: 'relative',
                width: '100%',
                height: '500px', // 掃描器高度
                background: '#111',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
            }}>
                {/* 1. 底層：圖片裁切器 */}
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    minZoom={0.1}
                    maxZoom={5}
                    // 重要：長寬比必須鎖定，對應我們的 SVG viewBox (1000/1200 = 5/6)
                    aspect={5 / 6}
                    onCropChange={setCrop}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                    restrictPosition={false}
                />

                {/* 2. 頂層：半透明疊影遮罩 (Ghost Overlay) */}
                {/* pointerEvents: 'none' 是關鍵，讓滑鼠操作穿透到下層的 Cropper */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '83.33%', // (5/6 * 100) 大約值，讓遮罩對齊裁切框
                    height: '100%',
                    pointerEvents: 'none',
                    zIndex: 10,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    mixBlendMode: ghostImage ? 'normal' : 'overlay', // 實體照片用 normal 比較好，SVG 用 overlay
                    opacity: ghostImage ? 0.4 : 1  // 照片稍微透明，讓用戶容易對齊
                }}>
                    {ghostImage ? (
                        <img loading="lazy" decoding="async" src={ghostImage} alt="Ghost" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                        <SilhouetteOverlay />
                    )}
                </div>
                <div style={{ position: 'absolute', bottom: 20, width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, pointerEvents: 'none', zIndex: 11 }}>
                    Drag and zoom to align body with silhouette
                </div>
            </div>

            <motion.button {...pressProps('row')}
 onClick={showResult}
 style={{
 padding: '16px 32px',
 background: 'linear-gradient(135deg, #F28132, #E05543)',
 border: 'none',
 borderRadius: '28px',
 color: 'white',
 fontSize: '16px',
 fontWeight: 'bold',
 cursor: 'pointer',
 boxShadow: '0 4px 15px rgba(242, 129, 50, 0.4)'
 }}
 >
                SNAP TO FRAME
            </motion.button>
        </div>
    );
};

export default BodyScanner;
