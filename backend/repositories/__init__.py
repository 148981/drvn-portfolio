"""
repositories/ — 倉儲層 (Repository Pattern)
============================================

每個領域一個 repo，是「唯一碰資料庫的地方」。上層 service / 路由只呼叫
repo 的方法，不在乎背後是 SQLite 還是 Postgres。Phase 2 逐領域把 JSON
存取改寫成這裡的 DB 操作。
"""
