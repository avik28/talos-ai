# Stage 1: Build the React / Vite Frontend
FROM node:20-slim AS builder
WORKDIR /app

# Copy dependency files and install
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy all application files and build
COPY . .
ENV VITE_API_URL=""
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Combine Python Backend + Nginx Frontend
FROM python:3.10-slim

# Install system dependencies (compilation tools for Python spatial packages) and Nginx
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    nginx \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend dependencies and install them
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code and dataset
COPY backend/ ./backend/
COPY public/dataset.csv ./public/dataset.csv

# Copy custom Nginx configuration for Hugging Face
COPY docker/nginx.hf.conf /etc/nginx/nginx.conf

# Copy built frontend files from Stage 1 to Nginx's HTML folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose Hugging Face Space default port
EXPOSE 7860

# Copy and set up the startup script
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Change ownership of application files and Nginx folders to user 1000 for non-root execution
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/lib/nginx /var/run && \
    chown -R 1000:1000 /app /var/cache/nginx /var/log/nginx /var/lib/nginx /var/run

# Switch to Hugging Face non-root user
USER 1000

# Start the application using the startup script
CMD ["/app/start.sh"]
