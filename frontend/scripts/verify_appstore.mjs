/**
 * verify_appstore.mjs — 送 App Store 審核前的硬性檢查（隱私、權限、法律文件、社群、內購）
 * ─────────────────────────────────────────────────────────────────────
 * 每一項都對到一條審查指南；✗ 就是很可能被退件的地方。
 * 對照清單：上架前_App審核與隱私清單.md
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const IOS = path.join(ROOT, 'ios/FitnessApp');
const read = (p) => fs.readFileSync(p, 'utf8');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) bad++; };
const cjk = (s) => /[一-鿿]/.test(s || '');
const plistStr = (xml, key) => (xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`)) || [])[1];

console.log('\n══ 權限說明與 Info.plist（5.1.1、出口合規）══');
const info = read(path.join(IOS, 'Info.plist'));
const pbx = read(path.join(IOS, 'FitnessApp.xcodeproj/project.pbxproj'));
ok(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(info), '出口合規：ITSAppUsesNonExemptEncryption = NO（每次上傳不用再回答）');
const USAGE = ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSMicrophoneUsageDescription',
    'NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription', 'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSMotionUsageDescription'];
for (const k of USAGE) ok(cjk(plistStr(info, k)), `${k}：有中文說明用途`);
const appBlocks = pbx.split(/\t\t[0-9A-F]{8,24} \/\* (?:Debug|Release) \*\/ = \{/).filter((b) => b.includes('CODE_SIGN_ENTITLEMENTS = FitnessApp.entitlements;'));
const mismatch = [];
for (const b of appBlocks) {
    for (const m of b.matchAll(/INFOPLIST_KEY_(NS\w+UsageDescription) = "((?:[^"\\]|\\.)*)";/g)) {
        const inPlist = plistStr(info, m[1]);
        if (m[1] === 'NSLocalNetworkUsageDescription') continue;
        if (!cjk(m[2]) || (inPlist && inPlist !== m[2])) mismatch.push(m[1]);
    }
}
ok(mismatch.length === 0, `Xcode 設定裡的權限說明跟 Info.plist 一樣、都是中文${mismatch.length ? `（不一致：${mismatch.join('、')}）` : ''}`);
const release = appBlocks.find((b) => /name = Release;/.test(b)) || '';
ok(!/NSLocalNetworkUsageDescription/.test(release), '正式版沒有「區域網路」權限說明（那是開發用的）');
ok(!/NSAllowsArbitraryLoads/.test(info) && !/NSAllowsArbitraryLoads/.test(read(path.join(IOS, 'WatchAppConfig/Info.plist'))), 'iPhone 與手錶都沒有全開 http（NSAllowsArbitraryLoads）');

console.log('\n══ 隱私清單 PrivacyInfo.xcprivacy（5.1.2、必填理由 API）══');
const VALID_TYPES = new Set(['Name', 'EmailAddress', 'PhoneNumber', 'PhysicalAddress', 'OtherUserContactInfo', 'Health', 'Fitness',
    'PaymentInfo', 'CreditInfo', 'OtherFinancialInfo', 'PreciseLocation', 'CoarseLocation', 'SensitiveInfo', 'Contacts',
    'EmailsOrTextMessages', 'PhotosorVideos', 'AudioData', 'GameplayContent', 'CustomerSupport', 'OtherUserContent',
    'BrowsingHistory', 'SearchHistory', 'UserID', 'DeviceID', 'PurchaseHistory', 'ProductInteraction', 'AdvertisingData',
    'OtherUsageData', 'CrashData', 'PerformanceData', 'OtherDiagnosticData', 'EnvironmentScanning', 'Hands', 'Head', 'OtherDataTypes']);
const VALID_REASONS = { UserDefaults: ['CA92.1', '1C8F.1', 'C56D.1', 'AC6B.1'], FileTimestamp: ['DDA9.1', 'C617.1', '3B52.1', '0A2A.1'],
    SystemBootTime: ['35F9.1', '8FFB.1', '3D61.1'], DiskSpace: ['85F4.1', 'E174.1', '7D9E.1', 'B728.1'], ActiveKeyboards: ['3EC4.1', '54BD.1'] };
const manifests = [['iPhone App', 'PrivacyInfo.xcprivacy'], ['Apple Watch', 'ＦｉｔｎｅｓｓAppWatch Watch App/PrivacyInfo.xcprivacy'], ['小工具', 'RunWidget/PrivacyInfo.xcprivacy']];
for (const [label, rel] of manifests) {
    const p = path.join(IOS, rel);
    if (!fs.existsSync(p)) { ok(false, `${label}：有隱私清單`); continue; }
    const x = read(p);
    const types = [...x.matchAll(/<string>NSPrivacyCollectedDataType(?!Purpose)(\w+)<\/string>/g)].map((m) => m[1]);
    const badTypes = types.filter((t) => !VALID_TYPES.has(t));
    ok(badTypes.length === 0, `${label}：資料類型都是 Apple 認得的名稱${badTypes.length ? `（錯誤：${badTypes.join('、')}）` : ''}`);
    const apis = [...x.matchAll(/NSPrivacyAccessedAPICategory(\w+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g)];
    const badReason = apis.filter(([, cat, rs]) => [...rs.matchAll(/<string>([^<]+)<\/string>/g)].some((m) => !(VALID_REASONS[cat] || []).includes(m[1])));
    ok(badReason.length === 0, `${label}：必填理由 API 的代碼都有效`);
    ok(/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(x), `${label}：不追蹤（NSPrivacyTracking = NO）`);
    if (label === 'iPhone App') {
        const need = ['Name', 'EmailAddress', 'UserID', 'Health', 'Fitness', 'PreciseLocation', 'PhotosorVideos', 'OtherUserContent', 'PurchaseHistory', 'ProductInteraction'];
        const miss = need.filter((t) => !types.includes(t));
        ok(miss.length === 0, `iPhone App：實際蒐集的資料都有申報${miss.length ? `（少了：${miss.join('、')}）` : `（${types.length} 類）`}`);
        ok(/1C8F\.1/.test(x), 'iPhone App：App Group 共用設定（小工具）有申報理由 1C8F.1');
    }
}

console.log('\n══ 隱私政策與服務條款（5.1.1(i)、3.1.2）══');
const legalFe = read('src/data/legalDocs.json');
const legalBe = read(path.join(ROOT, 'backend/legal_docs.json'));
ok(legalFe === legalBe, 'App 內與網頁版法律文件是同一份（npm run sync:legal）');
const L = JSON.parse(legalFe).docs;
const pv = L.privacy.body, tm = L.terms.body;
ok(/HealthKit/.test(pv) && /絕不用於廣告/.test(pv) && /不會出售/.test(pv), '隱私政策：Apple 健康資料不做廣告、不出售');
ok(/位置/.test(pv) && /購買資料/.test(pv) && /使用與診斷資料/.test(pv) && /社群內容/.test(pv), '隱私政策：位置、購買、使用紀錄、社群內容都有寫');
ok(!/匿名的功能使用/.test(pv), '隱私政策：沒有把「跟帳號連結」的使用紀錄說成匿名');
ok(/刪除帳號/.test(pv) && /匯出我的資料/.test(pv) && /個人資料保護法/.test(pv), '隱私政策：刪除、匯出、個資法權利');
ok(/自動續訂/.test(tm) && /24 小時/.test(tm) && /stdeula/.test(tm) && /取消/.test(tm), '服務條款：自動續訂、24 小時前取消、Apple EULA');
ok(/零容忍/.test(tm) && /檢舉/.test(tm) && /封鎖/.test(tm), '服務條款：社群零容忍、檢舉、封鎖（1.2）');
const apiLegal = read(path.join(ROOT, 'backend/api_legal.py'));
ok(/"\/legal\/privacy"/.test(apiLegal) && /"\/legal\/terms"/.test(apiLegal) && /"\/support"/.test(apiLegal), '公開網址：/legal/privacy、/legal/terms、/support');

console.log('\n══ 社群內容（1.2）══');
const feedPost = read('src/components/SocialFeed/FeedPost.jsx');
const shared = read('src/components/SocialFeed/communityShared.jsx');
const mod = read(path.join(ROOT, 'backend/api_moderation.py'));
const acts = read(path.join(ROOT, 'backend/api_activities.py'));
ok(/檢舉貼文/.test(feedPost) && /封鎖/.test(feedPost), '別人的貼文：可以檢舉、封鎖作者');
ok(/reportContent\(\{ type: 'comment'/.test(shared) && /blockUser\(/.test(shared), '別人的留言：可以檢舉、封鎖');
ok(/def filter_text/.test(mod) && /_filter_text\(\(?caption/.test(acts) && /filter_text\(content\)/.test(acts), '發文與留言寫入前遮掉髒話');
ok(/visible_activities/.test(acts) && /visible_comments/.test(acts), '動態牆與留言：封鎖的人、檢舉過的內容不出現');
ok(/\/api\/moderation\/dashboard/.test(mod) && /resolve/.test(mod), '有檢舉處理頁（24 小時內移除或駁回）');
const club = read('src/components/SocialFeed/ClubDiscussion.jsx');
ok(/action: 'report'/.test(club) && /action: 'block'/.test(club), '社團討論：檢舉、封鎖');

console.log('\n══ 內購（3.1.1、3.1.2）══');
const sheet = read('src/components/MembershipSheet.jsx');
ok(/恢復購買/.test(sheet) && /服務條款/.test(sheet) && /隱私權政策/.test(sheet) && /自動續訂/.test(sheet), '付費視窗：恢復購買、條款、隱私、自動續訂說明');
const planSheet = read('src/components/MembershipPlanSheet.jsx');
ok(/換方案或取消訂閱/.test(planSheet), '會員方案頁：可以換方案或取消');
const cfg = read(path.join(ROOT, 'backend/config.py'));
ok(/MEMBERSHIP_GATE_USERS/.test(cfg), '試營運時可只對審核帳號開付費牆（MEMBERSHIP_GATE_USERS）');

console.log('\n══ 其他 ══');
const ms = read('src/utils/membership.js');
ok(!/^\s*poseCheck:/m.test(ms), '姿勢分析不在會員清單上（全部免費，收集回饋中）');
ok(fs.existsSync('src/components/PoseFeedbackCard.jsx'), '姿勢分析結果頁有「準不準」回饋');

console.log(bad ? `\n❌ ${bad} 項未通過 —— 送審前要處理\n` : '\n✅ App Store 審核檢查全部通過\n');
process.exit(bad ? 1 : 0);
