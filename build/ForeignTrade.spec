# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for ForeignTrade application.

Build:  pyinstaller build/ForeignTrade.spec
Output: dist/ForeignTrade/
"""

import os
import sys

block_cipher = None

# ── Paths ─────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(SPECPATH + '/..')
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')
FRONTEND_DIST = os.path.join(PROJECT_ROOT, 'frontend', 'dist')
MIGRATIONS_DIR = os.path.join(BACKEND_DIR, 'migrations')

# ── Data files to bundle ──────────────────────────────────────────
datas = []

# Frontend build output → static/
if os.path.isdir(FRONTEND_DIST):
    datas.append((FRONTEND_DIST, 'static'))
else:
    print(f"WARNING: Frontend dist not found at {FRONTEND_DIST}")
    print("Run 'cd frontend && npm run build' first.")

# Alembic migrations
if os.path.isdir(MIGRATIONS_DIR):
    datas.append((MIGRATIONS_DIR, 'migrations'))
else:
    print(f"WARNING: Migrations not found at {MIGRATIONS_DIR}")

# ── Hidden imports ────────────────────────────────────────────────
# FastAPI/SQLAlchemy/Uvicorn sometimes need explicit hints
hiddenimports = [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'aiosqlite',
    'sqlalchemy.dialects.sqlite',
    'sqlalchemy.ext.asyncio',
    'asyncio',
    'email.mime.text',
    'email.mime.multipart',
    'aiosmtplib',
    'cachetools',
    'httpx',
    'openpyxl',
    'dns',
]

# ── Excludes (large packages not needed at runtime) ───────────────
excludes = [
    'pytest',
    'pytest_asyncio',
    'setuptools',
    'pip',
    'wheel',
    'tkinter',
    'unittest',
    'pydoc',
    'distutils',
]

# ── Analysis ──────────────────────────────────────────────────────
a = Analysis(
    [os.path.join(BACKEND_DIR, 'run_prod.py')],
    pathex=[BACKEND_DIR],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

# ── PYZ (Python bundle) ──────────────────────────────────────────
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# ── EXE ───────────────────────────────────────────────────────────
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ForeignTrade',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    icon=None,  # TODO: add an .ico file if desired
)

# ── COLLECT (one-directory bundle) ────────────────────────────────
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ForeignTrade',
)
