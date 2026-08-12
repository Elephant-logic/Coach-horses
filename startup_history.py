import json


def _without_startup_baseline(rows):
    if not isinstance(rows, list):
        return rows, 0
    kept = [row for row in rows if not (isinstance(row, dict) and row.get("source") == "startup-baseline")]
    return kept, len(rows) - len(kept)


def install(app):
    """Remove only the old generated startup-baseline records.

    Real readings, manager back-fills, historic imports and all other kitchen
    records are preserved. This migration is intentionally source-based rather
    than date/value-based so genuine records can never be mistaken for the
    generated baseline.
    """
    with app.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT state, revision FROM app_state WHERE id=1 FOR UPDATE")
            row = cur.fetchone()
            if not row:
                return

            state = row["state"]
            settings = state.setdefault("settings", {})
            if settings.get("startupBaselineRemoved") is True:
                return

            removed = {}
            for key in ("checks", "dailyChecks", "tempReadings", "dailyCheckHistory"):
                cleaned, count = _without_startup_baseline(state.get(key, []))
                if isinstance(state.get(key, []), list):
                    state[key] = cleaned
                removed[key] = count

            # These markers belonged to the generated baseline and must not cause
            # the browser migration to reconstruct it again.
            settings.pop("startupHistoryThrough", None)
            settings.pop("startupHistoryImportedAt", None)
            settings.pop("startupHistoryCounts", None)
            settings["startupBaselineRemoved"] = True
            settings["startupBaselineRemovedAt"] = app.utcnow()

            total_removed = sum(removed.values())
            revision = int(row["revision"]) + 1
            cur.execute(
                "UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by='startup-baseline-cleanup' WHERE id=1",
                (json.dumps(state, ensure_ascii=False, separators=(",", ":")), revision),
            )
            cur.execute(
                "INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)",
                (
                    "system",
                    "remove_startup_baseline",
                    revision,
                    json.dumps({"removed": removed, "total_removed": total_removed}),
                ),
            )
        conn.commit()

    print(f"Removed {total_removed} generated startup-baseline history records; genuine records preserved")
