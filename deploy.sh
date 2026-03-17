#!/bin/bash
# ================================================================
# MeterSquare Deployment Script — Both Domains
# Both msq.kol.tel and msq.ath.cx use ZIP-based deployment.
#
# Usage:
#   bash deploy.sh        → deploy BOTH domains (zip-based)
#   bash deploy.sh kol    → deploy only msq.kol.tel (zip-based)
#   bash deploy.sh ath    → deploy only msq.ath.cx  (zip-based)
#
# Before running this on the server:
#   1. Build locally:  bash package-kol.sh  (or package-ath.sh)
#   2. Send zip to admin
#   3. Admin extracts:
#        unzip msq-kol-YYYY-MM-DD.zip -d /root/msq
#        unzip msq-ath-YYYY-MM-DD.zip -d /root/msq-ath
#   4. Run:  bash deploy.sh kol   (or ath / both)
# ================================================================

set -e

PROJECT_ROOT_KOL="/root/msq"
PROJECT_ROOT_ATH="/root/msq-ath"
WEB_ROOT_KOL="/var/www/msq"
WEB_ROOT_ATH="/var/www/msq-ath"

TARGET="${1:-both}"

echo "====================================="
echo " MeterSquare Deployment — $TARGET"
echo "====================================="

# ---------------------------------------------------------------
# STEP 0: Ensure Redis is running
# ---------------------------------------------------------------
echo ""
echo "[0/4] Ensuring Redis is running..."
if ! command -v redis-server &>/dev/null; then
    echo "  Redis not installed — installing..."
    apt-get install -y redis-server
    systemctl enable redis-server
fi
systemctl start redis-server 2>/dev/null || true
redis-cli ping && echo "  Redis: PONG (OK)" || echo "  WARNING: Redis not responding"
echo "Done."

# ---------------------------------------------------------------
# STEP 1: Install Python dependencies
#   kol → venv
#   ath → system pip3
# ---------------------------------------------------------------
echo ""
echo "[1/4] Installing Python dependencies..."

if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    echo "  msq.kol.tel (system pip3)..."
    cd "$PROJECT_ROOT_KOL/backend"
    pip3 install -r requirements.txt --quiet
fi

if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    echo "  msq.ath.cx (system pip3)..."
    cd "$PROJECT_ROOT_ATH/backend"
    pip3 install -r requirements.txt --quiet
fi

echo "Done."

# ---------------------------------------------------------------
# STEP 2: Deploy pre-built frontend (from zip — no npm build on server)
# ---------------------------------------------------------------
echo ""
echo "[2/4] Deploying frontend..."

if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    echo "  msq.kol.tel — copying pre-built dist/..."
    if [ ! -d "$PROJECT_ROOT_KOL/frontend/dist" ]; then
        echo "  ERROR: $PROJECT_ROOT_KOL/frontend/dist/ not found."
        echo "  Run  bash package-kol.sh  locally, then unzip to $PROJECT_ROOT_KOL"
        exit 1
    fi
    mkdir -p "$WEB_ROOT_KOL"
    rm -rf "${WEB_ROOT_KOL:?}"/*
    cp -r "$PROJECT_ROOT_KOL/frontend/dist/." "$WEB_ROOT_KOL/"
    echo "  Deployed to $WEB_ROOT_KOL"
fi

if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    echo "  msq.ath.cx — copying pre-built dist/..."
    if [ ! -d "$PROJECT_ROOT_ATH/frontend/dist" ]; then
        echo "  ERROR: $PROJECT_ROOT_ATH/frontend/dist/ not found."
        echo "  Run  bash package-ath.sh  locally, then unzip to $PROJECT_ROOT_ATH"
        exit 1
    fi
    mkdir -p "$WEB_ROOT_ATH"
    rm -rf "${WEB_ROOT_ATH:?}"/*
    cp -r "$PROJECT_ROOT_ATH/frontend/dist/." "$WEB_ROOT_ATH/"
    echo "  Deployed to $WEB_ROOT_ATH"
fi

# ---------------------------------------------------------------
# STEP 3: Reload Nginx
# ---------------------------------------------------------------
echo ""
echo "[3/4] Reloading Nginx..."
nginx -t && systemctl reload nginx
echo "Done."

# ---------------------------------------------------------------
# STEP 4: Update systemd service + restart backend
# ---------------------------------------------------------------
echo ""
echo "[4/4] Updating service files and restarting backend(s)..."

if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    echo "  Updating msq.service..."
    cp "$PROJECT_ROOT_KOL/backend/msq.service" /etc/systemd/system/msq.service
    systemctl daemon-reload
    echo "  Reloading msq (msq.kol.tel, port 5000)..."
    systemctl reload msq 2>/dev/null || systemctl restart msq
    systemctl status msq --no-pager -l | head -5
fi

if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    echo "  Updating msq-ath.service..."
    cp "$PROJECT_ROOT_ATH/backend/msq-ath.service" /etc/systemd/system/msq-ath.service
    systemctl daemon-reload
    echo "  Reloading msq-ath (msq.ath.cx, port 5050)..."
    systemctl reload msq-ath 2>/dev/null || systemctl restart msq-ath
    systemctl status msq-ath --no-pager -l | head -5
fi

echo ""
echo "====================================="
echo " Deployment complete!"
if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    echo " msq.kol.tel : https://msq.kol.tel/api/health"
fi
if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    echo " msq.ath.cx  : https://msq.ath.cx/api/health"
fi
echo "====================================="
