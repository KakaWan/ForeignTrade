"""Tests for API endpoints using FastAPI TestClient."""

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestHealthCheck:
    @pytest.mark.asyncio
    async def test_health(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


class TestCompanyAPI:
    @pytest.mark.asyncio
    async def test_create_company(self, client):
        resp = await client.post("/api/companies/?check_dup=false", json={
            "name": "Test Corp",
            "website": "test.com",
            "country": "USA",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Test Corp"
        assert data["domain"] == "test.com"

    @pytest.mark.asyncio
    async def test_list_companies(self, client):
        resp = await client.get("/api/companies/")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_company_not_found(self, client):
        resp = await client.get("/api/companies/99999")
        assert resp.status_code == 404


class TestEmployeeAPI:
    @pytest.mark.asyncio
    async def test_create_employee(self, client):
        # First create a company
        comp = await client.post("/api/companies/?check_dup=false", json={"name": "Emp Corp"})
        company_id = comp.json()["id"]

        resp = await client.post("/api/employees/?check_dup=false", json={
            "company_id": company_id,
            "full_name": "John Smith",
            "position": "CEO",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["full_name"] == "John Smith"

    @pytest.mark.asyncio
    async def test_employee_not_found(self, client):
        resp = await client.get("/api/employees/99999")
        assert resp.status_code == 404
