"""Backup API endpoints."""

import logging
import os
import zipfile

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.services.backup import (
    perform_backup, cleanup_old_backups, get_backup_list,
    restore_backup, delete_backup, _backup_dir,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["backup"])


class RestoreRequest(BaseModel):
    filename: str


@router.get("/list")
async def list_backups():
    """List all available backups, newest first."""
    return get_backup_list()


@router.post("/now")
async def backup_now():
    """Create a backup immediately."""
    try:
        filename = await perform_backup()
        cleanup_old_backups()
        return {"success": True, "filename": filename}
    except Exception as e:
        logger.error(f"Backup failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"备份失败: {e}")


@router.post("/restore")
async def restore_from_backup(body: RestoreRequest):
    """Restore database and settings from a backup .zip file."""
    try:
        await restore_backup(body.filename)
        return {"success": True, "message": f"已从 {body.filename} 恢复"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="备份文件不存在")
    except Exception as e:
        logger.error(f"Restore failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"恢复失败: {e}")


@router.get("/download/{filename}")
async def download_backup(filename: str):
    """Download a backup file."""
    backup_dir = _backup_dir()
    filepath = (backup_dir / filename).resolve()
    # Security: ensure the path is within backup_dir
    if not str(filepath).startswith(str(backup_dir.resolve())):
        raise HTTPException(status_code=400, detail="非法文件路径")
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="备份文件不存在")
    return FileResponse(str(filepath), filename=filename, media_type="application/octet-stream")


@router.post("/upload")
async def upload_backup(file: UploadFile = File(...)):
    """Upload a backup file (.zip) to the backup directory."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="缺少文件名")

    # Accept .zip (new format) and .db (legacy single-db backup)
    if not (file.filename.endswith(".zip") or file.filename.endswith(".db")):
        raise HTTPException(status_code=400, detail="仅支持 .zip 或 .db 文件")

    backup_dir = _backup_dir()
    # Sanitize filename — only keep the basename to prevent path traversal
    safe_name = os.path.basename(file.filename)

    # If it's a raw .db file, wrap it into a .zip for consistency
    content = await file.read()
    if safe_name.endswith(".db"):
        zip_name = safe_name.replace(".db", ".zip")
        dest = backup_dir / zip_name
        with zipfile.ZipFile(str(dest), "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("foreigntrade.db", content)
        safe_name = zip_name
    else:
        # Validate it's a real zip with expected contents
        try:
            with zipfile.ZipFile(os.path.join(str(backup_dir), "_upload_check.zip"), "w") as _:
                pass  # just to create a temp path
            import tempfile
            tmp = backup_dir / "_upload_check.zip"
            tmp.write_bytes(content)
            with zipfile.ZipFile(str(tmp), "r") as zf:
                names = zf.namelist()
                if "foreigntrade.db" not in names:
                    tmp.unlink(missing_ok=True)
                    raise HTTPException(status_code=400, detail="ZIP 中缺少 foreigntrade.db")
            tmp.unlink(missing_ok=True)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"无效的备份文件: {e}")

        dest = backup_dir / safe_name
        dest.write_bytes(content)

    logger.info(f"Backup uploaded: {safe_name} ({len(content)} bytes)")
    return {"success": True, "filename": safe_name}


@router.delete("/{filename}")
async def delete_backup_file(filename: str):
    """Delete a specific backup file."""
    try:
        delete_backup(filename)
        return {"success": True}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="备份文件不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {e}")


@router.post("/batch-delete", status_code=200)
async def batch_delete_backups(body: dict):
    """Delete multiple backup files."""
    filenames = body.get("filenames", [])
    if not filenames:
        raise HTTPException(status_code=400, detail="filenames 不能为空")
    deleted = 0
    for name in filenames:
        try:
            delete_backup(name)
            deleted += 1
        except FileNotFoundError:
            pass
    return {"success": True, "deleted": deleted}
