"""
tfda_seed.py — 啟動時確保「衛福部 TFDA 食品成分資料庫」在 nutrition.db 裡
══════════════════════════════════════════════════════════════════════
為什麼需要這支：
    `.gitignore` 排除了 `backend/data/*.db` 與 `backend/data/*.json`，
    所以 TFDA 那 2181 筆中文食品資料從來沒有進過 repo、也沒進過映像檔。
    正式環境實測 `/api/nutrition/sql/search?q=a&mode=like` → 0 筆，
    表示 food_items 是空表；中文搜尋只能落到
    「GoogleTranslator → 美國 USDA API」這條路，回來的是
    「Eggs, Grade A, Large, Egg Whole」這種英文罐頭名稱 ——
    對台灣使用者等於沒有食物資料庫。

做法：
    把 `data/tfda_final.json`（381KB，已放行進版控）在後端啟動時匯入。
    · 冪等：已經有 TFDA 資料就跳過，不重複匯、不覆蓋任何使用者資料
    · 相容 schema 差異：只寫該資料庫實際存在的欄位
    · 匯入後重建 FTS5 索引（若該虛擬表存在）
    · 任何失敗都只印訊息、不擋後端啟動
"""

import json
import os
import sqlite3

import core.nutrition_db as nutrition_db

SEED_FILENAME = "tfda_final.json"

# 這些欄位若資料庫有就寫，沒有就略過（正式環境 schema 可能較舊/較新）
_FIELD_ORDER = [
    "name", "calories", "protein", "carbs", "fats",
    "fiber", "serving_size_g", "source", "is_tfda",
]


def _seed_path():
    return os.path.join(nutrition_db.DATA_DIR, SEED_FILENAME)


def _load_items():
    path = _seed_path()
    if not os.path.exists(path):
        return None, f"找不到種子檔 {path}"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("data", []) if isinstance(data, dict) else data
    if not isinstance(items, list) or not items:
        return None, "種子檔內容不是非空清單"
    return items, None


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def seed_tfda(force=False):
    """把 TFDA 資料補進 food_items。回傳一句可直接印出的結果描述。"""
    items, err = _load_items()
    if err:
        return f"跳過（{err}）"

    nutrition_db.init_db()  # 確保 food_items / FTS / 觸發器都在
    conn = nutrition_db.get_db_connection()
    c = conn.cursor()
    try:
        cols = {row[1] for row in c.execute("PRAGMA table_info(food_items)")}
        if "name" not in cols:
            return "跳過（food_items 沒有 name 欄位，schema 不符）"

        c.execute("SELECT COUNT(*) FROM food_items WHERE is_tfda = 1"
                  if "is_tfda" in cols else "SELECT COUNT(*) FROM food_items")
        existing_tfda = c.fetchone()[0]
        if existing_tfda >= len(items) * 0.9 and not force:
            return f"已存在 {existing_tfda} 筆，無需匯入"

        # 已有資料時以（名稱, 熱量）去重 —— TFDA 本來就有同名不同值的樣品
        # （例如多筆「鯖魚」），只用名稱去重會把正常的變體吃掉。
        seen = set()
        if existing_tfda:
            for row in c.execute("SELECT name, calories FROM food_items"):
                seen.add((row[0], int(_num(row[1]))))

        write_cols = [f for f in _FIELD_ORDER if f in cols]
        sql = "INSERT INTO food_items ({}) VALUES ({})".format(
            ", ".join(write_cols), ", ".join("?" for _ in write_cols)
        )

        rows = []
        for it in items:
            name = (it.get("name") or it.get("樣品名稱") or "").strip()
            if not name:
                continue
            record = {
                "name": name,
                "calories": int(_num(it.get("calories") or it.get("熱量(kcal)"))),
                "protein": _num(it.get("protein") or it.get("粗蛋白(g)")),
                "carbs": _num(it.get("carbs") or it.get("總碳水化合物(g)")),
                "fats": _num(it.get("fats") or it.get("粗脂肪(g)")),
                "fiber": _num(it.get("fiber") or it.get("膳食纖維(g)")),
                "serving_size_g": 100,   # TFDA 成分表一律以每 100g 計
                "source": "tfda",
                "is_tfda": 1,
            }
            key = (record["name"], record["calories"])
            if key in seen:
                continue
            seen.add(key)
            rows.append(tuple(record[k] for k in write_cols))

        if not rows:
            return f"已存在 {existing_tfda} 筆，沒有新資料可補"

        c.executemany(sql, rows)
        conn.commit()

        # FTS5 外部內容索引：觸發器只對「之後」的寫入有效，
        # 這裡直接重建一次，確保剛匯入的資料搜得到。
        try:
            c.execute("SELECT name FROM sqlite_master WHERE name = 'food_items_fts'")
            if c.fetchone():
                c.execute("INSERT INTO food_items_fts(food_items_fts) VALUES('rebuild')")
                conn.commit()
        except sqlite3.Error as e:
            print(f"[tfda_seed] FTS 重建略過：{e}")

        c.execute("SELECT COUNT(*) FROM food_items")
        total = c.fetchone()[0]
        return f"匯入 {len(rows)} 筆 TFDA 食品，food_items 共 {total} 筆"
    finally:
        conn.close()


if __name__ == "__main__":  # 手動執行：python -m core.tfda_seed
    print(seed_tfda())
