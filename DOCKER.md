# Docker Deployment Guide

## Overview

This guide provides instructions for deploying ARES Dashboard using Docker. Docker deployment is ideal for:

- Self-hosted environments
- On-premises installations
- Custom infrastructure requirements
- Development and testing
- Air-gapped environments

## Prerequisites

- Docker 20.10 or higher
- Docker Compose 2.0 or higher (optional, for multi-container setup)
- 2GB RAM minimum
- 10GB disk space minimum

## Quick Start

### Option 1: Docker Run (Simple)

```bash
# Build the image locally (see "Building from Source" below)
# or pull from GitHub Container Registry once published
docker build -t ares-dashboard:latest .

# Run the container
docker run -d \
  --name ares-dashboard \
  -p 3000:3000 \
  -e GEMINI_API_KEY=your_api_key_here \
  ares-dashboard:latest
```

Access at: http://localhost:3000

### Option 2: Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  ares-dashboard:
    image: ares-dashboard:latest  # Use locally built image
    container_name: ares-dashboard
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

Run with:

```bash
# Set your API key
export GEMINI_API_KEY=your_api_key_here

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f
```

## Building from Source

### Build the Docker Image

Create a `Dockerfile` in the project root:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Install serve for static file serving
RUN npm install -g serve

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY --from=builder /app/package*.json ./

# Install only API dependencies
RUN npm ci --only=production

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["sh", "-c", "serve -s dist -l 3000 & node api/generate-tactic.js"]
```

Build the image:

```bash
docker build -t ares-dashboard:0.9.0 .
```

Run the container:

```bash
docker run -d \
  --name ares-dashboard \
  -p 3000:3000 \
  -e GEMINI_API_KEY=your_api_key_here \
  ares-dashboard:0.9.0
```

## Production Deployment with Docker Compose

For production deployments with full backend support:

```yaml
version: '3.8'

services:
  # ARES Dashboard frontend and API
  ares-dashboard:
    image: ghcr.io/arnoldlarry15/ares-dashboard:latest
    container_name: ares-dashboard
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - DATABASE_URL=postgresql://ares:${DB_PASSWORD}@postgres:5432/ares
      - REDIS_URL=redis://redis:6379
      - SESSION_SECRET=${SESSION_SECRET}
      - JWT_SECRET=${JWT_SECRET}
      - OAUTH_CLIENT_ID=${OAUTH_CLIENT_ID}
      - OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - ares-network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

  # PostgreSQL database
  postgres:
    image: postgres:15-alpine
    container_name: ares-postgres
    environment:
      - POSTGRES_DB=ares
      - POSTGRES_USER=ares
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - ares-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ares"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis for session storage
  redis:
    image: redis:7-alpine
    container_name: ares-redis
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - ares-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Nginx reverse proxy (optional)
  nginx:
    image: nginx:alpine
    container_name: ares-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - ares-dashboard
    restart: unless-stopped
    networks:
      - ares-network

volumes:
  postgres-data:
  redis-data:

networks:
  ares-network:
    driver: bridge
```

## Environment Variables

### Required Variables

```bash
# AI API Key
GEMINI_API_KEY=your_gemini_api_key

# Production database (optional, for backend storage)
DATABASE_URL=postgresql://user:password@localhost:5432/ares

# Session management (production)
SESSION_SECRET=your_random_secret_key
JWT_SECRET=your_jwt_secret_key
```

### Optional Variables

```bash
# OAuth Configuration
OAUTH_PROVIDER=google  # google, microsoft, okta
OAUTH_CLIENT_ID=your_client_id
OAUTH_CLIENT_SECRET=your_client_secret
OAUTH_CALLBACK_URL=https://your-domain.com/auth/callback

# Redis (for session storage)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password

# Data Retention
AUDIT_LOG_RETENTION_DAYS=90
CAMPAIGN_RETENTION_DAYS=0
SOFT_DELETE_RECOVERY_DAYS=30

