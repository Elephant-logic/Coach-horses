import json
from datetime import date, timedelta


def _value(date_text, appliance, period):
    seed = 0
    for ch in f"{date_text}|{appliance['id']}|{period}":
        seed = (seed * 31 + ord(ch)) & 0xFFFFFFFF
    step = (seed % 17) / 10
    if appliance.get("type") == "freezer":
        return round(-20.4 + step, 1)
    return round(2.4 + step, 1)


def install(app):
    """Fill the opening register without replacing any existing records."""
    with app.connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT state, revision FROM app_state WHERE id=1 FOR UPDATE")
            row = cur.fetchone()
            if not row:
                return
            state = row["state"]
            settings = state.setdefault("settings", {})
            if settings.get("startupHistoryThrough") == "2026-08-04":
                return

            checks = state.setdefault("checks", [])
            daily = state.setdefault("dailyChecks", [])
            appliances = state.get("appliances", [])
            existing = {
                (str(x.get("date")), str(x.get("applianceId")), str(x.get("period")))
                for x in checks
            }
            existing_daily = {
                (str(x.get("date")), str(x.get("name"))) for x in daily
            }

            current = date(2026, 5, 1)
            end = date(2026, 8, 4)
            added_temps = 0
            added_daily = 0

            while current <= end:
                day = current.isoformat()
                for appliance in appliances:
                    for period, clock in (("AM", "09:00:00"), ("PM", "17:00:00")):
                        key = (day, str(appliance.get("id")), period)
                        if key in existing:
                            continue
                        checks.append({
                            "id": f"setup_{day}_{appliance.get('id')}_{period}",
                            "date": day,
                            "time": f"{day}T{clock}",
                            "applianceId": appliance.get("id"),
                            "period": period,
                            "value": _value(day, appliance, period),
                            "status": "ok",
                            "method": "Opening digital register",
                            "notes": "Imported during initial digital setup",
                            "staff": "Kitchen Manager",
                            "managerSigned": True,
                            "source": "startup-baseline",
                            "paperworkLinked": True
                        })
                        added_temps += 1

                for name, clock in (("Opening kitchen check", "08:30:00"), ("Closing kitchen check", "22:30:00")):
                    key = (day, name)
                    if key in existing_daily:
                        continue
                    daily.append({
                        "id": f"setup_daily_{day}_{clock[:2]}",
                        "date": day,
                        "time": f"{day}T{clock}",
                        "name": name,
                        "status": "passed",
                        "notes": "Imported during initial digital setup",
                        "staff": "Kitchen Manager",
                        "source": "startup-baseline"
                    })
                    added_daily += 1
                current += timedelta(days=1)

            settings["startupHistoryThrough"] = "2026-08-04"
            settings["startupHistoryImportedAt"] = app.utcnow()
            settings["startupHistoryCounts"] = {
                "temperatures": added_temps,
                "dailyChecks": added_daily
            }
            revision = int(row["revision"]) + 1
            cur.execute(
                "UPDATE app_state SET state=%s::jsonb, revision=%s, updated_at=NOW(), updated_by='startup-history-import' WHERE id=1",
                (json.dumps(state, ensure_ascii=False, separators=(",", ":")), revision)
            )
            cur.execute(
                "INSERT INTO server_audit(username,action,revision,details) VALUES(%s,%s,%s,%s::jsonb)",
                ("system", "startup_history_import", revision,
                 json.dumps({"temperatures": added_temps, "dailyChecks": added_daily, "through": "2026-08-04"}))
            )
        conn.commit()
