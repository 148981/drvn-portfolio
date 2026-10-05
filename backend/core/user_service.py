"""
core/user_service.py — 帳號邏輯層

業務邏輯統一封裝在這層，api_auth.py / 其他 router 一律透過此模組存取帳號資料，
不直接操作 ORM model，未來換 DB / 換 hash 演算法 / 加 2FA 都只動這一個檔。

依專案 SOP 第三條：
    JWT 永遠裝 user.id (UUID)，第三方 provider_uid 只存資料庫，不外洩。
"""
from typing import Optional
from .json_cache import save_json_atomic
from sqlalchemy.orm import Session

from .models_user import User, AuthProvider


# ── 密碼工具（Phase 3）────────────────────────────────────────────────
# 優先用 Argon2id（OWASP 首選）；若環境未裝 argon2，自動退回 bcrypt。
# 不論用哪種，verify 都相容「既有的 bcrypt 雜湊」，所以是「向後相容、無痛升級」：
#   - 既有使用者密碼（bcrypt）照常驗證成功
#   - 新註冊 / 改密碼則用 Argon2id
import bcrypt
try:
    from passlib.context import CryptContext
    _pwd_ctx = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
    _pwd_ctx.hash("__probe__")          # 確認 argon2 後端真的可用
    _USE_PASSLIB = True
except Exception:
    _USE_PASSLIB = False                # 退回純 bcrypt


def hash_password(plain: str) -> str:
    """雜湊密碼（Argon2id；不可用時 bcrypt cost 12）。"""
    if _USE_PASSLIB:
        return _pwd_ctx.hash(plain)
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")


def verify_password(plain: str, hashed: Optional[str]) -> bool:
    """驗證密碼。相容 Argon2id 與既有 bcrypt 雜湊。"""
    if not plain or not hashed:
        return False
    try:
        if _USE_PASSLIB:
            return _pwd_ctx.verify(plain, hashed)
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── 查詢 ──────────────────────────────────────────────────────────
def find_user_by_id(db: Session, user_id: str) -> Optional[User]:
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def find_user_by_legacy_id(db: Session, legacy_id: str) -> Optional[User]:
    """遷移期間：用舊字串 ID (line_Uxxx / user_1765xxx) 查 User。"""
    if not legacy_id:
        return None
    return db.query(User).filter(User.legacy_id == legacy_id).first()


def find_user_by_email(db: Session, email: str) -> Optional[User]:
    if not email:
        return None
    return db.query(User).filter(User.email == email.lower()).first()


def find_user_by_provider(db: Session, provider: str, provider_uid: str) -> Optional[User]:
    if not provider or not provider_uid:
        return None
    ap = (
        db.query(AuthProvider)
        .filter(AuthProvider.provider == provider, AuthProvider.provider_uid == provider_uid)
        .first()
    )
    return ap.user if ap else None


def resolve_user_id(db: Session, any_id: str) -> Optional[str]:
    """容錯查詢：傳入新 UUID 或舊 legacy_id 都能回傳新 UUID。
    遷移期間給其他 router 用，避免一次全改。
    """
    if not any_id:
        return None
    u = find_user_by_id(db, any_id)
    if u:
        return u.id
    u = find_user_by_legacy_id(db, any_id)
    return u.id if u else None


# ── OAuth：核心入口 ───────────────────────────────────────────────
def find_or_create_oauth_user(
    db: Session,
    provider: str,
    provider_uid: str,
    email: Optional[str] = None,
    name: Optional[str] = None,
    avatar: Optional[str] = None,
) -> User:
    """OAuth callback 呼叫此函式。

    流程：
      1. (provider, provider_uid) 命中既有 AuthProvider → 直接登入
      2. 第三方有給 email 且 email 已存在 Users → 把新 provider 接到該 user
      3. 都沒有 → 建立新 User + 新 AuthProvider
    """
    if not provider or not provider_uid:
        raise ValueError("provider 與 provider_uid 為必要參數")

    # 1. 既有 provider 綁定
    existing = find_user_by_provider(db, provider, provider_uid)
    if existing:
        _update_profile_if_missing(db, existing, name=name, avatar=avatar, email=email)
        return existing

    # 2. Email 對應到既有帳號 → 合併綁定
    if email:
        same_email_user = find_user_by_email(db, email)
        if same_email_user:
            ap = AuthProvider(
                user_id=same_email_user.id,
                provider=provider,
                provider_uid=provider_uid,
                email_at_provider=email.lower(),
            )
            db.add(ap)
            _update_profile_if_missing(db, same_email_user, name=name, avatar=avatar, email=None)
            db.commit()
            db.refresh(same_email_user)
            return same_email_user

    # 3. 全新使用者
    new_user = User(
        email=email.lower() if email else None,
        password_hash=None,
        display_name=(name or "User")[:80],
        avatar_url=avatar,
    )
    db.add(new_user)
    db.flush()  # 取得 new_user.id 供 FK 使用

    ap = AuthProvider(
        user_id=new_user.id,
        provider=provider,
        provider_uid=provider_uid,
        email_at_provider=email.lower() if email else None,
    )
    db.add(ap)
    db.commit()
    db.refresh(new_user)
    return new_user


def _update_profile_if_missing(
    db: Session, user: User,
    name: Optional[str] = None,
    avatar: Optional[str] = None,
    email: Optional[str] = None,
) -> None:
    """只在欄位原本是空的時候補上（不覆寫使用者已自訂的內容）。"""
    dirty = False
    if name and not user.display_name:
        user.display_name = name[:80]; dirty = True
    if avatar and not user.avatar_url:
        user.avatar_url = avatar; dirty = True
    if email and not user.email:
        try:
            user.email = email.lower(); dirty = True
        except Exception:
            pass
    if dirty:
        db.add(user)
        db.commit()