# Privacy Controls
PROMPT_STORAGE=false
LOGGING_ENABLED=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=https://your-domain.com
```

## Configuration

### Environment File

Create a `.env` file:

```bash
# .env
GEMINI_API_KEY=your_api_key_here
DB_PASSWORD=secure_password_here
REDIS_PASSWORD=secure_password_here
SESSION_SECRET=random_secret_32_chars
JWT_SECRET=another_random_secret_32_chars
OAUTH_CLIENT_ID=your_oauth_client_id
OAUTH_CLIENT_SECRET=your_oauth_client_secret
```

**Important**: Never commit `.env` file to version control!

### Nginx Configuration (Optional)

Create `nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    upstream ares_backend {
        server ares-dashboard:3000;
    }

    server {
        listen 80;
        server_name your-domain.com;

        # Redirect HTTP to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security Headers
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        location / {
            proxy_pass http://ares_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

## Docker Management

### Start Services

```bash
docker-compose up -d
```

### Stop Services

```bash
docker-compose down
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ares-dashboard
```

### Restart Services

```bash
docker-compose restart
```

### Update to Latest Version

```bash
docker-compose pull
docker-compose up -d
```

## Backup and Restore

### Backup PostgreSQL Database

```bash
# Backup
docker exec ares-postgres pg_dump -U ares ares > backup_$(date +%Y%m%d).sql

# Compress
gzip backup_$(date +%Y%m%d).sql
```

### Restore PostgreSQL Database

```bash
# Decompress
gunzip backup_20241226.sql.gz

# Restore
docker exec -i ares-postgres psql -U ares ares < backup_20241226.sql
```

### Backup Redis Data

```bash
# Redis automatically saves to /data volume
docker exec ares-redis redis-cli SAVE
docker cp ares-redis:/data/dump.rdb backup_redis_$(date +%Y%m%d).rdb
```

## Monitoring

### Health Checks

Check container health:

```bash
docker ps
docker inspect ares-dashboard | jq '.[0].State.Health'
```

### Resource Usage

```bash
docker stats ares-dashboard
```

### Application Logs

```bash
# Real-time logs
docker logs -f ares-dashboard

# Last 100 lines
docker logs --tail 100 ares-dashboard
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs ares-dashboard

# Check container status
docker ps -a

# Inspect container
docker inspect ares-dashboard
```

### Database Connection Issues

```bash
# Check PostgreSQL logs
docker logs ares-postgres

# Test database connection
docker exec ares-postgres psql -U ares -d ares -c "SELECT 1"

# Check network connectivity
docker exec ares-dashboard ping postgres
```

### Port Already in Use

```bash
# Find process using port 3000
sudo lsof -i :3000

# Use different port
docker run -p 8080:3000 ...
```

## Security Best Practices

1. **Use Secrets Management**
   ```bash
   # Use Docker secrets instead of environment variables
   echo "your_secret" | docker secret create gemini_api_key -
   ```

2. **Run as Non-Root User**
   ```dockerfile
   USER node
   ```

3. **Limit Resources**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2'
         memory: 2G
   ```

4. **Regular Updates**
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

5. **Network Isolation**
   ```yaml
   networks:
     ares-network:
       internal: true
   ```

## Scaling

### Horizontal Scaling

```yaml
services:
  ares-dashboard:
    image: ghcr.io/arnoldlarry15/ares-dashboard:latest
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

### Load Balancer

Use Nginx or HAProxy to distribute traffic across multiple containers.

## Kubernetes Deployment (Preview)

Basic Kubernetes deployment (Helm chart coming in v1.0.0):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ares-dashboard
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ares-dashboard
  template:
    metadata:
      labels:
        app: ares-dashboard
    spec:
      containers:
      - name: ares-dashboard
        image: ghcr.io/arnoldlarry15/ares-dashboard:latest
        ports:
        - containerPort: 3000
        env:
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: ares-secrets
              key: gemini-api-key
```

## Additional Resources

- [DEPLOY.md](DEPLOY.md) - General deployment guide
- [SECURITY.md](SECURITY.md) - Security best practices
- [DATA_HANDLING.md](DATA_HANDLING.md) - Data privacy and compliance
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

## Support

For Docker deployment questions:
- Open a [GitHub Discussion](https://github.com/Arnoldlarry15/ARES-Dashboard/discussions)
- Check existing [Issues](https://github.com/Arnoldlarry15/ARES-Dashboard/issues)
- Review [Troubleshooting](#troubleshooting) section

---

**Last Updated**: December 2024  
**Version**: 0.9.0
