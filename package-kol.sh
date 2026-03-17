#!/bin/bash
# ================================================================
# MeterSquare — Local Packaging Script for msq.kol.tel
#
# Run this on your LOCAL machine (Windows Git Bash / Linux / Mac)
# before sending to the admin for production deployment.
#
# What it does:
#   1. Builds the frontend with production env (msq.kol.tel API URL)
#   2. Creates a clean zip: backend/ + frontend/dist/ + config files
#   3. Excludes: venv/, node_modules/, .env, __pycache__, uploads/
#
# Usage:
#   bash package-kol.sh
#
# Output:
#   msq-kol-YYYY-MM-DD.zip  (in project root, ready to send to admin)
# ================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ZIP_NAME="msq-kol-update.zip"
DIST_DIR="frontend/dist"

echo "====================================="
echo " MeterSquare — Package for kol.tel"
echo " Output: $ZIP_NAME"
echo "====================================="

# ---------------------------------------------------------------
# STEP 1: Build frontend (production mode → msq.kol.tel)
# ---------------------------------------------------------------
echo ""
echo "[1/3] Building frontend (production — msq.kol.tel)..."
cd "$SCRIPT_DIR/frontend"

if [ ! -f "package.json" ]; then
    echo "  ERROR: frontend/package.json not found. Are you in the project root?"
    exit 1
fi

npm install --silent
npm run build:production

if [ ! -d "dist" ]; then
    echo "  ERROR: dist/ folder not created after build. Check vite build errors."
    exit 1
fi

echo "  Frontend built → frontend/dist/"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------
# STEP 2: Validate backend exists
# ---------------------------------------------------------------
echo ""
echo "[2/3] Validating backend..."

REQUIRED_FILES=(
    "backend/app.py"
    "backend/requirements.txt"
    "backend/gunicorn.conf.py"
    "backend/msq.service"
    "nginx-confd-msq-kol.conf"
    "deploy.sh"
    "setup-kol-server.sh"
)

for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "  ERROR: Required file missing: $f"
        exit 1
    fi
done

echo "  All required files present."

# ---------------------------------------------------------------
# STEP 3: Create zip
# Includes: backend/ (no venv/), frontend/dist/, config files
# Excludes: .env, __pycache__, *.pyc, uploads/, node_modules/
# ---------------------------------------------------------------
echo ""
echo "[3/3] Creating zip: $ZIP_NAME ..."

# Remove old zip if it exists
rm -f "$SCRIPT_DIR/$ZIP_NAME"

zip -r "$ZIP_NAME" \
    backend/ \
    frontend/dist/ \
    nginx-confd-msq-kol.conf \
    nginx-confd-msq-ath.conf \
    deploy.sh \
    setup-kol-server.sh \
    setup-ath-server.sh \
    -x "backend/venv/*" \
    -x "backend/__pycache__/*" \
    -x "backend/**/__pycache__/*" \
    -x "backend/*.pyc" \
    -x "backend/**/*.pyc" \
    -x "backend/.env" \
    -x "backend/uploads/*" \
    -x "backend/logs/*" \
    -x "backend/*.log" \
    -x "frontend/dist/.*"

ZIP_SIZE=$(du -sh "$ZIP_NAME" | cut -f1)

echo ""
echo "====================================="
echo " Package ready!"
echo ""
echo " File : $ZIP_NAME"
echo " Size : $ZIP_SIZE"
echo ""
echo " Send this zip to the admin."
echo " Admin runs on server:"
echo "   cd /root"
echo "   unzip -o $ZIP_NAME -d msq"
echo "   cd /root/msq"
echo "   bash deploy.sh kol"
echo "====================================="
