# Aegis development convenience targets
.PHONY: backend frontend dev lint test install

install:
	cd backend && python3.11 -m pip install -e ".[dev]"
	cd frontend && npm install

backend:
	cd backend && uvicorn app.main:app --reload --port 8000 --host 0.0.0.0

frontend:
	cd frontend && npm run dev

dev:
	# Start backend and frontend in parallel (requires GNU make or similar)
	$(MAKE) -j2 backend frontend

lint:
	cd backend && python3.11 -m ruff check app tests
	cd frontend && npm run lint

test:
	cd backend && python3.11 -m pytest tests/ -v
	cd frontend && npm run test

test-unit:
	cd backend && python3.11 -m pytest tests/unit/ -v

test-integration:
	cd backend && python3.11 -m pytest tests/integration/ -v
