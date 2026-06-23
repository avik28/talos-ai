#!/bin/bash

# Start the FastAPI backend server on localhost:8000
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &

# Start Nginx in the foreground to keep the container running
nginx -g "daemon off;"
