import sqlite3
import os
import json
import requests
import re
from datetime import datetime
from deep_translator import GoogleTranslator

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "nutrition.db")

def get_db_connection():
    try:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        return conn
    except Exception as e:
        print(f"DB Connection Error: {e}")
        raise e

def init_db():
    """Initialize SQLite database with FTS5 support"""
    conn = get_db_connection()
    c = conn.cursor()
    
    # 1. Food Items Table (The "50,000" records)
    c.execute('''
        CREATE TABLE IF NOT EXISTS food_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            calories INTEGER DEFAULT 0,
            protein REAL DEFAULT 0,
            carbs REAL DEFAULT 0,
            fats REAL DEFAULT 0,
            serving_size_g INTEGER DEFAULT 100,
            source TEXT DEFAULT 'local',
            is_tfda INTEGER DEFAULT 0,
            is_global INTEGER DEFAULT 0,
            fiber REAL DEFAULT 0,
            image_url TEXT
        )
    ''')
    
    # --- Migration Logic for existing databases ---
    try:
        c.execute("ALTER TABLE food_items ADD COLUMN is_tfda INTEGER DEFAULT 0")
    except: pass
    try:
        c.execute("ALTER TABLE food_items ADD COLUMN is_global INTEGER DEFAULT 0")
    except: pass
    try:
        c.execute("ALTER TABLE food_items ADD COLUMN fiber REAL DEFAULT 0")
    except: pass
    try:
        c.execute("ALTER TABLE food_items ADD COLUMN image_url TEXT")
    except: pass
    
    # 2. FTS5 Virtual Table for Fast Search
    # Check if FTS5 is available/table exists
    try:
        c.execute('CREATE VIRTUAL TABLE IF NOT EXISTS food_items_fts USING fts5(name, content="food_items", content_rowid="id")')
        
        # Triggers to keep FTS index in sync
        c.execute('''
            CREATE TRIGGER IF NOT EXISTS food_items_ai AFTER INSERT ON food_items BEGIN
              INSERT INTO food_items_fts(rowid, name) VALUES (new.id, new.name);
            END;
        ''')
        c.execute('''
            CREATE TRIGGER IF NOT EXISTS food_items_ad AFTER DELETE ON food_items BEGIN
              INSERT INTO food_items_fts(food_items_fts, rowid, name) VALUES('delete', old.id, old.name);
            END;
        ''')
        c.execute('''
            CREATE TRIGGER IF NOT EXISTS food_items_au AFTER UPDATE ON food_items BEGIN
              INSERT INTO food_items_fts(food_items_fts, rowid, name) VALUES('delete', old.id, old.name);
              INSERT INTO food_items_fts(rowid, name) VALUES (new.id, new.name);
            END;
        ''')
    except Exception as e:
        print(f"Warning: FTS5 might not be supported on this SQLite version: {e}")

    # 3. Nutrition Logs (Diary)
    c.execute('''
        CREATE TABLE IF NOT EXISTS nutrition_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            date TEXT NOT NULL,
            food_id INTEGER,
            name TEXT NOT NULL,
            calories INTEGER DEFAULT 0,
            protein REAL DEFAULT 0,
            carbs REAL DEFAULT 0,
            fats REAL DEFAULT 0,
            grams INTEGER DEFAULT 100,
            water_ml INTEGER DEFAULT 0,
            is_tfda INTEGER DEFAULT 0,
            is_global INTEGER DEFAULT 0,
            fiber REAL DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # --- Migration Logic for logs ---
    try:
        c.execute("ALTER TABLE nutrition_logs ADD COLUMN is_tfda INTEGER DEFAULT 0")
    except: pass
    try:
        c.execute("ALTER TABLE nutrition_logs ADD COLUMN is_global INTEGER DEFAULT 0")
    except: pass
    try:
        c.execute("ALTER TABLE nutrition_logs ADD COLUMN fiber REAL DEFAULT 0")
    except: pass

    # 4. Nutrition Targets (每位使用者的每日營養目標)
    #    由手機端（NutritionEngine：BMR→TDEE→目標）算好後推上來，
    #    讓 Apple Watch 也能讀到「跟手機一模一樣」的目標，不再寫死。
    c.execute('''
        CREATE TABLE IF NOT EXISTS nutrition_targets (
            user_id   TEXT PRIMARY KEY,
            calories  INTEGER DEFAULT 2000,
            protein   REAL DEFAULT 150,
            carbs     REAL DEFAULT 200,
            fats      REAL DEFAULT 65,
            fiber     REAL DEFAULT 25,
            water     INTEGER DEFAULT 2500,
            mode      TEXT DEFAULT 'maintenance',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()

# [NEW] 關鍵字同義詞映射 (Synonym Mapping)
# 解決 TFDA 官方名稱與常用名稱不一致的問題 (例如：地瓜 vs 甘藷)
SYNONYM_MAP = {
    "地瓜": "甘藷",
    "番薯": "甘藷",
    "紅薯": "甘藷",
    "高麗菜": "甘藍",
    "蛤蜊": "文蛤",
    "玉米": "玉蜀黍",
    "鯖魚": "青花魚",
    "優格": "優酪乳",
    "拿鐵": "咖啡",
    "蛋": "雞蛋",
    "雞肉": "雞胸"
}

# 🔑 USDA FoodData Central 的 key 只放在 Railway 環境變數 USDA_API_KEY，不進 git。
#    沒設定時退回官方的 DEMO_KEY（每小時只有幾十次，只夠自己測試）。
USDA_API_KEY = os.getenv("USDA_API_KEY", "").strip() or "DEMO_KEY"
if USDA_API_KEY == "DEMO_KEY":
    print("[nutrition_db] ⚠️ 沒有設定 USDA_API_KEY，USDA 查詢暫用 DEMO_KEY（額度很低）")
USDA_TRANSLATION_MAP = {
    "漢堡": "burger",
    "披薩": "pizza",
    "蘋果": "apple",
    "義大利麵": "pasta",
    "香蕉": "banana",
    "鮭魚": "salmon",
    "牛肉": "beef",
    "雞肉": "chicken",
    "豬肉": "pork",
    "三明治": "sandwich",
    "沙拉": "salad",
    "薯條": "fries",
    "熱狗": "hot dog",
    "牛奶": "milk",
    "起司": "cheese",
    "咖啡": "coffee",
    "煎餅": "pancake",
    "冰淇淋": "ice cream",
    "巧克力": "chocolate"
}

def fetch_usda(query):
    url = f"https://api.nal.usda.gov/fdc/v1/foods/search"
    params = {
        "api_key": USDA_API_KEY,
        "query": query,
        "pageSize": 5,
        "dataType": ["Foundation", "SR Legacy"]
    }
    try:
        res = requests.get(url, params=params, timeout=6).json()
        results = []
        for f in res.get('foods', []):
            nutrients = {str(n['nutrientNumber']): n['value'] for n in f.get('foodNutrients', [])}
            results.append({
                "id": f"usda_{f.get('fdcId', 'unknown')}",
                "name": f"{f.get('description', 'Unknown')}".title(),
                "calories": int(nutrients.get('208', 0)),
                "protein": round(nutrients.get('203', 0), 1),
                "carbs": round(nutrients.get('205', 0), 1),
                "fats": round(nutrients.get('204', 0), 1),
                "serving_size_g": 100,
                "is_usda": 1,
                "is_global": 1,
                "is_tfda": 0,
                "fiber": round(nutrients.get('291', 0), 1) if '291' in nutrients else 0,
                "image_url": None,
                "source": "usda"
            })
        return results
    except Exception as e:
        print(f"USDA API Error: {e}")
        return []

def translate_to_english(text):
    """
    智慧翻譯器：如果是中文就轉英文，否則回傳原字串
    """
    if any(u'\u4e00' <= char <= u'\u9fff' for char in text):
        try:
            translated = GoogleTranslator(source='zh-TW', target='en').translate(text)
            print(f"🌐 自動翻譯: '{text}' → '{translated}'")
            return translated
        except Exception as e:
            print(f"❌ 翻譯失敗: {e}")
            return USDA_TRANSLATION_MAP.get(text, text)
    return text

def search_food_fts(query, limit=20):
    """
    Mixed search strategy (FTS5 + LIKE) to solve Chinese tokenization issues (e.g. searching '鮭魚' inside '大西洋生鮭魚片').
    """
    if not query or not query.strip():
        return []

    conn = get_db_connection()
    c = conn.cursor()
    results = []

    try:
        clean_q = query.strip().replace('"', '').replace("'", "").replace('*', '').strip()
        if not clean_q:
            return []

        search_pattern = f'"{clean_q}"*'
        like_pattern = f'%{clean_q}%'

        sql = '''
            SELECT * FROM food_items 
            WHERE id IN (
                SELECT rowid FROM food_items_fts WHERE food_items_fts MATCH ?
            )
            OR name LIKE ? 
            ORDER BY 
                is_tfda DESC, 
                (name LIKE '%胸%' OR name LIKE '%去皮%') DESC,
                (name = ?) DESC, 
                length(name) ASC
            LIMIT ?
        '''
        
        c.execute(sql, (search_pattern, like_pattern, clean_q, limit))
        results = [dict(row) for row in c.fetchall()]

        # Synonym expansion fallback
        if not results and clean_q in SYNONYM_MAP:
            alt = SYNONYM_MAP[clean_q]
            print(f"  → Synonym: '{clean_q}' → '{alt}'")
            c.execute(sql, (f'"{alt}"*', f'%{alt}%', alt, limit))
            results = [dict(row) for row in c.fetchall()]

    except Exception as e:
        print(f"❌ 搜尋出錯: {e}")
        import traceback; traceback.print_exc()
    finally:
        conn.close()

    # 2. [智慧補位]：如果本地結果太少，或是使用者搜尋的東西很明顯需要國外數據
    # 判斷標準：結果少於 5 筆
    if len(results) < 5:
        # 自動翻譯成英文
        usda_query = translate_to_english(clean_q)
        
        # 避免重複翻譯：如果翻譯結果跟原詞不同，或是原本就是英文
        if usda_query != clean_q or re.match(r'^[A-Za-z0-9\s\-,]+$', clean_q):
            print(f"🚀 啟動 USDA 補位: '{usda_query}'")
            usda_results = fetch_usda(usda_query)
            
            # 數據去重：避免本地跟 USDA 重複顯示 (根據名稱簡單判斷)
            existing_names = {r['name'].lower() for r in results}
            for ur in usda_results:
                if ur['name'].lower() not in existing_names:
                    results.append(ur)

    # 3. [數據分級]：標記推薦選項 (只有官方檢驗過的資料才有推薦標章)
    for r in results:
        r['is_recommended'] = 1 if (r.get('is_tfda') or r.get('is_usda') or r.get('source') == 'usda') else 0

    print(f"🔍 搜尋 '{query}' → {len(results)} 筆結果")
    return results[:limit]

def log_meal_sql(user_id, meal_data):
    """Log a meal to SQLite"""
    conn = get_db_connection()
    c = conn.cursor()

    # 🔴 Fix(timezone): 優先使用前端送來的 date（已是使用者本地時間 YYYY-MM-DD）
    # 若前端未送 date，fallback 到 server 本地時間（不用 UTC，避免深夜記錄跑到隔天）
    date_str = meal_data.get('date') or datetime.now().strftime("%Y-%m-%d")

    # 🔴 Fix(negative-macro): 防止前端 Bug 送入負值污染歷史累計數字
    def _safe_num(key, default=0, min_val=0):
        v = meal_data.get(key, default)
        try:
            return max(min_val, float(v))
        except (TypeError, ValueError):
            return default

    safe_calories = _safe_num('calories', 0)
    safe_protein  = _safe_num('protein', 0)
    safe_carbs    = _safe_num('carbs', 0)
    safe_fats     = _safe_num('fats', 0)
    safe_fiber    = _safe_num('fiber', 0)
    safe_grams    = _safe_num('grams', 100, min_val=1)
    safe_water    = _safe_num('water_ml', 0)

    # 優先使用前端送來的 timestamp（用於進食時鐘分析），否則 DB 會自動用 CURRENT_TIMESTAMP
    timestamp_val = meal_data.get('timestamp')  # ISO 8601 or None

    if timestamp_val:
        c.execute('''
            INSERT INTO nutrition_logs
            (user_id, date, name, calories, protein, carbs, fats, fiber, grams, water_ml, food_id, is_tfda, is_global, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            date_str,
            meal_data.get('name'),
            safe_calories,
            safe_protein,
            safe_carbs,
            safe_fats,
            safe_fiber,
            safe_grams,
            safe_water,
            meal_data.get('food_id'),
            meal_data.get('is_tfda', 0),
            meal_data.get('is_global', 0),
            timestamp_val
        ))
    else:
        c.execute('''
            INSERT INTO nutrition_logs
            (user_id, date, name, calories, protein, carbs, fats, fiber, grams, water_ml, food_id, is_tfda, is_global)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            date_str,
            meal_data.get('name'),
            safe_calories,
            safe_protein,
            safe_carbs,
            safe_fats,
            safe_fiber,
            safe_grams,
            safe_water,
            meal_data.get('food_id'),
            meal_data.get('is_tfda', 0),
            meal_data.get('is_global', 0)
        ))
    
    new_id = c.lastrowid
    conn.commit()
    
    # Fetch back the created entry
    c.execute('SELECT * FROM nutrition_logs WHERE id = ?', (new_id,))
    entry = dict(c.fetchone())
    conn.close()
    return entry

def get_daily_summary_sql(user_id, date_str):
    """Get SUM of macros for a specific day"""
    conn = get_db_connection()
    c = conn.cursor()
    
    c.execute('''
        SELECT 
            SUM(calories) as calories, 
            SUM(protein) as protein, 
            SUM(carbs) as carbs, 
            SUM(fats) as fats,
            SUM(fiber) as fiber,
            SUM(water_ml) as water
        FROM nutrition_logs
        WHERE user_id = ? AND date = ?
    ''', (user_id, date_str))
    
    row = c.fetchone()
    summary = dict(row) if row else {}
    
    # Handle NULLs from SUM
    for k in summary:
        if summary[k] is None:
            summary[k] = 0
            
    # Get meals list
    c.execute('SELECT * FROM nutrition_logs WHERE user_id = ? AND date = ?', (user_id, date_str))
    meals = [dict(r) for r in c.fetchall()]

    # 🔴 Fix(meal_count)：summary 補上 meal_count，讓 Apple Watch 讀得到（原本永遠 0）。
    summary["meal_count"] = len(meals)

    # 🔴 Fix(targets)：附上該使用者的每日營養目標（手機推上來的），
    #    讓手錶的進度環/百分比與手機同基準。
    targets = get_nutrition_targets(user_id)

    conn.close()
    return {
        "summary": summary,
        "meals": meals,
        "targets": targets
    }


def get_nutrition_targets(user_id):
    from core.committed_nutrition import read_committed_plan, plan_targets
    targets = _get_legacy_nutrition_targets(user_id)
    committed = plan_targets(read_committed_plan(user_id))
    return {**targets, **committed} if committed else targets


def _get_legacy_nutrition_targets(user_id):
    """讀取使用者每日營養目標；若尚未設定，回傳安全的預設值。"""
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute('SELECT * FROM nutrition_targets WHERE user_id = ?', (user_id,))
        row = c.fetchone()
    except Exception:
        row = None
    conn.close()
    if row:
        d = dict(row)
        return {
            "calories": int(d.get("calories") or 2000),
            "protein":  float(d.get("protein") or 150),
            "carbs":    float(d.get("carbs") or 200),
            "fats":     float(d.get("fats") or 65),
            "fiber":    float(d.get("fiber") or 25),
            "water":    int(d.get("water") or 2500),
            "mode":     d.get("mode") or "maintenance",
        }
    # Default（與舊手錶寫死值一致，作為過渡期 fallback）
    return {
        "calories": 2000, "protein": 150, "carbs": 200,
        "fats": 65, "fiber": 25, "water": 2500, "mode": "maintenance",
    }


def save_nutrition_targets(user_id, targets):
    """儲存/更新使用者每日營養目標（UPSERT）。targets 為 dict。"""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO nutrition_targets (user_id, calories, protein, carbs, fats, fiber, water, mode, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            calories=excluded.calories,
            protein=excluded.protein,
            carbs=excluded.carbs,
            fats=excluded.fats,
            fiber=excluded.fiber,
            water=excluded.water,
            mode=excluded.mode,
            updated_at=CURRENT_TIMESTAMP
    ''', (
        user_id,
        int(targets.get("calories", 2000)),
        float(targets.get("protein", 150)),
        float(targets.get("carbs", 200)),
        float(targets.get("fats", 65)),
        float(targets.get("fiber", 25)),
        int(targets.get("water", 2500)),
        str(targets.get("mode", "maintenance")),
    ))
    conn.commit()
    conn.close()
    return get_nutrition_targets(user_id)

def get_nutrition_history_sql(user_id, days=7, logged_only=False):
    """Get nutrition history.

    Args:
        user_id:     target user
        days:        look-back window (default 7)
        logged_only: if True, skip days where no meals were recorded
                     (used by deep-analysis charts so sanitize() always has real data)
    """
    from datetime import datetime, timedelta
    history = []

    for i in range(days):
        date_str = (datetime.now() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        day_data = get_daily_summary_sql(user_id, date_str)
        meal_count = len(day_data["meals"])

        # For logged_only mode, skip days with no meals at all
        if logged_only and meal_count == 0:
            continue

        history.append({
            "date": date_str,
            "summary": day_data["summary"],
            "meal_count": meal_count
        })

    return history

def delete_meal_sql(user_id, meal_id):
    """Delete a specific meal by ID from SQL"""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM nutrition_logs WHERE id = ? AND user_id = ?', (meal_id, user_id))
    deleted = c.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def update_meal_sql(user_id, meal_id, updates):
    """Update a specific meal by ID from SQL"""
    conn = get_db_connection()
    c = conn.cursor()
    # 🔴 Fix(negative-macro): 編輯時同步防止負值寫入
    def _safe(key, default=0):
        try: return max(0.0, float(updates.get(key, default)))
        except: return default
    c.execute('''
        UPDATE nutrition_logs
        SET name = ?, calories = ?, protein = ?, carbs = ?, fats = ?, fiber = ?, water_ml = ?
        WHERE id = ? AND user_id = ?
    ''', (
        updates.get('name'),
        _safe('calories'),
        _safe('protein'),
        _safe('carbs'),
        _safe('fats'),
        _safe('fiber'),
        _safe('water_ml'),
        meal_id,
        user_id
    ))
    updated = c.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def get_recent_meal_entries(user_id, days=3):
    """Get all individual meal log entries from the last N days, grouped by date.
    This is for the Food Log diary view — returns actual diary rows, not aggregated foods."""
    from datetime import datetime, timedelta
    conn = get_db_connection()
    c = conn.cursor()

    result = []
    for i in range(days):
        date_str = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        c.execute(
            'SELECT * FROM nutrition_logs WHERE user_id = ? AND date = ? ORDER BY timestamp DESC',
            (user_id, date_str)
        )
        meals = [dict(r) for r in c.fetchall()]
        if meals or i == 0:  # Always include today even if empty
            result.append({"date": date_str, "meals": meals})

    conn.close()
    return result

# Initialize on import
init_db()

def get_recent_foods(user_id, limit=10):
    """Get recently logged foods for a user"""
    conn = get_db_connection()
    c = conn.cursor()
    
    try:
        # Get distinct foods from logs, ordered by most recent use
        # using a simple GROUP BY name to dedup
        c.execute('''
            SELECT name, calories, protein, carbs, fats, fiber,
                   grams as serving_size_g, is_tfda, is_global, id as last_log_id
            FROM (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY name ORDER BY timestamp DESC, id DESC
                ) as recent_rank
                FROM nutrition_logs WHERE user_id = ? AND grams > 0
            )
            WHERE recent_rank = 1
            ORDER BY timestamp DESC, last_log_id DESC
            LIMIT ?
        ''', (user_id, limit))
        
        results = []
        for row in c.fetchall():
            r = dict(row)
            # Normalize structure to match search results
            results.append({
                "id": f"recent_{r['last_log_id']}", # A log id is not a food database id.
                "name": r['name'],
                "calories": round((r['calories'] or 0) * 100 / r['serving_size_g'], 2),
                "protein": round((r['protein'] or 0) * 100 / r['serving_size_g'], 2),
                "carbs": round((r['carbs'] or 0) * 100 / r['serving_size_g'], 2),
                "fats": round((r['fats'] or 0) * 100 / r['serving_size_g'], 2),
                "fiber": round((r['fiber'] or 0) * 100 / r['serving_size_g'], 2),
                "serving_size_g": r['serving_size_g'],
                "is_tfda": r['is_tfda'],
                "is_global": r['is_global']
            })
            
        conn.close()
        return results
    except Exception as e:
        print(f"Error fetching recent foods: {e}")
        conn.close()
        return []
