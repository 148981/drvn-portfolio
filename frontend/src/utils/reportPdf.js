// reportPdf.js — 📄 共用「頁面 → PDF 報告」工具
// ─────────────────────────────────────────────────────────────────────────────
// 讓每一次健身 / 跑步結算、營養報告都能一鍵下載完整 PDF。
// 做法與 QuarterlyReport 相同：html2canvas 截整頁 → jsPDF 依 A4 高度分頁切圖。
// jspdf / html2canvas 皆為動態載入（不進主 bundle）。

// 手機可用的「存成檔案」：
//   🩹 圖10 問題（報告能看不能存檔）的修法。WKWebView 裡 <a download> 與 window.open(blob)
//   都會被擋 —— 檔案根本沒落地。真正能存檔的路徑是 iOS 原生分享面板（Web Share API L2，
//   navigator.share({ files })），使用者在面板選「儲存到檔案 / 儲存到相簿 / AirDrop」即可存下 PDF。
//   優先序：① 原生 saveFile 橋接 → ② Web Share API → ③ 桌面瀏覽器 anchor 下載 → ④ pdf.save fallback。
export const savePdfMobileFriendly = async (pdf, fname) => {
    let blob;
    try { blob = pdf.output('blob'); } catch { blob = null; }

    // ① 原生 App：saveFile 橋接（WebView.swift）寫成暫存檔再開分享面板 —— WKWebView 沒有 Web Share API
    try {
        if (blob && window.webkit?.messageHandlers?.saveFile) {
            const reader = new FileReader();
            const dataUrl = await new Promise((res) => { reader.onload = () => res(reader.result); reader.readAsDataURL(blob); });
            window.webkit.messageHandlers.saveFile.postMessage({ name: fname, data: dataUrl });
            return true;
        }
    } catch { /* fall through */ }

    // ② 手機瀏覽器：Web Share API（可「儲存到檔案」）
    try {
        if (blob && navigator.canShare) {
            const file = new File([blob], fname, { type: 'application/pdf' });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: fname });
                return true;
            }
        }
    } catch (e) {
        // 使用者取消分享（AbortError）不算失敗，直接結束
        if (e && e.name === 'AbortError') return true;
    }

    // ③ 桌面瀏覽器：anchor 下載
    try {
        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fname; a.rel = 'noopener';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60000);
            return true;
        }
    } catch { /* fall through */ }

    // ④ 最後手段
    try { pdf.save(fname); return true; } catch { return false; }
};

/**
 * 把一個 DOM 元素輸出成 A4 直式 PDF（自動分頁）。
 * @param {HTMLElement} el      要輸出的元素
 * @param {string} fname        檔名（含 .pdf）
 * @param {string} bg           背景色（預設 DRVN paper）
 * @returns {Promise<boolean>}  成功與否
 */
export async function downloadElementAsPdf(el, fname, bg = '#F6F4F1') {
    if (!el) return false;
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'), import('html2canvas'),
    ]);
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: bg, useCORS: true, logging: false });
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const imgW = pw - margin * 2;
    const imgH = (canvas.height * imgW) / canvas.width;
    let remaining = imgH, sy = 0;
    const pageContentH = ph - margin * 2;
    const pxPerPt = canvas.width / imgW;
    let first = true;
    while (remaining > 0) {
        const sliceH = Math.min(pageContentH, remaining);
        const sCanvas = document.createElement('canvas');
        sCanvas.width = canvas.width;
        sCanvas.height = sliceH * pxPerPt;
        const ctx = sCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, sy * pxPerPt, canvas.width, sliceH * pxPerPt, 0, 0, canvas.width, sliceH * pxPerPt);
        if (!first) pdf.addPage();
        pdf.addImage(sCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, sliceH);
        remaining -= sliceH; sy += sliceH; first = false;
    }
    return await savePdfMobileFriendly(pdf, fname);
}

export default { savePdfMobileFriendly, downloadElementAsPdf };
