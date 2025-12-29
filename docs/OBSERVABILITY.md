# Observability Guide

## Overview

ARES Dashboard provides comprehensive observability through metrics, logs, traces, and health checks. This guide covers how to monitor, troubleshoot, and maintain the system in production.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ARES Dashboard                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Metrics    │  │     Logs     │  │    Traces    │      │
│  │  Prometheus  │  │  Structured  │  │ OpenTelemetry│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
    ┌─────────┐        ┌─────────┐       ┌─────────┐
    │Prometheus│       │  Loki   │       │  Jaeger │
    │  Server │        │  / ELK  │       │  / Tempo│
    └─────────┘        └─────────┘       └─────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Grafana   │
                    │  Dashboard  │
                    └─────────────┘
```

## Metrics

### Prometheus Endpoint

ARES exposes metrics at `/api/metrics` in Prometheus format.

**Access the endpoint:**

```bash
# Development
curl http://localhost:3000/api/metrics

# Production (with auth)
curl -H "Authorization: Basic $(echo -n 'user:pass' | base64)" \
  https://your-domain.com/api/metrics
```

**Configure Prometheus:**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'ares-dashboard'
    scrape_interval: 30s
    static_configs:
      - targets: ['your-domain.com']
    metrics_path: '/api/metrics'
    basic_auth:
      username: 'metrics-user'
      password: 'secure-password'
```

### Available Metrics

#### HTTP Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | Request latency distribution |
| `http_requests_errors_total` | Counter | Total HTTP errors by status code |

**Example queries:**

```promql
# Request rate (requests per second)
rate(http_requests_total[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Error rate
rate(http_requests_errors_total[5m]) / rate(http_requests_total[5m])
```

#### Authentication Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `auth_success_total` | Counter | Successful authentications |
| `auth_failure_total` | Counter | Failed authentication attempts |
| `auth_sessions_active` | Gauge | Active user sessions |

**Example queries:**

```promql
# Authentication success rate
rate(auth_success_total[5m]) / (rate(auth_success_total[5m]) + rate(auth_failure_total[5m]))

# Active sessions
auth_sessions_active
```

#### Campaign Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `campaigns_created_total` | Counter | Total campaigns created |
| `campaigns_active` | Gauge | Active campaigns |
| `campaigns_shared_total` | Counter | Total campaign shares |

#### Database Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `db_connections_active` | Gauge | Active database connections |
| `db_connections_idle` | Gauge | Idle database connections |
| `db_query_duration_seconds` | Histogram | Database query latency |
| `db_errors_total` | Counter | Database errors |

**Example queries:**

```promql
# Database connection pool usage
db_connections_active / (db_connections_active + db_connections_idle)

# 99th percentile query latency
histogram_quantile(0.99, rate(db_query_duration_seconds_bucket[5m]))
```

#### System Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `process_memory_heap_bytes` | Gauge | Heap memory used |
| `process_memory_heap_total_bytes` | Gauge | Total heap memory |
| `process_memory_rss_bytes` | Gauge | Resident set size |

## Logs

### Structured Logging

ARES uses structured JSON logging for easy parsing and analysis.

**Log format:**

```json
{
  "timestamp": "2025-12-29T06:30:00.000Z",
  "level": "info",
  "service": "ares-dashboard",
  "correlationId": "req_abc123",
  "userId": "user_123",
  "message": "Campaign created",
  "context": {
    "campaignId": "camp_456",
    "framework": "OWASP_LLM_TOP_10"
  }
}
```

### Log Levels

| Level | Use Case |
|-------|----------|
| `debug` | Detailed debugging information |
| `info` | General informational messages |
| `warn` | Warning messages, potential issues |
| `error` | Error messages, handled failures |
| `fatal` | Critical errors, system failures |

### Configuration

Set log level via environment variable:

```bash
LOG_LEVEL=info  # Options: debug, info, warn, error, fatal
```

### Correlation IDs

Every request is assigned a correlation ID for tracing across services:

```bash
# Example: trace a request through logs
grep "correlationId: req_abc123" logs/*.json
```

### Log Aggregation

#### Loki Configuration

```yaml
# promtail.yml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: ares-dashboard
    static_configs:
      - targets:
          - localhost
        labels:
          job: ares-dashboard
          __path__: /var/log/ares/*.json
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: message
            correlationId: correlationId
      - labels:
          level:
          correlationId:
```

#### ELK Stack Configuration

```json
// logstash.conf
input {
  file {
    path => "/var/log/ares/*.json"
    codec => json
  }
}

filter {
  if [level] == "error" or [level] == "fatal" {
    mutate {
      add_tag => ["alert"]
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "ares-logs-%{+YYYY.MM.dd}"
  }
}
```

## Traces

### OpenTelemetry Integration

ARES supports OpenTelemetry for distributed tracing.

**Environment configuration:**

```bash
# Enable tracing
ENABLE_TRACING=true

# OpenTelemetry collector endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318

# Service name
OTEL_SERVICE_NAME=ares-dashboard

# Sampling rate (0.0 to 1.0)
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1  # Sample 10% of traces
```

**Example trace:**

```
Campaign Creation Flow
├── HTTP POST /api/campaigns (150ms)
│   ├── Validate Input (5ms)
│   ├── Check Permissions (10ms)
│   ├── Database Write (80ms)
│   ├── Audit Log Write (30ms)
│   └── Response (25ms)
```

### Jaeger Configuration

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP gRPC
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

## Health Checks

### Endpoints

