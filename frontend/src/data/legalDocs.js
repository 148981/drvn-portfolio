// legalDocs.js — App 內法律文件
// ─────────────────────────────────────────────────────────────────
// 文字的唯一來源是 legalDocs.json；backend/legal_docs.json 是同一份的複本
// （後端公開頁 /legal/privacy、/legal/terms 用，App Store Connect 的隱私政策 URL 填那裡）。
// 改文字：只改 frontend/src/data/legalDocs.json，再跑 npm run sync:legal（verify:appstore 會檢查兩份一致）。
import LEGAL from './legalDocs.json';

export const CONTACT_EMAIL = LEGAL.contact;
export const LEGAL_UPDATED = LEGAL.updated;
export const DISCLAIMER = LEGAL.docs.disclaimer.body;
export const PRIVACY_POLICY = LEGAL.docs.privacy.body;
export const TERMS_OF_SERVICE = LEGAL.docs.terms.body;

export const LEGAL_DOCS = LEGAL.docs;

export default LEGAL_DOCS;
