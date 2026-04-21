"""Optional PostgreSQL storage for scans and history."""

import json
from datetime import datetime
from typing import Any

from config import get_config
from schemas import ScanHistoryItem, ScanResult


_conn = None


def _get_conn():
    global _conn
    config = get_config()
    url = config.get("database_url")
    if not url:
        return None
    try:
        import psycopg2
        if _conn is None or _conn.closed:
            _conn = psycopg2.connect(url)
        return _conn
    except Exception:
        return None


def _init_table():
    c = _get_conn()
    if not c:
        return
    with c.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                scan_id TEXT PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                result JSONB NOT NULL
            )
        """)
    c.commit()


def store(scan_id: str, result: ScanResult) -> None:
    """Store a scan result. No-op if DB not configured."""
    c = _get_conn()
    if not c:
        return
    _init_table()
    data = result.model_dump(mode="json")
    with c.cursor() as cur:
        cur.execute(
            "INSERT INTO scans (scan_id, created_at, result) VALUES (%s, %s, %s) ON CONFLICT (scan_id) DO UPDATE SET created_at = EXCLUDED.created_at, result = EXCLUDED.result",
            (scan_id, result.timestamp, json.dumps(data)),
        )
    c.commit()


def get(scan_id: str) -> ScanResult | None:
    """Load a scan result by id. Returns None if not found or DB unavailable."""
    c = _get_conn()
    if not c:
        return None
    _init_table()
    with c.cursor() as cur:
        cur.execute("SELECT result FROM scans WHERE scan_id = %s", (scan_id,))
        row = cur.fetchone()
    if not row:
        return None
    data = row[0] if isinstance(row[0], dict) else json.loads(row[0])
    return ScanResult.model_validate(data)


def list_recent(limit: int = 50) -> list[ScanHistoryItem]:
    """Return recent scans as history items. Empty if DB unavailable."""
    c = _get_conn()
    if not c:
        return []
    _init_table()
    with c.cursor() as cur:
        cur.execute(
            "SELECT result FROM scans ORDER BY created_at DESC LIMIT %s",
            (limit,),
        )
        rows = cur.fetchall()
    out = []
    for row in rows:
        data = row[0] if isinstance(row[0], dict) else json.loads(row[0])
        r = data
        snap = r.get("snapshot") or {}
        out.append(
            ScanHistoryItem(
                id=r.get("id", ""),
                jobTitle=snap.get("jobTitle", ""),
                companyName=snap.get("companyName", ""),
                trustScore=r.get("trustScore", 0),
                riskLevel=r.get("riskLevel", "medium"),
                timestamp=datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")) if isinstance(r.get("timestamp"), str) else r["timestamp"],
                platform=snap.get("platform", ""),
            )
        )
    return out
