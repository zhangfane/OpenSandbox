"""Console routes must never widen business API authentication."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from opensandbox_server import console
from opensandbox_server.config import AppConfig, IngressConfig, RuntimeConfig, ServerConfig
from opensandbox_server.middleware.auth import AuthMiddleware


@pytest.fixture
def client(tmp_path, monkeypatch):
    root = tmp_path / "console"
    root.mkdir()
    (root / "index.html").write_text("<!doctype html><title>OpenSandbox Console</title>")
    (root / "assets").mkdir()
    (root / "assets" / "app-123.js").write_text("window.consoleLoaded = true;")
    (tmp_path / "secret.txt").write_text("private")
    monkeypatch.setattr(console, "CONSOLE_DIR", root)
    app = FastAPI()
    app.include_router(console.router)
    app.add_middleware(AuthMiddleware, config=AppConfig(
        server=ServerConfig(api_key="test-key"),
        runtime=RuntimeConfig(type="docker", execd_image="test"),
        ingress=IngressConfig(mode="direct"),
    ))

    @app.get("/v1/sandboxes")
    def sandboxes():
        return {"items": []}

    return TestClient(app)


def test_redirect_and_anonymous_routes(client):
    response = client.get("/console", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/console/"
    for path in ["/console/", "/console/sandboxes", "/console/sandboxes/abc"]:
        response = client.get(path)
        assert response.status_code == 200
        assert "OpenSandbox Console" in response.text
        assert response.headers["cache-control"] == "no-cache"


def test_static_assets_and_missing_files(client):
    response = client.get("/console/assets/app-123.js")
    assert response.status_code == 200
    assert "javascript" in response.headers["content-type"]
    assert "immutable" in response.headers["cache-control"]
    for path in ["/console/assets/missing.js", "/console/missing.css", "/console/assets/missing"]:
        assert client.get(path).status_code == 404


def test_auth_boundary(client):
    for path in ["/console-other", "/consoleevil", "/v1/sandboxes"]:
        assert client.get(path).status_code == 401
    assert client.get("/v1/sandboxes", headers={"OPEN-SANDBOX-API-KEY": "test-key"}).status_code == 200


def test_traversal_and_symlink(client):
    (console.CONSOLE_DIR / "leak.txt").symlink_to(console.CONSOLE_DIR.parent / "secret.txt")
    for path in ["/console/%2e%2e/secret.txt", "/console/leak.txt", "/console/..%5csecret.txt"]:
        assert client.get(path).status_code in (401, 404)


def test_unbuilt_does_not_break_api(client, monkeypatch, tmp_path):
    monkeypatch.setattr(console, "CONSOLE_DIR", tmp_path / "unbuilt")
    response = client.get("/console/")
    assert response.status_code == 503
    assert "pnpm --dir console build:server" in response.text
    assert client.get("/v1/sandboxes", headers={"OPEN-SANDBOX-API-KEY": "test-key"}).status_code == 200
