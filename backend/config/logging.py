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
            console_handler = logging.StreamHandler(sys.stdout)
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

logger = get_logger()
