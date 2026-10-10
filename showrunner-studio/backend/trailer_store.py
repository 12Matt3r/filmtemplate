"""Single-process studio job snapshots, persisted transactionally in SQLite."""
import json
import sqlite3
import time
from pathlib import Path


class TrailerStore:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / "trailers.sqlite3"
        with self.connect() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS trailers (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, show_id TEXT NOT NULL, body TEXT NOT NULL, updated REAL NOT NULL)")

    def connect(self):
        return sqlite3.connect(self.path, timeout=15)

    def get(self, trailer_id):
        with self.connect() as connection:
            row = connection.execute("SELECT body FROM trailers WHERE id=?", (trailer_id,)).fetchone()
        if row is None:
            raise KeyError(trailer_id)
        return json.loads(row[0])

    def list(self, show_id):
        with self.connect() as connection:
            rows = connection.execute("SELECT body FROM trailers WHERE show_id=? ORDER BY updated DESC LIMIT 50", (show_id,)).fetchall()
        return [json.loads(row[0]) for row in rows]

    def create(self, body):
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute("SELECT body FROM trailers WHERE request_id=?", (body["request_id"],)).fetchone()
            if existing:
                result = json.loads(existing[0])
                if result["plan"] != body["plan"]:
                    raise ValueError("This request ID already belongs to a different shot plan.")
                return result
            connection.execute("INSERT INTO trailers VALUES (?,?,?,?,?)", (body["id"], body["request_id"], body["show_id"], json.dumps(body), time.time()))
        return body

    def mutate(self, trailer_id, change):
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT body FROM trailers WHERE id=?", (trailer_id,)).fetchone()
            if row is None:
                raise KeyError(trailer_id)
            body = json.loads(row[0])
            change(body)
            body["updated_at"] = time.time()
            connection.execute("UPDATE trailers SET body=?, updated=? WHERE id=?", (json.dumps(body), time.time(), trailer_id))
        return body

    def recover(self):
        with self.connect() as connection:
            ids = [r[0] for r in connection.execute("SELECT id FROM trailers")]
        for trailer_id in ids:
            def interrupt(body):
                for shot in body["shots"]:
                    if shot["status"] == "generating":
                        shot["status"] = "interrupted"
                        shot["error"] = "Backend restarted during generation. Check Texel billing before manually retrying."
                    if shot.get("video_status") == "generating":
                        shot["video_status"] = "interrupted"
                        shot["video_error"] = "Backend restarted. Resume the saved video job without generating again." if shot.get("video_job") else "Backend restarted before saving a video job ID. Check Texel billing before generating again."
                if body.get("cloud_render", {}).get("status") == "running":
                    body["cloud_render"].update(status="interrupted", error="Backend restarted. Resume the saved cloud job without submitting again.")
                if body["status"] == "rendering":
                    body["status"] = "error"
                    body["error"] = "Backend restarted during export. You can assemble again without regenerating images."
            self.mutate(trailer_id, interrupt)
