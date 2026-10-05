// 🖨️ journeyPdf — 把「進化日誌」的歷史進步趨勢排成瑞士時尚大膽排版 A4 報告輸出 PDF。
// ─────────────────────────────────────────────────────────────
// 做法：離屏組一份 A4 版型 DOM（paper 底、超大黑體標題、hairline 分隔、
// 珊瑚單色 accent、cross-divider 數據格）→ html2canvas 轉高解析點陣 →
// jsPDF 依 A4 寬度縮放並「依區塊邊界」自動分頁 → 直接下載 .pdf。
// 中文字直接吃系統字型（點陣化，不用嵌字型檔）。
//
// 報告的立場：這是一份「趨勢報告」，不是成績單。
//   ① 一句正向總結（對得回真實數字）
//   ② 累積數據（誠實照放）
//   ③ 出席熱力圖 —— 連續性的證據
//   ④ 月度趨勢表 —— 每個月的量能變化，一眼看出走向
//   ⑤ 進步清單 —— 動作重量 / 配速 / 身體組成，只列真的變好的
//   分頁時不會把一個區塊從中間切開。
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { savePdfMobileFriendly } from './reportPdf';

const INK = '#161415';
const PAPER = '#F6F4F1';
const CORAL = '#F95C4B';
const HAIR = 'rgba(22,20,21,0.12)';
const MUTED = 'rgba(22,20,21,0.45)';
const FAINT = 'rgba(22,20,21,0.32)';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 區塊標記：分頁時以此為切點，不會把一段內容從中間剖開
const BLOCK = 'data-pdf-block';

const kickerHTML = (text, right = '') => `
  <div style="display:flex; align-items:baseline; justify-content:space-between; margin:0 0 14px;">
    <span style="font-size:9px; font-weight:900; letter-spacing:0.3em; text-transform:uppercase; color:${MUTED};">— ${esc(text)}</span>
    ${right ? `<span style="font-size:9px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:${FAINT};">${esc(right)}</span>` : ''}
  </div>`;

const statCellHTML = (m, i, cols) => `
  <div style="border-top:2px solid ${i < cols ? INK : HAIR}; padding:14px 4px 4px; ${i % cols !== 0 ? `border-left:1px solid ${HAIR}; padding-left:16px;` : ''}">
    <div style="font-size:9px; font-weight:900; letter-spacing:0.22em; text-transform:uppercase; color:rgba(22,20,21,0.5); margin-bottom:10px;">${esc(m.label)}</div>
    <div style="display:flex; align-items:baseline; gap:4px;">
      <span style="font-size:34px; font-weight:900; letter-spacing:-0.02em; color:${m.accent ? CORAL : INK}; font-variant-numeric:tabular-nums;">${esc(m.value)}</span>
      ${m.unit ? `<span style="font-size:10px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:rgba(22,20,21,0.42);">${esc(m.unit)}</span>` : ''}
    </div>
    ${m.sub ? `<div style="font-size:9.5px; font-weight:700; color:rgba(22,20,21,0.38); margin-top:6px;">${esc(m.sub)}</div>` : ''}
  </div>`;

