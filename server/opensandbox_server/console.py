"""Optional, packaged Console SPA. No lifecycle API behavior lives here."""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse

CONSOLE_DIR = Path(__file__).parent / "static" / "console"
router = APIRouter(include_in_schema=False)


@router.get("/console")
async def console_redirect():
    return RedirectResponse("/console/", status_code=307)


@router.get("/console/{path:path}")
async def console_page(path: str):
    root = CONSOLE_DIR.resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root) or "\\" in path:
        raise HTTPException(404, "Console resource not found")
    index = root / "index.html"
    if not index.is_file():
        return HTMLResponse(
            '<!doctype html><html lang="en"><title>Console not built</title>'
            '<h1>Console has not been built</h1>'
            '<p>Run <code>pnpm --dir console install --frozen-lockfile</code> and '
            '<code>pnpm --dir console build:server</code> from the repository root.</p></html>',
            status_code=503,
        )
    if target.is_file():
        cache = "no-cache" if target == index else "public, max-age=31536000, immutable"
        return FileResponse(target, headers={"Cache-Control": cache})
    # Only extensionless SPA routes fall back; a missing asset is never HTML.
    if path.startswith("assets/") or Path(path).suffix:
        raise HTTPException(404, "Console resource not found")
    return FileResponse(index, headers={"Cache-Control": "no-cache"})
