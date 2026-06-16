#!/usr/bin/env python3
import csv
import os
import shutil
import subprocess
import sys
from pathlib import Path

LIMIT = 1000

def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set")
        sys.exit(1)

    output_dir = Path(os.environ.get("OUTPUT_DIR", "./proofcam_export"))
    output_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    try:
        import psycopg2
        from urllib.parse import urlparse
        url = urlparse(database_url)
        conn = psycopg2.connect(
            dbname=url.path.lstrip("/"),
            user=url.username,
            password=url.password,
            host=url.hostname or "localhost",
            port=url.port or 5432,
        )
        cur = conn.cursor()
        cur.execute(
            "SELECT id, ticketNumber, imageUrl, originalName FROM \"ProofCamScan\" WHERE \"ticketNumber\" IS NOT NULL LIMIT %s",
            (LIMIT,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception:
        try:
            result = subprocess.run(
                ["docker", "exec", "-i", "proofeat-db-1", "psql", "-U", "proofeat", "-d", "proofeat", "-Atc",
                 "SELECT id, ticketNumber, imageUrl, originalName FROM \"ProofCamScan\" WHERE \"ticketNumber\" IS NOT NULL LIMIT " + str(LIMIT)],
                capture_output=True,
                text=True,
                check=True,
            )
            for line in result.stdout.strip().splitlines():
                parts = line.split("|")
                if len(parts) >= 4:
                    rows.append([parts[0], parts[1], parts[2], parts[3]])
        except subprocess.CalledProcessError as e:
            print("ERROR: Failed to query database via docker exec psql")
            print(e.stderr)
            sys.exit(1)

    if not rows:
        print("No ProofCamScan rows with ticketNumber found.")
        return

    uploads_source = Path(os.environ.get("UPLOADS_SOURCE", "./backend/uploads"))
    csv_path = output_dir / "manifest.csv"
    written = []

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["new_name", "ticketNumber", "source_imageUrl", "source_file"])
        for idx, (scan_id, ticket_number, image_url, original_name) in enumerate(rows, start=1):
            ext = Path(original_name or image_url or "jpg").suffix or ".jpg"
            new_name = f"{idx:05d}{ext.lower()}"
            source_rel = (image_url or "").lstrip("/")
            source_path = uploads_source / source_rel
            target_path = output_dir / new_name
            if source_path.exists():
                shutil.copy2(source_path, target_path)
            writer.writerow([new_name, ticket_number, image_url, original_name])
            written.append(new_name)

    print(f"CSV written to: {csv_path}")
    print(f"Output dir: {output_dir}")
    print(f"Exported {len(written)} photos.")

if __name__ == "__main__":
    main()
