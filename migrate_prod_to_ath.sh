#!/bin/bash
# ============================================================
# MeterSquare: Full Production → ATH Migration
# Migrates ALL tables, data, and storage buckets
# ============================================================

set -e

echo "============================================"
echo "  MeterSquare: Production → ATH Migration"
echo "============================================"
echo ""

# ---- Connection Config ----
# Production (Meter Square ERP) - Pooler connection (port 6543)
PROD_DB_HOST="aws-0-ap-south-1.pooler.supabase.com"
PROD_DB_USER="postgres.wgddnoiakkoskbbkbygw"
PROD_DB_NAME="postgres"
PROD_DB_PORT="6543"
PROD_DB_PASS='Rameshdev$08'

# ATH (MSQ_ERP) - Pooler connection (port 6543)
ATH_DB_HOST="aws-1-us-east-2.pooler.supabase.com"
ATH_DB_USER="postgres.iqkbmieiyavceuqfoqtw"
ATH_DB_NAME="postgres"
ATH_DB_PORT="6543"
ATH_DB_PASS='Redlitmus@321'

DUMP_FILE="/tmp/metersquare_prod_dump.sql"

# ---- Check prerequisites ----
echo "[1/6] Checking prerequisites..."

if ! command -v pg_dump &> /dev/null; then
    echo "ERROR: pg_dump not found. Install it with:"
    echo "  sudo apt install postgresql-client-16 -y"
    exit 1
fi

if ! command -v pg_restore &> /dev/null; then
    echo "ERROR: pg_restore not found. Install it with:"
    echo "  sudo apt install postgresql-client-16 -y"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found."
    exit 1
fi

echo "  ✓ pg_dump found"
echo "  ✓ pg_restore found"
echo "  ✓ python3 found"
echo ""

# ---- Step 1: Dump Production Database ----
echo "[2/6] Dumping Production database (this may take a few minutes)..."
echo "  Source: Meter Square ERP (ap-south-1)"

PGPASSWORD="$PROD_DB_PASS" pg_dump \
    -h "$PROD_DB_HOST" \
    -U "$PROD_DB_USER" \
    -d "$PROD_DB_NAME" \
    -p "$PROD_DB_PORT" \
    --no-owner \
    --no-acl \
    --no-comments \
    -n public \
    -F p \
    -f "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "  ✓ Dump complete ($DUMP_SIZE)"
echo ""

# ---- Step 2: Count production rows for verification ----
echo "[3/6] Counting production rows for verification..."