const listHTML = (l) => `
  <div ${BLOCK} style="margin-top:34px;">
    ${kickerHTML(l.heading)}
    <div style="border-top:1px solid ${HAIR};">
      ${(l.rows || []).map((r) => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 2px; border-bottom:1px solid ${HAIR};">
          <span style="font-size:13px; font-weight:800; color:${INK};">${esc(r.name)}</span>
          <span style="display:flex; align-items:center; gap:12px;">
            ${r.detail ? `<span style="font-size:11.5px; font-weight:700; color:rgba(22,20,21,0.55); font-variant-numeric:tabular-nums;">${esc(r.detail)}</span>` : ''}
            ${r.badge ? `<span style="font-size:11px; font-weight:900; color:${CORAL}; letter-spacing:0.02em;">${esc(r.badge)}</span>` : ''}
          </span>
        </div>`).join('')}
    </div>
  </div>`;

// ── 出席熱力圖：連續性的證據 ───────────────────────────────────────
const heatHTML = (heat) => {
    const weeks = heat?.weeks || [];
    if (!weeks.length) return '';
    const cell = (d) => {
        if (d.isFuture) return 'transparent';
        if (!d.level) return 'rgba(22,20,21,0.06)';
        const kinds = new Set((d.events || []).map((e) => e.kind));
        if (kinds.size > 1) return CORAL;
        const only = [...kinds][0];
        if (only === 'run') return 'rgba(249,92,75,0.55)';
        if (only === 'strength') return 'rgba(22,20,21,0.62)';
        return 'rgba(84,129,212,0.55)';
    };
    const active = weeks.flat().filter((d) => d.level > 0).length;
    return `
  <div ${BLOCK} style="margin-top:34px;">
    ${kickerHTML('出席趨勢 · Consistency', `${active} 天有出現`)}
    <div style="display:flex; gap:3px;">
      ${weeks.map((col) => `
        <div style="display:flex; flex-direction:column; gap:3px;">
          ${col.map((d) => `<div style="width:11px; height:11px; border-radius:2px; background:${cell(d)};"></div>`).join('')}
        </div>`).join('')}
    </div>
    <div style="display:flex; gap:16px; margin-top:12px;">
      ${[['rgba(249,92,75,0.55)', '跑步'], ['rgba(22,20,21,0.62)', '重訓'], ['rgba(84,129,212,0.55)', '量測'], [CORAL, '兩種都做']]
        .map(([c, zh]) => `<span style="display:inline-flex; align-items:center; gap:5px;">
            <span style="width:8px; height:8px; border-radius:2px; background:${c}; display:inline-block;"></span>
            <span style="font-size:8.5px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:${FAINT};">${zh}</span>
          </span>`).join('')}
    </div>
  </div>`;
};

// ── 月度趨勢表：每個月的量能變化，一眼看出走向 ──────────────────────
//    附帶一條「相對長條」，讓表格自己就是一張圖。
const tableHTML = (t) => {
    const rows = t?.rows || [];
    if (!rows.length) return '';
    const cols = t.columns || [];
    const barIdx = t.barColumn ?? -1;
    const max = barIdx >= 0 ? Math.max(...rows.map((r) => Number(r.bar) || 0), 1) : 1;
    return `
  <div ${BLOCK} style="margin-top:34px;">
    ${kickerHTML(t.heading || '月度趨勢 · Monthly Trend', t.right || '')}
    <div style="display:grid; grid-template-columns:repeat(${cols.length},1fr); border-top:2px solid ${INK}; border-bottom:1px solid ${HAIR}; padding:9px 0;">
      ${cols.map((c, i) => `<span style="font-size:8.5px; font-weight:900; letter-spacing:0.2em; text-transform:uppercase; color:${MUTED}; text-align:${i === 0 ? 'left' : 'right'};">${esc(c)}</span>`).join('')}
    </div>
    ${rows.map((r) => `
      <div style="border-bottom:1px solid ${HAIR}; padding:10px 0 8px;">
        <div style="display:grid; grid-template-columns:repeat(${cols.length},1fr);">
          ${r.cells.map((v, i) => `<span style="font-size:11.5px; font-weight:${i === 0 ? 800 : 700}; color:${i === 0 ? INK : 'rgba(22,20,21,0.62)'}; text-align:${i === 0 ? 'left' : 'right'}; font-variant-numeric:tabular-nums;">${esc(v)}</span>`).join('')}
        </div>
        ${barIdx >= 0 ? `<div style="height:2px; background:rgba(22,20,21,0.06); margin-top:8px;">
            <div style="height:100%; width:${Math.round((Number(r.bar) || 0) / max * 100)}%; background:${CORAL};"></div>
          </div>` : ''}
      </div>`).join('')}
  </div>`;
};

/**
 * @param {Object} opts
 *   fileName   下載檔名（不含 .pdf）
 *   title      超大主標（英文，e.g. 'EVOLUTION'）
 *   subtitle   中文副標
 *   meta       右上角資訊（日期 / 第 N 天）
 *   lead       開場的一段話（正向總結）
 *   stats      [{label, value, unit, sub, accent}]
 *   heat       {weeks} — buildHeatmap 的輸出
 *   table      {heading, right, columns:[], rows:[{cells:[], bar}], barColumn}
 *   lists      [{heading, rows:[{name, detail, badge}]}]
 *   notes      結尾說明句（陣列）
 */
export async function exportJourneyReportPDF({
    fileName = 'DRVN_Report',
    kicker = 'DRVN · Evolution Log · Trend Report',
    title = 'REPORT',
    subtitle = '',
    meta = '',
    lead = '',
    stats = [],
    heat = null,
    table = null,
    lists = [],
    notes = [],
}) {
    const W = 794; // ≈ A4 寬 @96dpi
    const cols = stats.length >= 3 ? 3 : Math.max(1, stats.length);
    const node = document.createElement('div');
    node.style.cssText = `position:fixed; left:-12000px; top:0; width:${W}px; background:${PAPER}; color:${INK}; box-sizing:border-box; padding:64px 56px 48px; font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue","Noto Sans TC",Helvetica,sans-serif;`;
    node.innerHTML = `
      <div ${BLOCK}>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:26px;">
          <span style="font-size:10px; font-weight:900; letter-spacing:0.34em; text-transform:uppercase; color:${MUTED};">— ${esc(kicker)}</span>
          <span style="font-size:10px; font-weight:900; letter-spacing:0.22em; text-transform:uppercase; color:${MUTED}; font-variant-numeric:tabular-nums;">${esc(meta)}</span>
        </div>
        <div style="font-size:64px; font-weight:900; line-height:0.92; letter-spacing:-0.045em; text-transform:uppercase;">${esc(title)}</div>
        ${subtitle ? `<div style="margin-top:14px; font-size:15px; font-weight:700; color:rgba(22,20,21,0.6);">${esc(subtitle)}<span style="color:${CORAL};">.</span></div>` : ''}
        ${lead ? `<div style="margin-top:16px; font-size:12.5px; font-weight:600; line-height:1.85; color:rgba(22,20,21,0.66); max-width:60ch;">${esc(lead)}</div>` : ''}
        <div style="height:2px; background:${INK}; margin:30px 0 0;"></div>
        ${stats.length ? `
          <div style="display:grid; grid-template-columns:repeat(${cols},1fr); gap:0 0; margin-top:26px;">
            ${stats.map((m, i) => statCellHTML(m, i, cols)).join('')}
          </div>` : ''}
      </div>
      ${heat ? heatHTML(heat) : ''}
      ${table ? tableHTML(table) : ''}
      ${lists.filter((l) => l && (l.rows || []).length).map(listHTML).join('')}
      ${notes.length ? `
        <div ${BLOCK} style="margin-top:34px; border-left:2px solid ${CORAL}; padding-left:14px;">
          ${notes.map((n) => `<div style="font-size:11px; font-weight:600; color:rgba(22,20,21,0.62); line-height:1.75;">${esc(n)}</div>`).join('')}
        </div>` : ''}
      <div ${BLOCK} style="margin-top:48px; display:flex; align-items:center; justify-content:space-between; border-top:1px solid ${HAIR}; padding-top:16px;">
        <span style="font-size:9px; font-weight:900; letter-spacing:0.3em; text-transform:uppercase; color:rgba(22,20,21,0.35);">Move with intent<span style="color:${CORAL};">.</span></span>
        <span style="font-size:9px; font-weight:800; letter-spacing:0.18em; text-transform:uppercase; color:rgba(22,20,21,0.3);">DRVN</span>
      </div>`;
    document.body.appendChild(node);

    try {
        const SCALE = 2;
        // 📏 先量每個區塊的底邊（CSS px）→ 之後分頁時只在這些位置切
        const blockBottoms = Array.from(node.querySelectorAll(`[${BLOCK}]`))
            .map((el) => (el.offsetTop + el.offsetHeight) * SCALE)
            .sort((a, b) => a - b);

        const canvas = await html2canvas(node, { scale: SCALE, backgroundColor: PAPER, useCORS: true, logging: false });
        const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const ratio = pw / canvas.width;

        if (canvas.height * ratio <= ph + 2) {
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pw, canvas.height * ratio);
        } else {
            const pagePxH = Math.floor(canvas.width * (ph / pw));
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            const ctx = pageCanvas.getContext('2d');
            let rendered = 0, page = 0;

            while (rendered < canvas.height - 2) {
                let sliceH = Math.min(pagePxH, canvas.height - rendered);
                // ✂️ 智慧切點：找「落在這一頁內、且不會讓頁面太空」的最後一個區塊底邊
                if (rendered + sliceH < canvas.height) {
                    const floor = rendered + pagePxH * 0.35;
                    const fits = blockBottoms.filter((b) => b > floor && b <= rendered + pagePxH);
                    if (fits.length) sliceH = Math.max(...fits) - rendered;
                }
                pageCanvas.height = pagePxH;
                ctx.fillStyle = PAPER;
                ctx.fillRect(0, 0, pageCanvas.width, pagePxH);
                ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                if (page > 0) pdf.addPage();
                pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pw, ph);
                rendered += sliceH;
                page += 1;
                if (page > 40) break;   // 保險絲：永不無限迴圈
            }
        }
        // 手機 App 裡 jsPDF 內建的存檔存不下來 —— 走共用的存檔流程（原生分享面板）
        return await savePdfMobileFriendly(pdf, `${fileName}.pdf`);
    } finally {
        document.body.removeChild(node);
    }
}

export default { exportJourneyReportPDF };
