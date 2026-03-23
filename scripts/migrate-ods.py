"""One-time migration: convert ODS spreadsheet to JSON data files."""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}


def extract_rows(table):
    rows = table.findall(".//table:table-row", NS)
    result = []
    for row in rows:
        cells = row.findall("table:table-cell", NS)
        vals = []
        for cell in cells:
            repeat = cell.get(
                "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated"
            )
            txt = ""
            for p in cell.findall(".//text:p", NS):
                txt += p.text or ""
            if repeat and int(repeat) > 5 and not txt:
                continue
            vals.append(txt.strip())
        result.append(vals)
    return result


def parse_cost(val: str) -> int:
    cleaned = val.replace("kr.", "").replace(",", "").replace(".", "").strip()
    try:
        return int(cleaned)
    except ValueError:
        return 0


def parse_km(val: str) -> int | None:
    val = val.strip().replace("-", "")
    try:
        return int(val) if val else None
    except ValueError:
        return None


def migrate_plan(rows):
    events = []
    counter = 1
    for row in rows[2:]:  # skip title and header
        if not any(v for v in row):
            continue
        if len(row) < 2:
            continue

        km_raw = row[0] if len(row) > 0 else ""
        date = row[1] if len(row) > 1 else ""
        event = row[2] if len(row) > 2 else ""
        cost_raw = row[3] if len(row) > 3 else ""
        provider = row[4] if len(row) > 4 else ""
        notes = row[5] if len(row) > 5 else ""
        status_raw = row[6] if len(row) > 6 else ""
        invoice = row[7] if len(row) > 7 else ""

        if not event:
            continue

        status_map = {
            "Done": "done",
            "Scheduled": "scheduled",
            "Pending": "pending",
            "Future": "future",
        }

        events.append(
            {
                "id": f"evt_{counter:03d}",
                "km": parse_km(km_raw),
                "date": date,
                "event": event,
                "cost": parse_cost(cost_raw),
                "currency": "DKK",
                "provider": provider,
                "notes": notes,
                "status": status_map.get(status_raw, "done"),
                "invoiceNr": invoice,
            }
        )
        counter += 1

    return {"events": events}


def migrate_idrive(rows):
    records = []
    for row in rows[1:]:  # skip header
        if len(row) < 5 or not row[1]:
            continue
        records.append(
            {
                "status": row[0],
                "date": row[1],
                "km": int(row[2]) if row[2].isdigit() else 0,
                "serviceNr": row[3],
                "event": row[4],
            }
        )
    return {"records": records}


def migrate_parts(rows):
    parts = []
    counter = 1
    for row in rows[2:]:  # skip title and header
        if not any(v for v in row):
            continue
        if len(row) < 2 or not row[0]:
            continue

        parts.append(
            {
                "id": f"part_{counter:03d}",
                "name": row[0] if len(row) > 0 else "",
                "oemPartNr": row[1] if len(row) > 1 else "",
                "brand": row[2] if len(row) > 2 else "",
                "supplierStatus": row[3] if len(row) > 3 else "",
                "partNr": row[4] if len(row) > 4 else "",
                "source": row[5] if len(row) > 5 else "",
                "price": parse_cost(row[6]) if len(row) > 6 else 0,
                "currency": "DKK",
                "notes": row[7] if len(row) > 7 else "",
            }
        )
        counter += 1

    return {"parts": parts}


def main():
    ods_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not ods_path:
        print("Usage: python migrate-ods.py <path-to-ods-file>")
        sys.exit(1)

    output_dir = Path(__file__).parent.parent / "static" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)

    with ZipFile(ods_path) as z:
        content_xml = z.read("content.xml").decode("utf-8")

    root = ET.fromstring(content_xml)
    body = root.find(".//office:body/office:spreadsheet", NS)
    tables = body.findall("table:table", NS)

    sheets = {}
    for t in tables:
        name = t.get("{urn:oasis:names:tc:opendocument:xmlns:table:1.0}name")
        sheets[name] = extract_rows(t)

    if "Plan" in sheets:
        events_data = migrate_plan(sheets["Plan"])
        (output_dir / "events.json").write_text(
            json.dumps(events_data, indent=2, ensure_ascii=False) + "\n"
        )
        print(f"Migrated {len(events_data['events'])} events")

    if "iDrive service history" in sheets:
        idrive_data = migrate_idrive(sheets["iDrive service history"])
        (output_dir / "idrive-history.json").write_text(
            json.dumps(idrive_data, indent=2, ensure_ascii=False) + "\n"
        )
        print(f"Migrated {len(idrive_data['records'])} iDrive records")

    if "Part list" in sheets:
        parts_data = migrate_parts(sheets["Part list"])
        (output_dir / "parts.json").write_text(
            json.dumps(parts_data, indent=2, ensure_ascii=False) + "\n"
        )
        print(f"Migrated {len(parts_data['parts'])} parts")

    # Create empty vehicle.json
    vehicle = {"vin": "", "odometer": None, "fuelLevel": None, "lastSynced": None}
    (output_dir / "vehicle.json").write_text(json.dumps(vehicle, indent=2) + "\n")
    print("Created vehicle.json")


if __name__ == "__main__":
    main()
