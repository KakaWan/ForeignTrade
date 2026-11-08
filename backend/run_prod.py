"""Production entry point for ForeignTrade application.

Run this when serving the app in production mode (no auto-reload).
The frontend is served from static files built by `vite build`.
"""

import os
import sys

# Ensure working directory is the application directory when running as PyInstaller bundle
if getattr(sys, 'frozen', False):
    os.chdir(os.path.dirname(sys.executable))

from app.main import app  # noqa: E402
import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
