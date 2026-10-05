/**
 * verify_account_delete.mjs —— 「刪除帳號」要真的刪掉帳號。
 * ─────────────────────────────────────────────────────────────────────
 * App Store 審查指南 5.1.1(v)：App 裡能建立帳號，就必須能在 App 裡刪除帳號，
 * 而且是「帳號本體與個資一起消失」，不是「把資料清空、帳號留著」。
 *
 * 最容易漏掉的一步就是最後一步：資料表清得很乾淨，users 那一列卻還在 ——
 * 下次用同一個 Google / Apple 登入，會拿回同一個 user_id，Email 與頭貼都還在。
 */
import fs from 'fs';
import path from 'path';

const FE = path.resolve(process.cwd(), 'src');
const BE = path.resolve(process.cwd(), '..', 'backend');
const read = (p) => fs.readFileSync(p, 'utf8');

let bad = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) bad++; };

console.log('\n══ 刪除帳號（App Store 5.1.1(v)）══\n');

// ── 前端：設定頁有刪除帳號，而且會打後端 ──
const profile = read(path.join(FE, 'components/UserProfileFormMobile.jsx'));
ok(/刪除帳號/.test(profile), '設定頁找得到「刪除帳號」');
ok(/\/api\/user\/delete/.test(profile),
   '刪除帳號會打後端（不是只清本機 localStorage）');
ok(/setShowDeleteConfirm|deleteStep/.test(profile), '刪除前有再確認一次');

// ── 後端：兩個入口共用同一份清除邏輯 ──
const api = read(path.join(BE, 'api_user_profile.py'));
ok(/def _purge_all_user_data\(/.test(api), '後端有共用的清除邏輯 _purge_all_user_data');
ok(/@router\.post\("\/api\/user\/delete"\)/.test(api), '有 POST /api/user/delete');
ok((api.match(/_purge_all_user_data\(/g) || []).length >= 3,
   'DELETE 與 POST 兩個入口都走同一份清除邏輯（規則不會漂移）');

// ── 關鍵：帳號本體真的被刪 ──
const purge = /def _purge_all_user_data\([\s\S]*?\n(?=@router|def )/.exec(api)?.[0] || '';
ok(/delete_user_account\(/.test(purge),
   '清完資料後會刪掉帳號本體（users 那一列 + 第三方登入綁定）');

const svc = read(path.join(BE, 'core/user_service.py'));
const fn = /def delete_user_account\([\s\S]*?\n(?=def )/.exec(svc)?.[0] || '';
ok(fn.length > 0, 'user_service 有 delete_user_account');
ok(/db\.delete\(user\)/.test(fn) && /db\.commit\(\)/.test(fn),
   '真的 delete 並 commit，不是改個旗標當作刪除');

// auth_providers 必須跟著走，否則同一個 Google 身分還能找回舊帳號
const models = read(path.join(BE, 'core/models_user.py'));
ok(/cascade="all, delete-orphan"/.test(models),
   '第三方登入綁定會跟著帳號一起刪（不然同一個 Google 還能找回舊帳號）');

// ── 審查員看得到的字：按鈕叫「刪除帳號」、不能說「保持登入」、刪完登出 ──
ok(/label=\{t\('刪除帳號'/.test(profile), '設定頁那一列的字就是「刪除帳號」（不是「清除資料」「重置」）');
ok(!/保持登入|資料重置為預設/.test(profile), '確認視窗沒有「保持登入／重置」這種不是刪除的說法');
ok(/finishAndReload[\s\S]{0,400}handleLogout\(\)/.test(profile), '刪除成功後登出、回登入頁');
ok(/刪除帳號不會自動取消/.test(profile) && /openManageSubscriptions/.test(profile), '有訂閱的人：提醒 Apple 扣款不會因刪帳號停止，並給取消入口');

// ── 用 Apple 登入：刪帳號時要向 Apple 撤銷授權 ──
const auth = read(path.join(BE, 'api_auth.py'));
ok(/auth\/revoke/.test(auth) && /def revoke_apple_for_user\(/.test(auth), '後端會呼叫 Apple /auth/revoke 撤銷「用 Apple 登入」');
ok(/_save_apple_refresh_token\(db/.test(auth), 'Apple 登入時把 refresh token 存起來（撤銷要用）');
ok(/revoke_apple_for_user\(user_id\)/.test(purge), '刪帳號流程先撤銷 Apple 授權再刪帳號本體');

console.log(bad ? `\n❌ ${bad} 項未通過 —— 這會擋上架\n` : '\n✅ 按下刪除帳號，帳號是真的不見了\n');
process.exit(bad ? 1 : 0);