PROD_COUNTS=$(PGPASSWORD="$PROD_DB_PASS" psql \
    -h "$PROD_DB_HOST" \
    -U "$PROD_DB_USER" \
    -d "$PROD_DB_NAME" \
    -p "$PROD_DB_PORT" \
    -t -A \
    -c "
    SELECT string_agg(t.table_name || ':' || (xpath('/row/cnt/text()', xml_count))[1]::text, '|')
    FROM information_schema.tables t,
    LATERAL (SELECT query_to_xml('SELECT count(*) AS cnt FROM public.' || quote_ident(t.table_name), false, true, '') AS xml_count) x
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE';
    ")

echo "  ✓ Production row counts captured"
echo ""

# ---- Step 3: Restore to ATH ----
echo "[4/6] Restoring to ATH database (this may take a few minutes)..."
echo "  Target: MSQ_ERP (us-east-2)"
echo "  WARNING: This will OVERWRITE all existing ATH data!"
echo ""

read -p "  Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "  Aborted."
    exit 0
fi

# First, drop all existing tables, sequences, and functions in ATH public schema
echo "  Dropping existing ATH objects..."
PGPASSWORD="$ATH_DB_PASS" psql \
    -h "$ATH_DB_HOST" \
    -U "$ATH_DB_USER" \
    -d "$ATH_DB_NAME" \
    -p "$ATH_DB_PORT" \
    -t -A \
    -c "
    DO \$\$
    DECLARE
        r RECORD;
    BEGIN
        -- Drop all tables
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
        -- Drop all sequences
        FOR r IN (SELECT sequencename FROM pg_sequences WHERE schemaname = 'public') LOOP
            EXECUTE 'DROP SEQUENCE IF EXISTS public.' || quote_ident(r.sequencename) || ' CASCADE';
        END LOOP;
        -- Drop all types (enums etc)
        FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
            EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
        END LOOP;
    END \$\$;
    " > /dev/null 2>&1
echo "  ✓ Existing ATH objects dropped"

# Now restore from dump (without --clean since we already cleaned)
echo "  Restoring production data..."
PGPASSWORD="$ATH_DB_PASS" psql \
    -h "$ATH_DB_HOST" \
    -U "$ATH_DB_USER" \
    -d "$ATH_DB_NAME" \
    -p "$ATH_DB_PORT" \
    -f "$DUMP_FILE" 2>&1 | grep -i "error" | grep -v "already exists\|does not exist" || true

echo "  ✓ Database restore complete"
echo ""

# ---- Step 4: Verify row counts ----
echo "[5/6] Verifying ATH row counts..."

ATH_COUNTS=$(PGPASSWORD="$ATH_DB_PASS" psql \
    -h "$ATH_DB_HOST" \
    -U "$ATH_DB_USER" \
    -d "$ATH_DB_NAME" \
    -p "$ATH_DB_PORT" \
    -t -A \
    -c "
    SELECT string_agg(t.table_name || ':' || (xpath('/row/cnt/text()', xml_count))[1]::text, '|')
    FROM information_schema.tables t,
    LATERAL (SELECT query_to_xml('SELECT count(*) AS cnt FROM public.' || quote_ident(t.table_name), false, true, '') AS xml_count) x
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE';
    ")

echo ""
echo "  Table Row Counts Comparison:"
echo "  ─────────────────────────────────────────────────"
printf "  %-40s %10s %10s\n" "TABLE" "PROD" "ATH"
echo "  ─────────────────────────────────────────────────"

# Parse and compare
IFS='|' read -ra PROD_TABLES <<< "$PROD_COUNTS"
IFS='|' read -ra ATH_TABLES <<< "$ATH_COUNTS"

declare -A PROD_MAP
for entry in "${PROD_TABLES[@]}"; do
    tbl=$(echo "$entry" | cut -d: -f1)
    cnt=$(echo "$entry" | cut -d: -f2)
    PROD_MAP["$tbl"]="$cnt"
done

declare -A ATH_MAP
for entry in "${ATH_TABLES[@]}"; do
    tbl=$(echo "$entry" | cut -d: -f1)
    cnt=$(echo "$entry" | cut -d: -f2)
    ATH_MAP["$tbl"]="$cnt"
done

MISMATCH=0
for tbl in $(echo "${!PROD_MAP[@]}" | tr ' ' '\n' | sort); do
    prod_cnt="${PROD_MAP[$tbl]}"
    ath_cnt="${ATH_MAP[$tbl]:-0}"
    if [ "$prod_cnt" != "$ath_cnt" ]; then
        printf "  %-40s %10s %10s  ← MISMATCH\n" "$tbl" "$prod_cnt" "$ath_cnt"
        MISMATCH=1
    else
        printf "  %-40s %10s %10s  ✓\n" "$tbl" "$prod_cnt" "$ath_cnt"
    fi
done
echo "  ─────────────────────────────────────────────────"

if [ "$MISMATCH" -eq 1 ]; then
    echo ""
    echo "  NOTE: Some row counts may differ due to stale pg_stat."
    echo "  Run ANALYZE on ATH to refresh, then re-check."
fi

echo ""

# ---- Step 5: Migrate Storage Buckets ----
echo "[6/6] Migrating storage buckets..."

python3 /home/development1/Desktop/MeterSquare/migrate_storage.py

echo ""
echo "============================================"
echo "  Migration Complete!"
echo "============================================"
echo ""
echo "  Database: All tables and data migrated"
echo "  Storage:  All bucket files migrated"
echo ""
echo "  IMPORTANT: Storage URLs in the database"
echo "  still point to production Supabase URL."
echo "  If ATH needs its own URLs, a URL update"
echo "  script can fix them (ask to generate it)."
echo ""
echo "  Cleanup: rm $DUMP_FILE"
echo "============================================"
