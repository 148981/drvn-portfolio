"""
api_legal.py — 公開法律文件頁（App Store Connect 需要公開的隱私政策 URL）
====================================================================
路由（無需登入，公開）：
  GET /legal            → 索引頁
  GET /legal/privacy    → 隱私政策  ← App Store Connect「隱私政策 URL」填這個
  GET /legal/terms      → 服務條款
  GET /legal/disclaimer → 免責聲明
  GET /support          → 支援頁  ← App Store Connect「支援 URL」填這個
  GET /legal/delete-account → 刪除帳號說明 ← Facebook 登入「資料刪除指示網址」填這個

內容與 App 內同一份（frontend/src/data/legalDocs.json 的複本 legal_docs.json）。
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse

router = APIRouter(tags=["legal"])

# 文字與 App 內同一份：frontend/src/data/legalDocs.json → 複本 backend/legal_docs.json
# （Railway 只部署 backend/，所以放一份複本；npm run sync:legal 同步、verify:appstore 檢查一致）
import json as _json
import os as _os

with open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "legal_docs.json"), encoding="utf-8") as _f:
    _LEGAL = _json.load(_f)

CONTACT_EMAIL = _LEGAL["contact"]
LEGAL_UPDATED = _LEGAL["updated"]
DISCLAIMER = _LEGAL["docs"]["disclaimer"]["body"]
PRIVACY_POLICY = _LEGAL["docs"]["privacy"]["body"]
TERMS_OF_SERVICE = _LEGAL["docs"]["terms"]["body"]


def _page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DRVN · {title}</title>
<style>
  body{{margin:0;background:#161415;color:#F6F4F1;
       font-family:-apple-system,'Noto Sans TC',sans-serif;line-height:1.9}}
  .wrap{{max-width:720px;margin:0 auto;padding:48px 24px 80px}}
  .kicker{{font-size:10px;font-weight:900;letter-spacing:.32em;
          text-transform:uppercase;color:#F95C4B;margin:0 0 10px}}
  h1{{font-size:26px;font-weight:900;letter-spacing:-.02em;margin:0 0 28px}}
  pre{{white-space:pre-wrap;word-break:break-word;margin:0;
      font-family:inherit;font-size:14.5px;color:rgba(255,255,255,.75)}}
  nav{{margin-top:48px;padding-top:20px;border-top:1px solid rgba(255,255,255,.1);font-size:13px}}
  nav a{{color:#F95C4B;text-decoration:none;margin-right:18px}}
</style></head><body><div class="wrap">
<p class="kicker">— DRVN Legal</p>
<h1>{title}</h1>
<pre>{body}</pre>
<nav>
  <a href="/legal/privacy">隱私政策</a>
  <a href="/legal/terms">服務條款</a>
  <a href="/legal/disclaimer">免責聲明</a>
  <a href="/support">支援</a>
</nav>
</div></body></html>"""


@router.get("/legal", response_class=HTMLResponse)
async def legal_index():
    return _page("法律文件", f"更新日期：{LEGAL_UPDATED}\n\n請由下方選單選擇文件。")


@router.get("/legal/privacy", response_class=HTMLResponse)
async def legal_privacy():
    return _page("隱私政策", PRIVACY_POLICY)


@router.get("/legal/terms", response_class=HTMLResponse)
async def legal_terms():
    return _page("服務條款", TERMS_OF_SERVICE)


@router.get("/legal/disclaimer", response_class=HTMLResponse)
async def legal_disclaimer():
    return _page("免責聲明", DISCLAIMER)


SUPPORT = f"""有任何問題、建議或想回報錯誤，請寄信到 {CONTACT_EMAIL}，我們會在 3 個工作天內回覆。

常見問題
・怎麼取消訂閱？
  iPhone「設定 > Apple 帳號 > 訂閱 > DRVN」，或 App 內「設定 > 最上面的會員卡 > 換方案或取消訂閱」。取消後可用到該期結束。
・怎麼恢復購買？
  換手機或重新安裝後，打開付費視窗按「恢復購買」。
・怎麼刪除帳號？
  App 內「設定 > 資料與法律 > 刪除帳號」。刪除帳號不會自動取消 Apple 訂閱。
・怎麼匯出我的資料？
  App 內「設定 > 資料與法律 > 匯出我的資料」。
・看到不當的貼文或留言？
  點貼文右上角「⋯」或留言下方的「檢舉」「封鎖」，我們會在 24 小時內處理。
・Apple 健康資料沒有同步？
  iPhone「設定 > 隱私權與安全性 > 健康 > DRVN」確認讀取權限已打開。"""


@router.get("/support", response_class=HTMLResponse)
async def support_page():
    return _page("支援", SUPPORT)


DELETE_ACCOUNT = f"""如何刪除您的 DRVN 帳號與資料

一、在 App 內刪除（立即生效）
打開 DRVN →「設定 > 資料與法律 > 刪除帳號」，確認後帳號與所有資料會一併刪除，包含：個人資料、訓練與跑步紀錄、飲食紀錄、身體數據、社群貼文與留言。刪除後無法復原。

二、用 Facebook、Google、LINE 或 Apple 登入的帳號
同樣從 App 內刪除即可，我們會一併刪除從這些服務取得的資料（名稱、頭像、帳號編號）。
您也可以到 Facebook「設定和隱私 > 設定 > 應用程式和網站」移除 DRVN 的存取權限。

三、無法登入 App 時
寄信到 {CONTACT_EMAIL}，註明您登入用的方式（Facebook／Google／LINE／Apple／Email），我們會在 15 日內完成刪除並回信通知。

四、訂閱
刪除帳號不會自動取消 Apple 訂閱，請到 iPhone「設定 > Apple 帳號 > 訂閱 > DRVN」取消。"""


# Facebook 登入的「資料刪除指示網址」填這個（Meta 要一個專門說明怎麼刪資料的公開頁面）
@router.get("/legal/delete-account", response_class=HTMLResponse)
async def legal_delete_account():
    return _page("刪除帳號與資料", DELETE_ACCOUNT)



# 爬蟲規則：公開頁（隱私政策、刪除說明、支援）要讓 Facebook／Apple 的審查爬蟲讀得到，
# API 不需要被索引。Meta 的分享偵錯工具讀不到 /robots.txt 時會回報「可能被 robots.txt 擋下」。
@router.get("/robots.txt", response_class=PlainTextResponse)
async def robots_txt():
    return (
        "User-agent: facebookexternalhit\nAllow: /\n\n"
        "User-agent: *\nAllow: /legal\nAllow: /support\nDisallow: /api/\n"
    )
