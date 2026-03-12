import logging
import os
import sys

def get_logger():
    logger = logging.getLogger("example_logger")
    logger.setLevel(logging.INFO)

    # Clear existing handlers
    logger.handlers = []

    LOG_FILE = os.environ.get("LOG_FILE")

    try:
        if LOG_FILE:
            LOG_FILE = os.path.normpath(LOG_FILE)
            os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

            file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
            formatter = logging.Formatter(
                "%(asctime)s - %(levelname)s - %(message)s"
            )
            file_handler.setFormatter(formatter)

            logger.addHandler(file_handler)
        else:
            # Force UTF-8 encoding to handle emoji in log messages
            stdout_utf8 = open(sys.stdout.fileno(), mode='w', encoding='utf-8', errors='replace', closefd=False)
            console_handler = logging.StreamHandler(stdout_utf8)
            formatter = logging.Formatter(
                "%(asctime)s - %(levelname)s - %(message)s"
            )
            console_handler.setFormatter(formatter)

            logger.addHandler(console_handler)

        logger.propagate = False
    except Exception as e:
        print(f"Error setting up logging: {str(e)}")
        raise

    return logger


def configure_quiet_logging():
    """
    Suppress verbose logging from third-party libraries.
    Call this early in app startup to reduce log noise.
    """
    # Configure root logger so module-level loggers (e.g. deadline_scheduler) emit INFO+
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s: %(message)s",
        stream=sys.stdout,
    )

    # Suppress werkzeug HTTP request logs (only show errors)
    logging.getLogger('werkzeug').setLevel(logging.ERROR)

    # Suppress Socket.IO and EngineIO verbose logs
    logging.getLogger('socketio').setLevel(logging.WARNING)
    logging.getLogger('socketio.server').setLevel(logging.WARNING)
    logging.getLogger('engineio').setLevel(logging.WARNING)
    logging.getLogger('engineio.server').setLevel(logging.WARNING)

    # Suppress SQLAlchemy engine logs (only show warnings+)
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

    # Suppress apscheduler job scheduler verbose logs
    logging.getLogger('apscheduler').setLevel(logging.WARNING)
    logging.getLogger('apscheduler.scheduler').setLevel(logging.WARNING)
    logging.getLogger('apscheduler.executors').setLevel(logging.WARNING)


logger = get_logger()
