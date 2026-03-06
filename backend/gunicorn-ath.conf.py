"""
Gunicorn Production Configuration for MeterSquare — msq.ath.cx
--------------------------------------------------------------
Same server (8 CPU, 16GB RAM) but separate process on port 5050.
Workers split with msq.kol.tel: 9 + 5 = 14 total workers.
Leave headroom for OS + Nginx + DB connections.
"""

# Worker type: geventwebsocket required for Flask-SocketIO WebSocket support
worker_class = "geventwebsocket.gunicorn.workers.GeventWebsocketWorker"

# Fewer workers for secondary domain
workers = 5

# Concurrent greenlet connections per worker
worker_connections = 1000

# Bind to different port than primary instance
bind = "127.0.0.1:5050"

# Timeouts
timeout = 120
graceful_timeout = 30
keepalive = 5

# Logging — systemd captures stdout/stderr
accesslog = "-"
errorlog = "-"
loglevel = "warning"

access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s %(D)sµs'

# Worker recycling — prevents memory leaks
max_requests = 1000
max_requests_jitter = 100

# Process naming (visible in ps/htop)
proc_name = "msq_ath_backend"
