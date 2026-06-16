#!/usr/bin/env bash
set -euo pipefail

DB_CONTAINER=proofeat-db-1
UPLOADS_SRC=/var/lib/docker/volumes/proofeat_backend_uploads/_data
WORKDIR=/root/proofeat_export
OUTDIR=$WORKDIR/extracted_images
CSV=$WORKDIR/proofcamscan_images.csv

mkdir -p "$OUTDIR"

docker exec -i "$DB_CONTAINER" psql -U proofeat -d proofeat -At -F $'\t' <<'SQL' > "$WORKDIR/query.tsv"
SELECT id, "ticketNumber", "imageUrl"
FROM "ProofCamScan"
WHERE "ticketNumber" IS NOT NULL
ORDER BY id;
SQL

printf 'new_name,ticketNumber,source_imageUrl,source_file\n' > "$CSV"

idx=1
while IFS=$'\t' read -r id ticket imageurl; do
  srcfile="$UPLOADS_SRC/$(basename "$imageurl")"
  [ -f "$srcfile" ] || continue
  ext="${srcfile##*.}"
  ext="${ext,,}"
  newname=$(printf '%05d.%s' "$idx" "$ext")
  cp -p "$srcfile" "$OUTDIR/$newname"
  printf '%s,%s,%s,%s\n' "$newname" "$ticket" "$imageurl" "$(basename "$srcfile")" >> "$CSV"
  idx=$((idx+1))
done < "$WORKDIR/query.tsv"

echo "$CSV"
echo "$OUTDIR"
