"""
Gunicorn Production Configuration for MeterSquare
--------------------------------------------------
Server: 8 CPU cores, ~16GB RAM
Worker formula: (2 × cores) + 1 = 17 workers
We use 9 here to leave headroom for other services on the same VPS.
"""
import multiprocessing

# ---------------------------------------------------------------
# Worker type: geventwebsocket is required for Flask-SocketIO
# Regular sync/gthread workers will break WebSocket connections
# ---------------------------------------------------------------
worker_class = "geventwebsocket.gunicorn.workers.GeventWebsocketWorker"

# Number of worker processes
# 9 workers on 8-core machine = good concurrency without over-saturating CPU
workers = 9

# Concurrent greenlet connections per worker (gevent uses green threads)
worker_connections = 1000

# ---------------------------------------------------------------
# Binding — Nginx proxies to this; never expose directly to internet
# ---------------------------------------------------------------
bind = "127.0.0.1:5000"

# ---------------------------------------------------------------
# Timeouts
# ---------------------------------------------------------------
timeout = 120          # Kill workers that take >120s (prevent hangs)
graceful_timeout = 30  # Time to finish in-flight requests on shutdown
keepalive = 5          # Keep connections alive for 5s (reuse TCP connections)

# ---------------------------------------------------------------
# Logging — systemd captures stdout/stderr, so log to console
# ---------------------------------------------------------------
accesslog = "-"    # stdout
errorlog = "-"     # stderr
loglevel = "warning"   # Only warnings/errors — not every request hit

# Log format: includes response time for slow request monitoring
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s %(D)sµs'

# ---------------------------------------------------------------
# Worker recycling — prevents memory leaks from accumulating
# ---------------------------------------------------------------
max_requests = 1000          # Restart worker after 1000 requests
max_requests_jitter = 100    # ±100 randomness to avoid all workers restarting at once

# ---------------------------------------------------------------
# Process naming (visible in ps/htop)
# ---------------------------------------------------------------
proc_name = "msq_backend"
