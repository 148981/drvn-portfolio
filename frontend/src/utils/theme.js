/**
 * DRVN 統一調色盤（單一來源）
 * ------------------------------------------------------------------
 * 過去全專案有 58+ 個檔案各自宣告 const T / const C / const COLORS，
 * 同一個品牌色被硬編碼上千次，改一次要動上千處。
 * 這裡收斂成單一來源，新程式請一律 import 此模組：
 *
 *   import { T } from '../utils/theme';
 *   style={{ background: T.BLACK, color: T.PAPER }}
 *
 * 數值與 styles/design-tokens.css 的 --drvn-* 對齊。
 */

export const T = {
  BLACK: '#161415',   // 主前景 / 深底（drvn-ink）
  INK: '#161415',     // 別名
  PAPER: '#F6F4F1',   // 淺色頁面底（米白）
  STONE: '#E4DED2',   // 次層米色
  PEBBLE: '#CFC6B8',  // 沙色分隔 / 次要表面
  SAND: '#CFC6B8',    // 別名
  CORAL: '#F95C4B',   // 主強調色 coral
  EMBER: '#D94030',   // coral 加深（hover / pressed）
  CHAMPAGNE: '#E8E1D5',
  CREAM: '#E0D8D3',   // 深底上的淺色文字
  STONE_DARK: '#262523', // 深灰卡片底（drvn-stone）
  WHITE: '#FFFFFF',
  BLACK_SOFT: '#1A1A1A', // 近黑沉浸底
  // 小寫別名（相容舊檔以 T.black / T.paper 取用）
  black: '#161415',
  paper: '#F6F4F1',
  stone: '#E4DED2',
  pebble: '#CFC6B8',
  coral: '#F95C4B',
  ember: '#D94030',
};

// 語意色（與 design-tokens.css semantic colors 對齊）
export const SEMANTIC = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

export default T;
