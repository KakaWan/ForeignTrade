"""Path resolution for both development and PyInstaller packaged modes.

In development:
  - get_app_dir()      → backend/            (runtime data: db, config.json)
  - get_resource_dir() → backend/            (bundled resources: migrations, etc.)

In PyInstaller:
  - get_app_dir()      → directory of .exe   (runtime data alongside the exe)
  - get_resource_dir() → sys._MEIPASS        (bundled resources inside the package)
"""

import os
import sys


def is_frozen() -> bool:
    """Check if running as a PyInstaller bundle."""
    return getattr(sys, 'frozen', False)


def get_app_dir() -> str:
    """Get the application directory for runtime data (database, config, backups).

    In development: the backend/ directory.
    In PyInstaller: the directory containing the executable.
    """
    if is_frozen():
        return os.path.dirname(sys.executable)
    # backend/app/core/paths.py → backend/
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_resource_dir() -> str:
    """Get the directory for bundled resources (migrations, static files).

    In development: the backend/ directory (same as source tree).
    In PyInstaller: the _MEIPASS temp directory where bundled data is extracted.
    """
    if is_frozen():
        return sys._MEIPASS
    # Same as get_app_dir() in dev mode
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