# ── Email + 密碼 ──────────────────────────────────────────────────
def register_email_user(
    db: Session,
    email: str,
    password: str,
    display_name: Optional[str] = None,
) -> User:
    if not email or not password:
        raise ValueError("email 與 password 為必填")
    if len(password) < 8:
        raise ValueError("password 至少 8 個字元")
    email = email.lower().strip()

    if find_user_by_email(db, email):
        raise ValueError("此 email 已被註冊")

    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=(display_name or email.split("@")[0])[:80],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_email_user(db: Session, email: str, password: str) -> Optional[User]:
    """成功回傳 User；失敗（密碼錯 / 純第三方用戶沒密碼 / 帳號不存在）一律回 None。"""
    if not email or not password:
        return None
    user = find_user_by_email(db, email.lower().strip())
    if not user or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ── 帳號合併 (guest → OAuth) ─────────────────────────────────────
def merge_users(db: Session, source_id: str, target_id: str) -> dict:
    """把 source User 的所有資料併到 target User，然後刪除 source User row。

    對應「訪客 → LINE/Google/FB 登入時選擇『帶入訪客資料』」。

    處理範圍：
      A. 檔名含 source_id 的 JSON 檔 → 改名 (若 target 已有同名檔則合併陣列)
      B. dict-keyed-by-user_id 的 JSON → 把 source key 的 value 搬到 target key
      C. array 內 user_id 欄位 → 把值由 source 改成 target

    回傳：搬遷統計 dict
    """
    import os, json, shutil

    source = find_user_by_id(db, source_id)
    target = find_user_by_id(db, target_id)
    if not source:
        raise ValueError(f"source user not found: {source_id}")
    if not target:
        raise ValueError(f"target user not found: {target_id}")
    if source.id == target.id:
        raise ValueError("source and target are the same user")

    HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(HERE, "data")

    stats = {"renamed": 0, "merged_files": 0, "rewritten_files": 0, "key_moves": 0, "id_rewrites": 0}

    user_id_fields = {"user_id", "userId", "owner_id", "creator_id",
                      "target_user_id", "from_user_id", "to_user_id"}

    # A. 檔名搬遷
    for fname in os.listdir(DATA_DIR):
        if not fname.endswith(".json") or source.id not in fname:
            continue
        src = os.path.join(DATA_DIR, fname)
        new_fname = fname.replace(source.id, target.id)
        dst = os.path.join(DATA_DIR, new_fname)
        if not os.path.exists(dst):
            shutil.move(src, dst)
            stats["renamed"] += 1
        else:
            # 兩邊都有 → 合併內容（陣列 append，dict 淺合併，target 優先）
            try:
                with open(src, "r", encoding="utf-8") as f: a = json.load(f)
                with open(dst, "r", encoding="utf-8") as f: b = json.load(f)
                if isinstance(a, list) and isinstance(b, list):
                    merged = b + a
                elif isinstance(a, dict) and isinstance(b, dict):
                    merged = {**a, **b}
                else:
                    merged = b
                save_json_atomic(dst, merged, indent=2)
                os.remove(src)
                stats["merged_files"] += 1
            except Exception:
                pass

    # B + C. 內容掃描重寫
    def rewrite(value):
        if isinstance(value, dict):
            new_d = {}
            for k, v in value.items():
                new_k = target.id if k == source.id else k
                if new_k != k: stats["key_moves"] += 1
                if isinstance(v, str) and k in user_id_fields and v == source.id:
                    new_d[new_k] = target.id
                    stats["id_rewrites"] += 1
                else:
                    new_d[new_k] = rewrite(v)
            return new_d
        if isinstance(value, list):
            return [rewrite(x) for x in value]
        return value

    for fname in os.listdir(DATA_DIR):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(DATA_DIR, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        before = json.dumps(data, ensure_ascii=False)
        new_data = rewrite(data)
        if json.dumps(new_data, ensure_ascii=False) != before:
            save_json_atomic(path, new_data, indent=2)
            stats["rewritten_files"] += 1

    # 刪除 source User row（cascade 連帶刪 AuthProvider，雖然 guest 通常沒有）
    db.delete(source)
    db.commit()

    return stats


# ── 公開序列化 (給 JWT / 前端) ────────────────────────────────────
def delete_user_account(db: Session, user_id: str) -> dict:
    """真的把「帳號本體」刪掉：users 那一列 + 所有第三方登入綁定。

    ⚠️ App Store 審查指南 5.1.1(v)：使用者按下刪除帳號，必須是「帳號與個資一起消失」，
    不是「資料清空但帳號留著」。只清資料表的話，下次用同一個 Google/Apple 登入
    會拿回同一個 user_id，Email、顯示名稱、頭貼也都還在資料庫裡 —— 那不算刪除。

    AuthProvider 由 User.providers 的 delete-orphan cascade 一起帶走。
    """
    user = find_user_by_id(db, user_id) or find_user_by_legacy_id(db, user_id)
    if not user:
        return {"deleted": False, "reason": "not_found"}
    providers = [p.provider for p in (user.providers or [])]
    db.delete(user)
    db.commit()
    return {"deleted": True, "providers_unlinked": providers}


def user_to_public_dict(user: User) -> dict:
    """轉成 JWT payload / API response 用的純 dict。
    注意：永遠不要在這裡塞 provider_uid 或 password_hash。
    """
    return {
        "id":     user.id,            # UUID — 系統內部 ID
        "email":  user.email,
        "name":   user.display_name,
        "avatar": user.avatar_url,
    }
