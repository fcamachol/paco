#!/bin/bash

# PACO Development Server Launcher
# Usage: ./dev.sh [dev|backend|frontend|infra|all|stop|status]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# PID file locations
PID_DIR="$SCRIPT_DIR/.pids"
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"

print_status() {
    echo -e "${BLUE}[PACO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PACO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[PACO]${NC} $1"
}

print_error() {
    echo -e "${RED}[PACO]${NC} $1"
}

print_header() {
    echo -e "${CYAN}"
    echo "  ╔═══════════════════════════════════════════════════════════╗"
    echo "  ║                    PACO Dev Server                        ║"
    echo "  ╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Check if .env exists
check_env() {
    if [ ! -f ".env" ]; then
        print_warning ".env file not found. Creating from .env.example..."
        cp .env.example .env
        print_warning "Please edit .env with your configuration before running again."
        exit 1
    fi
}

# Start infrastructure (postgres, redis, langfuse)
start_infra() {
    print_status "Starting infrastructure services (postgres, redis, langfuse)..."
    docker-compose up -d postgres redis langfuse
    print_success "Infrastructure started!"
    echo ""
    echo "  PostgreSQL: localhost:5432"
    echo "  Redis:      localhost:6379"
    echo "  Langfuse:   http://localhost:3001"
    echo ""
}

# Start backend
start_backend() {
    print_status "Starting PACO Backend on port 8000..."
    cd backend

    # Create venv if it doesn't exist
    if [ ! -d "venv" ]; then
        print_status "Creating Python virtual environment..."
        python3 -m venv venv
    fi

    # Activate venv and install dependencies
    source venv/bin/activate
    pip install -q -r requirements.txt

    print_success "Backend starting at http://localhost:8000"
    print_status "API docs at http://localhost:8000/docs"
    uvicorn app.main:app --reload --port 8000
}

# Start frontend
start_frontend() {
    print_status "Starting PACO Frontend on port 3006..."
    cd frontend

    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_status "Installing npm dependencies..."
        npm install
    fi

    print_success "Frontend starting at http://localhost:3006"
    npm run dev
}

# Stop all services
stop_all() {
    print_status "Stopping all PACO services..."

    # Stop background processes if running
    mkdir -p "$PID_DIR"

    if [ -f "$BACKEND_PID" ]; then
        PID=$(cat "$BACKEND_PID")
        if kill -0 "$PID" 2>/dev/null; then
            print_status "Stopping backend (PID: $PID)..."
            kill "$PID" 2>/dev/null || true
            # Also kill any uvicorn processes
            pkill -f "uvicorn app.main:app" 2>/dev/null || true
        fi
        rm -f "$BACKEND_PID"
    fi

    if [ -f "$FRONTEND_PID" ]; then
        PID=$(cat "$FRONTEND_PID")
        if kill -0 "$PID" 2>/dev/null; then
            print_status "Stopping frontend (PID: $PID)..."
            kill "$PID" 2>/dev/null || true
            # Also kill any next dev processes
            pkill -f "next dev" 2>/dev/null || true
        fi
        rm -f "$FRONTEND_PID"
    fi

    docker-compose down
    print_success "All services stopped."
}

# Show status
show_status() {
    print_status "PACO Services Status:"
    echo ""
    docker-compose ps
}

# Main
case "${1:-help}" in
    infra)
        check_env
        start_infra
        ;;
    backend)
        check_env
        start_backend
        ;;
    frontend)
        start_frontend
        ;;
    all)
        check_env
        print_status "Starting all PACO services..."
        echo ""
        echo "This will start infrastructure in Docker and run backend/frontend locally."
        echo "You'll need 3 terminals or use a process manager."
        echo ""
        echo "Run these commands in separate terminals:"
        echo ""
        echo "  Terminal 1: ./dev.sh infra"
        echo "  Terminal 2: ./dev.sh backend"
        echo "  Terminal 3: ./dev.sh frontend"
        echo ""
        ;;
    stop)
        stop_all
        ;;
    status)
        show_status
        ;;
    help|*)
        echo ""
        echo "PACO Development Server"
        echo ""
        echo "Usage: ./dev.sh <command>"
        echo ""
        echo "Commands:"
        echo "  infra     Start infrastructure (postgres, redis, langfuse)"
        echo "  backend   Start FastAPI backend (port 8000)"
        echo "  frontend  Start Next.js frontend (port 3006)"
        echo "  all       Show instructions for starting everything"
        echo "  stop      Stop all Docker services"
        echo "  status    Show Docker services status"
        echo ""
        echo "Quick Start:"
        echo "  1. ./dev.sh infra     # Start databases"
        echo "  2. ./dev.sh backend   # In new terminal"
        echo "  3. ./dev.sh frontend  # In new terminal"
        echo ""
        echo "URLs:"
        echo "  Dashboard:  http://localhost:3006"
        echo "  API Docs:   http://localhost:8000/docs"
        echo "  Langfuse:   http://localhost:3001"
        echo ""
        ;;
esac