| Endpoint | Purpose | Response Time |
|----------|---------|---------------|
| `/api/health` | Overall health | < 1s |
| `/api/health/live` | Liveness probe | < 100ms |
| `/api/health/ready` | Readiness probe | < 500ms |

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-12-29T06:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600,
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 15
    },
    "cache": {
      "status": "healthy",
      "latency": 5
    },
    "externalServices": {
      "gemini": { "status": "healthy" },
      "auth": { "status": "healthy" }
    }
  },
  "metrics": {
    "memory": {
      "used": 150000000,
      "total": 256000000,
      "percentage": 58.6
    }
  }
}
```

### Kubernetes Probes

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: ares-dashboard
        livenessProbe:
          httpGet:
            path: /api/health/live
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /api/health/ready
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
```

## Service Level Objectives (SLOs)

### Availability SLO

**Target:** 99.9% availability (8.76 hours downtime per year)

**Measurement:**

```promql
# Availability over 30 days
sum(up{job="ares-dashboard"}) / count(up{job="ares-dashboard"}) * 100
```

**Alert:**

```yaml
# alerts.yml
- alert: AvailabilityBelowSLO
  expr: avg_over_time(up{job="ares-dashboard"}[30d]) < 0.999
  for: 5m
  annotations:
    summary: "ARES Dashboard availability below SLO"
    description: "30-day availability: {{ $value }}"
```

### Latency SLO

**Target:** 95% of requests complete in < 500ms

**Measurement:**

```promql
# P95 latency
histogram_quantile(0.95, 
  rate(http_request_duration_seconds_bucket[5m])
)
```

**Alert:**

```yaml
- alert: LatencyAboveSLO
  expr: |
    histogram_quantile(0.95, 
      rate(http_request_duration_seconds_bucket[5m])
    ) > 0.5
  for: 10m
  annotations:
    summary: "ARES Dashboard P95 latency above SLO"
    description: "Current P95 latency: {{ $value }}s"
```

### Error Rate SLO

**Target:** < 0.1% error rate (99.9% success rate)

**Measurement:**

```promql
# Error rate
sum(rate(http_requests_errors_total[5m])) / 
sum(rate(http_requests_total[5m]))
```

**Alert:**

```yaml
- alert: ErrorRateAboveSLO
  expr: |
    sum(rate(http_requests_errors_total[5m])) / 
    sum(rate(http_requests_total[5m])) > 0.001
  for: 5m
  annotations:
    summary: "ARES Dashboard error rate above SLO"
    description: "Current error rate: {{ $value | humanizePercentage }}"
```

## Dashboards

### Grafana Dashboard

Import the ARES Dashboard template:

```json
{
  "dashboard": {
    "title": "ARES Dashboard - Production Monitoring",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "P95 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_errors_total[5m]) / rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Active Users",
        "targets": [
          {
            "expr": "auth_sessions_active"
          }
        ]
      }
    ]
  }
}
```

### Key Visualizations

1. **System Overview**
   - Request rate
   - Error rate
   - P95/P99 latency
   - Active users

2. **Database Performance**
   - Connection pool usage
   - Query latency
   - Error rate

3. **Authentication**
   - Login success/failure rate
   - Active sessions
   - MFA usage

4. **Campaigns**
   - Creation rate
   - Active campaigns
   - Share rate

## Alerting

### Alert Configuration

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'team-notifications'
  
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'team-notifications'
    slack_configs:
      - channel: '#ares-alerts'
        api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK'
  
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
  
  - name: 'slack'
    slack_configs:
      - channel: '#ares-warnings'
        api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK'
```

### Critical Alerts

1. **Service Down**
   ```promql
   up{job="ares-dashboard"} == 0
   ```

2. **High Error Rate**
   ```promql
   rate(http_requests_errors_total[5m]) / rate(http_requests_total[5m]) > 0.05
   ```

3. **Database Connection Failure**
   ```promql
   db_connections_active == 0
   ```

4. **Memory Exhaustion**
   ```promql
   process_memory_heap_bytes / process_memory_heap_total_bytes > 0.9
   ```

## Troubleshooting

### Common Issues

1. **High Latency**
   ```bash
   # Check database queries
   curl https://your-domain.com/api/metrics | grep db_query_duration
   
   # Check memory usage
   curl https://your-domain.com/api/health | jq '.metrics.memory'
   ```

2. **Authentication Failures**
   ```bash
   # Check auth metrics
   curl https://your-domain.com/api/metrics | grep auth_failure
   
   # Review logs
   cat logs/ares.log | grep -i "auth" | grep -i "error"
   ```

3. **Database Connection Issues**
   ```bash
   # Check connection pool
   curl https://your-domain.com/api/health | jq '.checks.database'
   
   # Test direct connection
   psql $DATABASE_URL -c "SELECT 1"
   ```

## Best Practices

1. **Set up monitoring before deployment**
   - Configure Prometheus scraping
   - Set up log aggregation
   - Create Grafana dashboards

2. **Define SLOs early**
   - Availability target
   - Latency target
   - Error rate target

3. **Use correlation IDs**
   - Track requests across services
   - Easier debugging

4. **Regular review**
   - Weekly SLO review
   - Monthly dashboard review
   - Quarterly objective review

5. **Alert fatigue prevention**
   - Set appropriate thresholds
   - Group related alerts
   - Use severity levels correctly

## References

- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [SRE Book - Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)
- [The Four Golden Signals](https://sre.google/sre-book/monitoring-distributed-systems/#xref_monitoring_golden-signals)
