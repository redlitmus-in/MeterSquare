#!/bin/bash
# ================================================================
# MeterSquare Deployment Script — Both Domains
# Deploys msq.kol.tel (production) and msq.ath.cx (staging)
#
# Usage:
#   bash deploy.sh           → deploy both domains
#   bash deploy.sh kol       → deploy only msq.kol.tel
#   bash deploy.sh ath       → deploy only msq.ath.cx
# ================================================================

set -e  # Exit on any error

# ---------------------------------------------------------------
# Server paths — confirmed
# ---------------------------------------------------------------
PROJECT_ROOT_KOL="/root/msq"       # msq.kol.tel project root
PROJECT_ROOT_ATH="/root/msq-ath"   # msq.ath.cx project root
WEB_ROOT_KOL="/var/www/msq"        # msq.kol.tel nginx static files
WEB_ROOT_ATH="/var/www/msq-ath"    # msq.ath.cx nginx static files

TARGET="${1:-both}"   # default: deploy both

echo "====================================="
echo " MeterSquare Deployment — $TARGET"
echo "====================================="

# ---------------------------------------------------------------
# STEP 1: Pull latest code (kol uses git, ath uses zip — skip git for ath)
# ---------------------------------------------------------------
echo ""
echo "[1/5] Pulling latest code..."
if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    echo "  Pulling /root/msq (git)..."
    cd "$PROJECT_ROOT_KOL" && git pull origin main
fi
if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    echo "  msq-ath uses zip deploy — skipping git pull."
    echo "  Make sure you unzipped the latest files to $PROJECT_ROOT_ATH"
fi
echo "Done."

# ---------------------------------------------------------------
# STEP 2: Install Python dependencies
# ---------------------------------------------------------------
echo ""
echo "[2/5] Installing Python dependencies..."
if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    cd "$PROJECT_ROOT_KOL/backend" && source venv/bin/activate && pip install -r requirements.txt --quiet
fi
if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    cd "$PROJECT_ROOT_ATH/backend" && pip3 install -r requirements.txt --quiet
fi
echo "Done."

# ---------------------------------------------------------------
# STEP 3: Build frontend(s)
# ---------------------------------------------------------------
echo ""
echo "[3/5] Building frontend..."

if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    echo "  Building msq.kol.tel (production)..."
    cd "$PROJECT_ROOT_KOL/frontend"
    npm install --silent
    npm run build:production
    sudo mkdir -p "$WEB_ROOT_KOL"
    sudo rm -rf "${WEB_ROOT_KOL:?}"/*
    sudo cp -r "$PROJECT_ROOT_KOL/frontend/dist/." "$WEB_ROOT_KOL/"
    echo "  Deployed to $WEB_ROOT_KOL"
fi

if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    echo "  Deploying msq.ath.cx frontend (pre-built dist from zip)..."
    if [ ! -d "$PROJECT_ROOT_ATH/frontend/dist" ]; then
        echo "  ERROR: frontend/dist/ not found. Include dist/ in the zip."
        exit 1
    fi
    sudo mkdir -p "$WEB_ROOT_ATH"
    sudo rm -rf "${WEB_ROOT_ATH:?}"/*
    sudo cp -r "$PROJECT_ROOT_ATH/frontend/dist/." "$WEB_ROOT_ATH/"
    echo "  Deployed to $WEB_ROOT_ATH"
fi

# ---------------------------------------------------------------
# STEP 4: Reload nginx
# ---------------------------------------------------------------
echo ""
echo "[4/5] Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx
echo "Done."

# ---------------------------------------------------------------
# STEP 5: Restart backend service(s)
# ---------------------------------------------------------------
echo ""
echo "[5/5] Restarting backend(s)..."

if [[ "$TARGET" == "both" || "$TARGET" == "kol" ]]; then
    echo "  Reloading msq (msq.kol.tel, port 5000)..."
    sudo systemctl reload msq 2>/dev/null || sudo systemctl restart msq
    sudo systemctl status msq --no-pager -l | head -5
fi

if [[ "$TARGET" == "both" || "$TARGET" == "ath" ]]; then
    echo "  Reloading msq-ath (msq.ath.cx, port 5050)..."
    sudo systemctl reload msq-ath 2>/dev/null || sudo systemctl restart msq-ath
    sudo systemctl status msq-ath --no-pager -l | head -5
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
