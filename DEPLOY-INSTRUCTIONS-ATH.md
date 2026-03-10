# MeterSquare msq.ath.cx — Admin Guide

================================================================
  SERVER IS NOW RUNNING GUNICORN (Production Server)
  - 5 workers, auto-restart on crash and reboot
  - Frontend: static files served by nginx
  - Backend: Gunicorn on port 5050 (managed by systemd)
================================================================


================================================================
  SECTION 1 — FIRST TIME SETUP (Run once only)
================================================================

This section is only needed when setting up the server from scratch.
If the server is already running, skip to Section 2 or 3.

----------------------------------------------------------------
STEP 1 — SSH into server
----------------------------------------------------------------

  ssh root@<server-ip>


----------------------------------------------------------------
STEP 2 — Backup current project
----------------------------------------------------------------

  cp -r /root/msq-ath /root/msq-ath-backup-$(date +%Y%m%d)


----------------------------------------------------------------
STEP 3 — Upload and unzip new project files
----------------------------------------------------------------

  cd /root
  unzip -o metersquare.zip -d msq-ath

  NOTE: Your .env file will NOT be touched (not in the zip)


----------------------------------------------------------------
STEP 4 — Run setup script (first time only)
----------------------------------------------------------------

  cd /root/msq-ath
  bash setup-ath-server.sh

  Wait for: "Setup complete!" before continuing.


----------------------------------------------------------------
STEP 5 — Replace nginx config
----------------------------------------------------------------

  cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
  cp /root/msq-ath/nginx.conf /etc/nginx/nginx.conf
  rm -f /etc/nginx/conf.d/msq-ath.conf
  nginx -t && systemctl reload nginx

  MUST SEE: "nginx: configuration file test is successful"
  IF ERROR: Restore backup → cp /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf


----------------------------------------------------------------
STEP 6 — Health Check
----------------------------------------------------------------

  systemctl status msq-ath
  curl http://127.0.0.1:5050/api/health
  curl https://msq.ath.cx/api/health

  All three must succeed. Then open https://msq.ath.cx in browser.


================================================================
  SECTION 2 — FUTURE UPDATES (Backend or Frontend code changes)
================================================================

This is the process for every update after the first setup.

----------------------------------------------------------------
For BACKEND file changes (Python files)
----------------------------------------------------------------

  1. Send the changed file(s) to admin
  2. Admin copies the file to server:

       cp /root/msq-ath/backend/<path/to/file> /root/msq-ath/backend/<path/to/file>

  3. Admin restarts the backend:

       systemctl restart msq-ath

  4. Verify it is running:

       systemctl status msq-ath

  That's it. Changes are live immediately.


----------------------------------------------------------------
For FRONTEND changes (React/UI changes)
----------------------------------------------------------------

  1. Developer builds the frontend locally:

       cd frontend && npm run build:staging

  2. Include the frontend/dist/ folder in the zip
  3. Admin unzips and copies:

       unzip -o msq-ath-update.zip -d /root/msq-ath
       cp -r /root/msq-ath/frontend/dist/. /var/www/msq-ath/

  4. Hard refresh in browser: Ctrl+Shift+R


----------------------------------------------------------------
For FULL UPDATE (Backend + Frontend together)
----------------------------------------------------------------

  cd /root
  unzip -o msq-ath-update.zip -d msq-ath
  cd /root/msq-ath
  bash deploy.sh ath


================================================================
  SECTION 3 — DAILY COMMANDS (Quick Reference)
================================================================

  Restart backend:       systemctl restart msq-ath
  Check backend status:  systemctl status msq-ath
  View live logs:        journalctl -u msq-ath -f
  View last 50 logs:     journalctl -u msq-ath -n 50 --no-pager

  Test nginx config:     nginx -t
  Reload nginx:          systemctl reload nginx

  Check port 5050:       ss -tlnp | grep 5050
  Local health check:    curl http://127.0.0.1:5050/api/health


================================================================
  SECTION 4 — TROUBLESHOOTING
================================================================

PROBLEM: Backend not responding / 502 Bad Gateway
  FIX:
    systemctl restart msq-ath
    systemctl status msq-ath

PROBLEM: Changes not visible after restart
  FIX: Check the file was actually copied to server, not just locally
    journalctl -u msq-ath -n 50 --no-pager

PROBLEM: nginx -t shows error
  FIX: Do NOT reload. Restore backup:
    cp /etc/nginx/nginx.conf.bak /etc/nginx/nginx.conf
    systemctl reload nginx

PROBLEM: Page refresh shows 404
  FIX:
    nginx -t && systemctl reload nginx

PROBLEM: Site shows old version after update
  FIX: Hard refresh in browser: Ctrl+Shift+R


================================================================
  SECTION 5 — ROLLBACK (If something goes wrong)
================================================================

  systemctl stop msq-ath
  systemctl disable msq-ath

  cp -r /root/msq-ath-backup-<date>/* /root/msq-ath/

  cd /root/msq-ath/backend
  nohup python app.py &

  systemctl reload nginx

  Then send error logs to development team:
    journalctl -u msq-ath -n 100 --no-pager

================================================================
