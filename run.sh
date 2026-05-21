#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== Image2Video Pipeline ==="

# Backend
echo "[1/3] Installing backend dependencies..."
cd "$ROOT/backend"
pip install -q -r requirements.txt

echo "[2/3] Starting backend (http://localhost:8000)..."
uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Frontend
echo "[3/3] Installing & starting frontend (http://localhost:5173)..."
cd "$ROOT/frontend"
npm install --silent
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Running:"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."

cleanup() {
    echo "Shutting down..."
    kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
wait "$BACKEND_PID" "$FRONTEND_PID"
