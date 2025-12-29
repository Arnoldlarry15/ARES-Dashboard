# Operational Runbooks

## Overview

This document provides step-by-step procedures for common operational tasks and incident response scenarios for ARES Dashboard.

## Table of Contents

1. [Deployment](#deployment)
2. [Scaling](#scaling)
3. [Backup and Recovery](#backup-and-recovery)
4. [Monitoring and Alerts](#monitoring-and-alerts)
5. [Incident Response](#incident-response)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance](#maintenance)

## Deployment

### Initial Kubernetes Deployment

**Prerequisites:**
- Kubernetes cluster (1.21+)
- kubectl configured
- Helm 3.8+
- Secrets configured

**Procedure:**

```bash
# 1. Create namespace
kubectl create namespace ares-dashboard

# 2. Create secrets
kubectl create secret generic ares-dashboard-secrets \
  --from-literal=DATABASE_URL="postgresql://..." \
  --from-literal=GEMINI_API_KEY="..." \
  --from-literal=JWT_SECRET="$(openssl rand -base64 64)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 64)" \
  -n ares-dashboard

# 3. Install Helm chart
helm install ares-dashboard ./helm/ares-dashboard \
  --namespace ares-dashboard \
  --values production-values.yaml \
  --wait

# 4. Verify deployment
kubectl get pods -n ares-dashboard
kubectl get svc -n ares-dashboard
kubectl get ingress -n ares-dashboard

# 5. Check application health
kubectl port-forward svc/ares-dashboard 8080:80 -n ares-dashboard
curl http://localhost:8080/api/health

# 6. Verify metrics
curl http://localhost:8080/api/metrics
```

**Rollback:**

```bash
helm rollback ares-dashboard -n ares-dashboard
```

### Zero-Downtime Deployment Update

**Procedure:**

```bash
# 1. Update image version
helm upgrade ares-dashboard ./helm/ares-dashboard \
  --namespace ares-dashboard \
  --set image.tag=1.1.0 \
  --reuse-values \
  --wait

# 2. Monitor rollout
kubectl rollout status deployment/ares-dashboard -n ares-dashboard

# 3. Verify new version
kubectl get pods -n ares-dashboard -o jsonpath='{.items[0].spec.containers[0].image}'

# 4. Check health
curl https://ares.example.com/api/health

# If issues occur, rollback:
helm rollback ares-dashboard -n ares-dashboard
```

## Scaling

### Manual Scaling

**Scale up:**

```bash
# Increase replicas
kubectl scale deployment ares-dashboard --replicas=5 -n ares-dashboard

# Verify
kubectl get pods -n ares-dashboard
```

**Scale down:**

```bash
# Decrease replicas
kubectl scale deployment ares-dashboard --replicas=2 -n ares-dashboard

# Verify
kubectl get pods -n ares-dashboard
```

### Auto-scaling Configuration

**Enable HPA:**

```bash
# Create HPA
kubectl autoscale deployment ares-dashboard \
  --cpu-percent=70 \
  --min=2 \
  --max=10 \
  -n ares-dashboard

# Verify
kubectl get hpa -n ares-dashboard
```

**Monitor auto-scaling:**

```bash
# Watch HPA
kubectl get hpa -n ares-dashboard -w

# Check metrics
kubectl top pods -n ares-dashboard
```

### Database Scaling

**Vertical scaling (increase resources):**

```bash
# Update PostgreSQL resources
helm upgrade ares-dashboard ./helm/ares-dashboard \
  --set postgresql.resources.limits.memory=2Gi \
  --set postgresql.resources.limits.cpu=1000m \
  --reuse-values \
  -n ares-dashboard
```

**Horizontal scaling (read replicas):**

```bash
# Enable replication
helm upgrade ares-dashboard ./helm/ares-dashboard \
  --set postgresql.architecture=replication \
  --set postgresql.readReplicas.replicaCount=2 \
  --reuse-values \
  -n ares-dashboard
```

## Backup and Recovery

### Database Backup

**Manual backup:**

```bash
# 1. Create backup
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  pg_dump -U ares ares_dashboard | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# 2. Upload to S3
aws s3 cp backup_*.sql.gz s3://ares-backups/

# 3. Verify backup
aws s3 ls s3://ares-backups/
```

**Automated backup (CronJob):**

```yaml
# backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ares-db-backup
  namespace: ares-dashboard
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            env:
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: ares-postgresql
                  key: password
            command:
            - /bin/sh
            - -c
            - |
              pg_dump -h ares-postgresql -U ares ares_dashboard | \
              gzip > /backup/ares_$(date +%Y%m%d_%H%M%S).sql.gz
              aws s3 sync /backup/ s3://ares-backups/
          restartPolicy: OnFailure
```

### Database Recovery

**Restore from backup:**

```bash
# 1. Download backup
aws s3 cp s3://ares-backups/backup_20250101_020000.sql.gz .

# 2. Stop application (prevent writes)
kubectl scale deployment ares-dashboard --replicas=0 -n ares-dashboard

# 3. Restore database
gunzip -c backup_20250101_020000.sql.gz | \
kubectl exec -i ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard

# 4. Verify data
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT COUNT(*) FROM campaigns;"

# 5. Restart application
kubectl scale deployment ares-dashboard --replicas=3 -n ares-dashboard

# 6. Verify application
curl https://ares.example.com/api/health
```

### Point-in-Time Recovery (PostgreSQL)

**Enable WAL archiving:**

```yaml
# PostgreSQL configuration
postgresql:
  primary:
    extraEnvVars:
    - name: POSTGRES_WAL_LEVEL
      value: "replica"
    - name: POSTGRES_ARCHIVE_MODE
      value: "on"
    - name: POSTGRES_ARCHIVE_COMMAND
      value: "aws s3 cp %p s3://ares-wal-archive/%f"
```

**Perform PITR:**

```bash
# 1. Restore base backup
# 2. Create recovery.conf with target time
# 3. PostgreSQL replays WAL logs until target time
# See PostgreSQL PITR documentation for details
```

## Monitoring and Alerts

### Check System Health

**Application health:**

```bash
# Health endpoint
curl https://ares.example.com/api/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-12-29T12:00:00.000Z",
#   "version": "1.0.0",
#   "uptime": 3600,
#   "checks": {
#     "database": { "status": "healthy", "latency": 15 },
#     "cache": { "status": "healthy", "latency": 5 }
#   }
# }
```

**Metrics:**

```bash
# Prometheus metrics
curl https://ares.example.com/api/metrics

# Key metrics to check:
# - http_requests_total
# - http_request_duration_seconds
# - auth_success_total
# - db_connections_active
```

**Kubernetes health:**

```bash
# Pod status
kubectl get pods -n ares-dashboard

# Pod logs
kubectl logs -f deployment/ares-dashboard -n ares-dashboard

# Events
kubectl get events -n ares-dashboard --sort-by='.lastTimestamp'
```

### Alert Response

**High Error Rate Alert**

**Symptoms:**
- Error rate >1%
- Alert: "ErrorRateAboveSLO"

**Investigation:**

```bash
# 1. Check error rate
curl https://ares.example.com/api/metrics | grep http_requests_errors

# 2. Check logs
kubectl logs -n ares-dashboard -l app.kubernetes.io/name=ares-dashboard | grep ERROR

# 3. Check recent deployments
kubectl rollout history deployment/ares-dashboard -n ares-dashboard

# 4. Check database
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT pg_is_in_recovery();"
```

**Resolution:**

```bash
# If caused by recent deployment:
helm rollback ares-dashboard -n ares-dashboard

# If database issue:
# Check database logs and restart if needed
kubectl delete pod ares-postgresql-0 -n ares-dashboard

# If configuration issue:
# Update configuration and redeploy
helm upgrade ares-dashboard ./helm/ares-dashboard \
  --reuse-values \
  --set config.key=value \
  -n ares-dashboard
```

**High Latency Alert**

**Symptoms:**
- P95 latency >500ms
- Alert: "LatencyAboveSLO"

**Investigation:**

```bash
# 1. Check current latency
curl https://ares.example.com/api/metrics | grep http_request_duration

# 2. Check database query performance
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"

# 3. Check pod resources
kubectl top pods -n ares-dashboard

# 4. Check network latency
kubectl exec -it ares-dashboard-xyz -n ares-dashboard -- \
  ping ares-postgresql
```

**Resolution:**

```bash
# If resource constrained:
kubectl scale deployment ares-dashboard --replicas=5 -n ares-dashboard

# If database slow:
# Add indexes, optimize queries, or scale database

# If external service slow:
# Implement caching or circuit breaker
```

## Incident Response

### Security Incident

**Suspected Breach:**

```bash
# 1. Isolate affected systems
kubectl cordon <affected-node>
kubectl scale deployment ares-dashboard --replicas=0 -n ares-dashboard

# 2. Preserve evidence
kubectl cp ares-dashboard-xyz:/var/log/ares ./evidence/ -n ares-dashboard
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  pg_dump -U ares ares_dashboard > evidence/database_snapshot.sql

# 3. Review audit logs
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 1000;"

# 4. Check for unauthorized changes
kubectl diff -f deployment.yaml

# 5. Rotate secrets
kubectl delete secret ares-dashboard-secrets -n ares-dashboard
kubectl create secret generic ares-dashboard-secrets ... -n ares-dashboard

# 6. Restart with new secrets
kubectl rollout restart deployment/ares-dashboard -n ares-dashboard

# 7. Document incident
# Follow INCIDENT_RESPONSE.md procedures
```

### Data Loss

**Accidental deletion:**

```bash
# 1. Identify affected data
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT * FROM campaigns WHERE deleted_at IS NOT NULL;"

# 2. Restore from backup
# See "Database Recovery" section above

# 3. Verify restoration
# Query affected records

# 4. Document incident
# Update procedures to prevent recurrence
```

## Troubleshooting

### Pod Crash Loop

**Symptoms:**
- Pod status: CrashLoopBackOff
- Pod restart count increasing

**Investigation:**

```bash
# 1. Check pod logs
kubectl logs ares-dashboard-xyz -n ares-dashboard
kubectl logs ares-dashboard-xyz -n ares-dashboard --previous

# 2. Describe pod
kubectl describe pod ares-dashboard-xyz -n ares-dashboard

# 3. Check events
kubectl get events -n ares-dashboard | grep ares-dashboard-xyz

# 4. Check resources
kubectl top pod ares-dashboard-xyz -n ares-dashboard
```

**Common causes and fixes:**

```bash
# Missing secrets:
kubectl get secret ares-dashboard-secrets -n ares-dashboard
# Create if missing

# Database connection failure:
kubectl exec -it ares-dashboard-xyz -n ares-dashboard -- \
  nc -zv ares-postgresql 5432
# Check DATABASE_URL

# OOM (Out of Memory):
# Increase memory limits in values.yaml

# Application error:
# Check logs for stack trace
# Fix application bug and redeploy
```

### Database Connection Issues

**Symptoms:**
- "Cannot connect to database" errors
- High connection count

**Investigation:**

```bash
# 1. Check database status
kubectl get pods -n ares-dashboard | grep postgresql

# 2. Check database logs
kubectl logs ares-postgresql-0 -n ares-dashboard

# 3. Check connection count
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT count(*) FROM pg_stat_activity;"

# 4. Check for long-running queries
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC;"
```

**Resolution:**

```bash
# Restart database:
kubectl delete pod ares-postgresql-0 -n ares-dashboard

# Kill long-running queries:
kubectl exec -it ares-postgresql-0 -n ares-dashboard -- \
  psql -U ares ares_dashboard -c "SELECT pg_terminate_backend(<pid>);"

# Increase connection pool:
helm upgrade ares-dashboard ./helm/ares-dashboard \
  --set postgresql.primary.extraEnvVars[0].name=POSTGRES_MAX_CONNECTIONS \
  --set postgresql.primary.extraEnvVars[0].value=200 \
  --reuse-values \
  -n ares-dashboard
```

## Maintenance

### Routine Maintenance Tasks

**Daily:**
- [ ] Check system health
- [ ] Review error logs
- [ ] Monitor disk space
- [ ] Verify backups

**Weekly:**
- [ ] Review performance metrics
- [ ] Check for security updates
- [ ] Review audit logs
- [ ] Test disaster recovery

**Monthly:**
- [ ] Rotate secrets
- [ ] Update dependencies
- [ ] Review access controls
- [ ] Archive old data

### Scheduled Maintenance Window

**Pre-maintenance:**

```bash
# 1. Notify users
# Post maintenance announcement

# 2. Create backup
# See "Database Backup" section

# 3. Document current state
kubectl get all -n ares-dashboard > pre-maintenance-state.txt
```

**During maintenance:**

```bash
# 1. Put in maintenance mode
kubectl scale deployment ares-dashboard --replicas=0 -n ares-dashboard

# 2. Perform maintenance tasks
# - Database upgrades
# - Schema migrations
# - Infrastructure changes

# 3. Test changes
# Run smoke tests
```

**Post-maintenance:**

```bash
# 1. Restore service
kubectl scale deployment ares-dashboard --replicas=3 -n ares-dashboard

# 2. Verify functionality
curl https://ares.example.com/api/health

# 3. Monitor closely
kubectl logs -f deployment/ares-dashboard -n ares-dashboard

# 4. Update documentation
# Document any changes made
```

## Emergency Procedures

### Emergency Rollback

```bash
# Quick rollback to previous version
helm rollback ares-dashboard -n ares-dashboard

# Verify
kubectl get pods -n ares-dashboard
curl https://ares.example.com/api/health
```

### Emergency Database Restore

```bash
# Stop application
kubectl scale deployment ares-dashboard --replicas=0 -n ares-dashboard

# Restore latest backup
# See "Database Recovery" section

# Start application
kubectl scale deployment ares-dashboard --replicas=3 -n ares-dashboard
```

### Emergency Secret Rotation

```bash
# Generate new secrets
NEW_JWT_SECRET=$(openssl rand -base64 64)

# Update secret
kubectl create secret generic ares-dashboard-secrets-new \
  --from-literal=JWT_SECRET="$NEW_JWT_SECRET" \
  ... \
  -n ares-dashboard

# Update deployment to use new secret
kubectl patch deployment ares-dashboard \
  -n ares-dashboard \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"ares-dashboard","envFrom":[{"secretRef":{"name":"ares-dashboard-secrets-new"}}]}]}}}}'

# Verify
kubectl get pods -n ares-dashboard
```

## Contact Information

### On-Call Rotation

- **Primary**: oncall-primary@example.com
- **Secondary**: oncall-secondary@example.com
- **Escalation**: oncall-manager@example.com

### External Contacts

- **Cloud Provider**: support@provider.com
- **Database Support**: db-support@provider.com
- **Security Team**: security@example.com

## References

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Helm Documentation](https://helm.sh/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
