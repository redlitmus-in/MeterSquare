# MeterSquare msq.ath.cx — Upgrade Instructions
# Replacing old "python app.py" with Gunicorn (production server)

================================================================
  CURRENT STATE ON SERVER
  - Running: python app.py (slow, single-threaded dev server)
  - No venv, system Python
  - Frontend: served via old nginx config

  AFTER THIS UPGRADE
  - Running: Gunicorn with 5 workers (fast, production server)
  - Auto-restart on crash and on server reboot (systemd service)
  - Frontend: built static files served by nginx directly
  - nginx: msq.ath.cx config isolated in conf.d (safe, no other apps touched)
================================================================


----------------------------------------------------------------
STEP 1 — SSH into the server as root
----------------------------------------------------------------

  ssh root@<server-ip>


----------------------------------------------------------------
STEP 2 — Backup the current project (safety first)
----------------------------------------------------------------

  cp -r /root/msq-ath /root/msq-ath-backup-$(date +%Y%m%d)

  This creates a backup like: /root/msq-ath-backup-20260305
  If anything goes wrong you can restore from this backup.


----------------------------------------------------------------
STEP 3 — Upload and unzip the new project files
----------------------------------------------------------------

  Upload the zip file to the server, then:

  cd /root
  unzip -o metersquare.zip -d msq-ath

  The -o flag overwrites existing files automatically.
  Your .env file will NOT be touched (it is not in the zip).


----------------------------------------------------------------
STEP 4 — Run the setup script
----------------------------------------------------------------

  cd /root/msq-ath
  bash setup-ath-server.sh

  This script will do everything automatically:

  [1/6] Install gunicorn + gevent via pip3
        --> These are required to run the new production server

  [2/6] Install Python dependencies from requirements.txt
        --> Installs any new packages added since last deployment

  [3/6] Stop the old "python app.py" process
        --> Kills the old dev server running on port 5050
        --> If nothing is running it will say "No old process found" (OK)

  [4/6] Install and start msq-ath systemd service
        --> Starts Gunicorn with 5 workers on port 5050
        --> Auto-restarts if it crashes
        --> Auto-starts on server reboot
        --> You will see: "msq-ath service is RUNNING"

  [5/6] Build frontend and deploy static files
        --> Builds optimized production React app
        --> Deploys to /var/www/msq-ath/
        --> nginx will serve these files directly (much faster)

  [6/6] Update nginx for msq.ath.cx
        --> Copies new config to /etc/nginx/conf.d/msq-ath.conf
        --> ONLY msq.ath.cx is affected — webui, talkbot, quiz, bolt,
            dentpro, task are completely untouched
        --> Reloads nginx automatically

  Wait for: "Setup complete!" at the end before continuing.


----------------------------------------------------------------
STEP 5 — Remove old msq.ath.cx block from main nginx.conf
----------------------------------------------------------------

  The new config is now in /etc/nginx/conf.d/msq-ath.conf
  The OLD msq.ath.cx block in nginx.conf must be removed to avoid conflict.

  Open the main nginx config:
    nano /etc/nginx/nginx.conf

  -- FIND AND DELETE THIS (the old msq.ath.cx server block) --

    server {
        server_name msq.ath.cx;
        ...everything inside...
    }

    server {
        listen 80;
        server_name msq.ath.cx;
        return 301 https://$host$request_uri;
    }

  -- ALSO DELETE THIS if it exists (old upstream block) --

    upstream msq_ath_backend {
        server 127.0.0.1:5050;
        ...
    }

  -- SAVE AND EXIT --
    Ctrl+O  then  Enter  (save)
    Ctrl+X  (exit nano)

  -- TEST nginx config (IMPORTANT — do this before reloading) --
    nginx -t

    You MUST see:
      nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
      nginx: configuration file /etc/nginx/nginx.conf test is successful

    If you see any ERROR — do NOT reload. Open nginx.conf and fix it first.

  -- RELOAD nginx --
    systemctl reload nginx


----------------------------------------------------------------
STEP 6 — Health Check (confirm everything is working)
----------------------------------------------------------------

  Run these checks one by one:

  CHECK 1 — Is the backend service running?
    systemctl status msq-ath

    EXPECTED: "active (running)" in green
    IF FAILED: See troubleshooting below

  CHECK 2 — Does backend respond locally?
    curl http://127.0.0.1:5050/api/health

    EXPECTED: JSON response like {"status": "ok", ...}
    IF FAILED: Backend crashed, check logs (see below)

  CHECK 3 — Does the public URL work?
    curl https://msq.ath.cx/api/health

    EXPECTED: Same JSON response as CHECK 2
    IF FAILED: nginx not routing correctly, check conf.d config

  CHECK 4 — Open in browser
    https://msq.ath.cx

    EXPECTED: Login page loads normally
    Test login, navigate a few pages, confirm it works.

  All 4 checks passed? The upgrade is complete and live.


----------------------------------------------------------------
TROUBLESHOOTING
----------------------------------------------------------------

PROBLEM: Script says "msq-ath service failed to start"
  FIX: Check the error:
         journalctl -u msq-ath -n 50 --no-pager
       Most common cause: wrong DATABASE_URL in .env file
       Confirm .env exists: ls -la /root/msq-ath/backend/.env

PROBLEM: nginx -t shows error after editing nginx.conf
  FIX: Do NOT reload nginx. Open the file and fix.
       Common mistakes: missing ; at end of line, unclosed { }
       Restore backup if needed:
         cp /root/msq-ath-backup-<date>/  (check what you backed up)

PROBLEM: https://msq.ath.cx shows 502 Bad Gateway
  FIX: Backend is down. Run:
         systemctl restart msq-ath
         systemctl status msq-ath

PROBLEM: Page refresh shows 404 (e.g., /projects page)
  FIX: Old nginx config still active. Check:
         cat /etc/nginx/conf.d/msq-ath.conf
       Must contain: try_files $uri $uri/ /index.html;
       Then: nginx -t && systemctl reload nginx

PROBLEM: Site shows old version after upgrade
  FIX: Hard refresh in browser: Ctrl+Shift+R
       Or open in incognito window.


----------------------------------------------------------------
USEFUL COMMANDS (for reference)
----------------------------------------------------------------

  View live logs:        journalctl -u msq-ath -f
  View last 50 logs:     journalctl -u msq-ath -n 50 --no-pager
  Restart backend:       systemctl restart msq-ath
  Reload backend:        systemctl reload msq-ath
  Stop backend:          systemctl stop msq-ath
  Backend status:        systemctl status msq-ath

  Test nginx config:     nginx -t
  Reload nginx:          systemctl reload nginx

  Check port 5050:       ss -tlnp | grep 5050
  Local health check:    curl http://127.0.0.1:5050/api/health


----------------------------------------------------------------
IF SOMETHING GOES WRONG — ROLLBACK
----------------------------------------------------------------

  Stop the new service:
    systemctl stop msq-ath
    systemctl disable msq-ath

  Restore old files:
    cp -r /root/msq-ath-backup-<date>/* /root/msq-ath/

  Start old server manually:
    cd /root/msq-ath/backend
    nohup python app.py &

  Reload nginx with old config:
    systemctl reload nginx

  Then contact the development team with the error logs:
    journalctl -u msq-ath -n 100 --no-pager

================================================================
