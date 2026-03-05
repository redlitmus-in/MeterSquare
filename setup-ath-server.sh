#!/bin/bash
# ================================================================
# MeterSquare — msq.ath.cx Server Setup Script
# Run this ONCE on the server after unzipping the project.
#
# What it does:
#   1. Installs gunicorn + gevent (system Python, no venv)
#   2. Installs the systemd service (msq-ath)
#   3. Stops the old python app.py process
#   4. Starts Gunicorn via systemd (auto-restart on crash/reboot)
#   5. Builds + deploys the frontend static files
#   6. Updates nginx config for msq.ath.cx
#
# Usage (run as root on the server):
#   cd /root/msq-ath
#   bash setup-ath-server.sh
# ================================================================

set -e

PROJECT_DIR="/root/msq-ath"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
WEB_ROOT="/var/www/msq-ath"
NGINX_CONF="/etc/nginx/nginx.conf"
NGINX_BACKUP="/etc/nginx/nginx.conf.bak.$(date +%Y%m%d%H%M%S)"

echo ""
echo "================================================"
echo "  MeterSquare msq.ath.cx — Server Setup"
echo "================================================"

# ---------------------------------------------------------------
# STEP 1: Install gunicorn + gevent (system Python)
# ---------------------------------------------------------------
echo ""
echo "[1/6] Installing gunicorn + gevent..."
pip3 install gunicorn gevent gevent-websocket --quiet
echo "  gunicorn: $(gunicorn --version)"
echo "Done."

# ---------------------------------------------------------------
# STEP 2: Install Python dependencies
# ---------------------------------------------------------------
echo ""
echo "[2/6] Installing Python dependencies..."
cd "$BACKEND_DIR"
pip3 install -r requirements.txt --quiet
echo "Done."

# ---------------------------------------------------------------
# STEP 3: Stop old python app.py process (if running)
# ---------------------------------------------------------------
echo ""
echo "[3/6] Stopping old Flask process (python app.py)..."
# Find and kill any python process running app.py on port 5050
OLD_PID=$(pgrep -f "python.*app.py" || true)
if [ -n "$OLD_PID" ]; then
    echo "  Killing old process PID: $OLD_PID"
    kill "$OLD_PID"
    sleep 2
    echo "  Stopped."
else
    echo "  No old python app.py process found."
fi

# Also free port 5050 if something is holding it
PORT_PID=$(lsof -ti:5050 || true)
if [ -n "$PORT_PID" ]; then
    echo "  Freeing port 5050 (PID: $PORT_PID)..."
    kill -9 "$PORT_PID" 2>/dev/null || true
fi
echo "Done."

# ---------------------------------------------------------------
# STEP 4: Install + start systemd service
# ---------------------------------------------------------------
echo ""
echo "[4/6] Installing systemd service (msq-ath)..."
cp "$BACKEND_DIR/msq-ath.service" /etc/systemd/system/msq-ath.service
systemctl daemon-reload
systemctl enable msq-ath

# Test gunicorn starts correctly before enabling as service
echo "  Testing Gunicorn config..."
cd "$BACKEND_DIR"
gunicorn --config gunicorn-ath.conf.py --check-config "app:create_app()" && echo "  Config OK."

systemctl start msq-ath
sleep 3

# Verify it's running
if systemctl is-active --quiet msq-ath; then
    echo "  msq-ath service is RUNNING."
    systemctl status msq-ath --no-pager -l | head -8
else
    echo "  ERROR: msq-ath service failed to start. Check logs:"
    echo "  journalctl -u msq-ath -n 50 --no-pager"
    exit 1
fi
echo "Done."

# ---------------------------------------------------------------
# STEP 5: Deploy frontend (pre-built dist/ from zip)
# ---------------------------------------------------------------
echo ""
echo "[5/6] Deploying frontend for msq.ath.cx..."

# Frontend is already built locally and included as dist/ in the zip
# No npm build needed on the server
if [ ! -d "$FRONTEND_DIR/dist" ]; then
    echo "  ERROR: frontend/dist/ folder not found in zip."
    echo "  Please make sure you built the frontend locally and included dist/ in the zip."
    exit 1
fi

mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*
cp -r "$FRONTEND_DIR/dist/." "$WEB_ROOT/"
echo "  Frontend deployed to $WEB_ROOT"
echo "Done."

# ---------------------------------------------------------------
# STEP 6: Update nginx — ONLY msq.ath.cx (does NOT touch other apps)
# Uses /etc/nginx/conf.d/ so each domain has its own file
# ---------------------------------------------------------------
echo ""
echo "[6/6] Updating nginx config (msq.ath.cx only)..."

# Backup current nginx.conf
cp "$NGINX_CONF" "$NGINX_BACKUP"
echo "  Nginx config backed up to: $NGINX_BACKUP"

# Remove old msq.ath.cx block from main nginx.conf if present
# (we move it to conf.d so it's managed independently)
if grep -q "server_name msq.ath.cx" "$NGINX_CONF"; then
    echo "  Note: msq.ath.cx block found in nginx.conf."
    echo "  It will now be managed via /etc/nginx/conf.d/msq-ath.conf instead."
    echo "  Please manually remove the msq.ath.cx server block from $NGINX_CONF"
    echo "  after verifying the new conf.d file works."
fi

# Drop our config into conf.d — only msq.ath.cx, nothing else affected
cp "$PROJECT_DIR/nginx-confd-msq-ath.conf" /etc/nginx/conf.d/msq-ath.conf
echo "  Installed: /etc/nginx/conf.d/msq-ath.conf"

# Test and reload
if nginx -t; then
    systemctl reload nginx
    echo "  Nginx reloaded successfully."
else
    echo "  ERROR: Nginx config test failed. Check above for errors."
    echo "  Restoring backup..."
    cp "$NGINX_BACKUP" "$NGINX_CONF"
    exit 1
fi

echo ""
echo "================================================"
echo "  Setup complete!"
echo ""
echo "  Verify backend:  curl http://127.0.0.1:5050/api/health"
echo "  Verify public:   https://msq.ath.cx/api/health"
echo ""
echo "  View live logs:  journalctl -u msq-ath -f"
echo "  Restart:         systemctl restart msq-ath"
echo "  Reload (no down):systemctl reload msq-ath"
echo "================================================"
