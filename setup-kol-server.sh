#!/bin/bash
# ================================================================
# MeterSquare — msq.kol.tel Server Setup Script
# Run this ONCE on the server after unzipping the project.
#
# What it does:
#   1. Installs Redis (required for OTP & rate limiting)
#   2. Creates Python venv + installs dependencies
#   3. Installs gunicorn + gevent inside venv
#   4. Stops any old Flask process on port 5000
#   5. Installs + starts systemd service (msq)
#   6. Deploys pre-built frontend/dist/ to /var/www/msq/
#   7. Installs nginx config for msq.kol.tel
#
# Usage (run as root on the server):
#   cd /root/msq
#   bash setup-kol-server.sh
#
# For SUBSEQUENT deployments (after first setup), use:
#   bash deploy.sh kol-zip
# ================================================================

set -e

PROJECT_DIR="/root/msq"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
WEB_ROOT="/var/www/msq"
NGINX_CONF="/etc/nginx/nginx.conf"
NGINX_BACKUP="/etc/nginx/nginx.conf.bak.$(date +%Y%m%d%H%M%S)"

echo ""
echo "================================================"
echo "  MeterSquare msq.kol.tel — Server Setup"
echo "================================================"

# ---------------------------------------------------------------
# STEP 0: Install Redis
# ---------------------------------------------------------------
echo ""
echo "[0/7] Installing Redis server (required for OTP storage & rate limiting)..."
if ! command -v redis-server &>/dev/null; then
    apt-get install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
    echo "  Redis installed and started."
else
    systemctl enable redis-server
    systemctl start redis-server 2>/dev/null || true
    echo "  Redis already installed. Ensured running."
fi
redis-cli ping && echo "  Redis: PONG (OK)" || echo "  WARNING: Redis not responding"
echo "Done."

# ---------------------------------------------------------------
# STEP 1: Install gunicorn + gevent (system pip3)
# ---------------------------------------------------------------
echo ""
echo "[1/7] Installing gunicorn + gevent (system pip3)..."
pip3 install --quiet gunicorn gevent gevent-websocket
echo "  gunicorn: $(gunicorn --version)"
echo "Done."

# ---------------------------------------------------------------
# STEP 2: (skipped — no venv)
# ---------------------------------------------------------------

# ---------------------------------------------------------------
# STEP 3: Install Python dependencies
# ---------------------------------------------------------------
echo ""
echo "[3/7] Installing Python dependencies from requirements.txt..."
cd "$BACKEND_DIR"
pip3 install -r requirements.txt --quiet
echo "Done."

# ---------------------------------------------------------------
# STEP 4: Stop old Flask process (if running)
# ---------------------------------------------------------------
echo ""
echo "[4/7] Stopping old Flask process (python app.py) if running..."

OLD_PID=$(pgrep -f "python.*app.py" || true)
if [ -n "$OLD_PID" ]; then
    echo "  Killing old process PID: $OLD_PID"
    kill "$OLD_PID"
    sleep 2
    echo "  Stopped."
else
    echo "  No old python app.py process found."
fi

# Free port 5000 if something is holding it (other than systemd msq)
if systemctl is-active --quiet msq 2>/dev/null; then
    echo "  msq service already running — will be replaced by restart below."
else
    PORT_PID=$(lsof -ti:5000 || true)
    if [ -n "$PORT_PID" ]; then
        echo "  Freeing port 5000 (PID: $PORT_PID)..."
        kill -9 "$PORT_PID" 2>/dev/null || true
    fi
fi
echo "Done."

# ---------------------------------------------------------------
# STEP 5: Install + start systemd service (msq)
# ---------------------------------------------------------------
echo ""
echo "[5/7] Installing systemd service (msq)..."

cp "$BACKEND_DIR/msq.service" /etc/systemd/system/msq.service
systemctl daemon-reload
systemctl enable msq

# Validate gunicorn config before starting
echo "  Testing Gunicorn config..."
cd "$BACKEND_DIR"
gunicorn --config gunicorn.conf.py --check-config "app:create_app()" && echo "  Config OK."

# Start (or restart if already running)
systemctl restart msq
sleep 3

if systemctl is-active --quiet msq; then
    echo "  msq service is RUNNING."
    systemctl status msq --no-pager -l | head -8
else
    echo "  ERROR: msq service failed to start. Check logs:"
    echo "  journalctl -u msq -n 50 --no-pager"
    exit 1
fi
echo "Done."

# ---------------------------------------------------------------
# STEP 6: Deploy frontend (pre-built dist/ from zip)
# ---------------------------------------------------------------
echo ""
echo "[6/7] Deploying frontend for msq.kol.tel..."

if [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "  ERROR: frontend/dist/ folder not found."
    echo "  Make sure you built the frontend locally (npm run build:production)"
    echo "  and included the dist/ folder in the zip."
    exit 1
fi

mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -r "$FRONTEND_DIR/dist/." "$WEB_ROOT/"
echo "  Frontend deployed to $WEB_ROOT"
echo "Done."

# ---------------------------------------------------------------
# STEP 7: Install nginx config for msq.kol.tel
# ---------------------------------------------------------------
echo ""
echo "[7/7] Updating nginx config (msq.kol.tel only)..."

# Backup current nginx.conf
cp "$NGINX_CONF" "$NGINX_BACKUP"
echo "  Nginx config backed up to: $NGINX_BACKUP"

# Warn if old inline server block exists in main nginx.conf
if grep -q "server_name msq.kol.tel" "$NGINX_CONF"; then
    echo "  NOTE: msq.kol.tel block found in nginx.conf."
    echo "  It will now be managed via /etc/nginx/conf.d/msq-kol.conf instead."
    echo "  After verifying the new config works, manually remove the old"
    echo "  msq.kol.tel server block from $NGINX_CONF."
fi

# Install our config into conf.d — only affects msq.kol.tel
cp "$PROJECT_DIR/nginx-confd-msq-kol.conf" /etc/nginx/conf.d/msq-kol.conf
echo "  Installed: /etc/nginx/conf.d/msq-kol.conf"

# Test and reload nginx
if nginx -t; then
    systemctl reload nginx
    echo "  Nginx reloaded successfully."
else
    echo "  ERROR: Nginx config test failed."
    echo "  Restoring backup..."
    cp "$NGINX_BACKUP" "$NGINX_CONF"
    exit 1
fi

echo ""
echo "================================================"
echo "  Setup complete!"
echo ""
echo "  Verify backend:  curl http://127.0.0.1:5000/api/health"
echo "  Verify public:   https://msq.kol.tel/api/health"
echo ""
echo "  View live logs:  journalctl -u msq -f"
echo "  Restart:         systemctl restart msq"
echo "  Reload (no down):systemctl reload msq"
echo ""
echo "  For future updates (zip-based):"
echo "    bash deploy.sh kol-zip"
echo "================================================"
