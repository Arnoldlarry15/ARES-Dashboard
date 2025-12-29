# ARES Dashboard Helm Chart

Deploy ARES Dashboard to Kubernetes using Helm.

## Prerequisites

- Kubernetes 1.21+
- Helm 3.8+
- PV provisioner support in the underlying infrastructure (for PostgreSQL persistence)
- Ingress controller (nginx recommended)
- cert-manager (for automatic TLS certificates)

## Installation

### Quick Start

```bash
# Add Helm repository (when published)
helm repo add ares https://arnoldlarry15.github.io/ARES-Dashboard/helm
helm repo update

# Install with default values
helm install ares-dashboard ares/ares-dashboard
```

### From Source

```bash
# Clone repository
git clone https://github.com/Arnoldlarry15/ARES-Dashboard.git
cd ARES-Dashboard/helm

# Install chart
helm install ares-dashboard ./ares-dashboard
```

### Custom Installation

```bash
# Install with custom values
helm install ares-dashboard ./ares-dashboard \
  --set image.tag=1.0.0 \
  --set ingress.hosts[0].host=ares.example.com \
  --set postgresql.auth.password=securepassword

# Install with values file
helm install ares-dashboard ./ares-dashboard -f custom-values.yaml
```

## Configuration

### Basic Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `2` |
| `image.repository` | Image repository | `ghcr.io/arnoldlarry15/ares-dashboard` |
| `image.tag` | Image tag | `1.0.0` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |

### Service Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `service.type` | Kubernetes service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| `service.targetPort` | Container port | `3000` |

### Ingress Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class name | `nginx` |
| `ingress.hosts[0].host` | Hostname | `ares-dashboard.example.com` |
| `ingress.tls[0].secretName` | TLS secret name | `ares-dashboard-tls` |

### Resource Limits

| Parameter | Description | Default |
|-----------|-------------|---------|
| `resources.limits.cpu` | CPU limit | `1000m` |
| `resources.limits.memory` | Memory limit | `512Mi` |
| `resources.requests.cpu` | CPU request | `250m` |
| `resources.requests.memory` | Memory request | `256Mi` |

### Autoscaling

| Parameter | Description | Default |
|-----------|-------------|---------|
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `2` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU | `70` |
| `autoscaling.targetMemoryUtilizationPercentage` | Target memory | `80` |

### PostgreSQL Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `postgresql.enabled` | Enable PostgreSQL | `true` |
| `postgresql.auth.username` | Database username | `ares` |
| `postgresql.auth.password` | Database password | `changeme` |
| `postgresql.auth.database` | Database name | `ares_dashboard` |
| `postgresql.primary.persistence.size` | Volume size | `10Gi` |

### Secrets

| Parameter | Description | Default |
|-----------|-------------|---------|
| `secrets.existingSecret` | Name of existing secret | `ares-dashboard-secrets` |

## Secrets Management

Create a Kubernetes secret with required values:

```bash
kubectl create secret generic ares-dashboard-secrets \
  --from-literal=DATABASE_URL="postgresql://user:pass@host:5432/ares" \
  --from-literal=GEMINI_API_KEY="your_api_key" \
  --from-literal=JWT_SECRET="$(openssl rand -base64 64)" \
  --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 64)" \
  --from-literal=AUTH0_CLIENT_SECRET="your_client_secret"
```

Or use external-secrets-operator:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: ares-dashboard-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: ares-dashboard-secrets
  data:
  - secretKey: DATABASE_URL
    remoteRef:
      key: ares/production/database-url
  - secretKey: GEMINI_API_KEY
    remoteRef:
      key: ares/production/gemini-api-key
  - secretKey: JWT_SECRET
    remoteRef:
      key: ares/production/jwt-secret
```

## Examples

### Production Deployment

```yaml
# production-values.yaml
replicaCount: 3

image:
  tag: "1.0.0"
  pullPolicy: Always

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
  hosts:
    - host: ares.company.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ares-tls
      hosts:
        - ares.company.com

resources:
  limits:
    cpu: 2000m
    memory: 1Gi
  requests:
    cpu: 500m
    memory: 512Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 60
  targetMemoryUtilizationPercentage: 70

postgresql:
  enabled: true
  auth:
    password: "use-external-secret"
  primary:
    persistence:
      enabled: true
      size: 50Gi
      storageClass: gp3
  resources:
    limits:
      memory: 2Gi
      cpu: 1000m
    requests:
      memory: 1Gi
      cpu: 500m

monitoring:
  enabled: true
  serviceMonitor:
    enabled: true

networkPolicy:
  enabled: true

podDisruptionBudget:
  enabled: true
  minAvailable: 2
```

Deploy:

```bash
helm install ares-dashboard ./ares-dashboard -f production-values.yaml
```

### High Availability Setup

```yaml
# ha-values.yaml
replicaCount: 5

affinity:
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchExpressions:
            - key: app.kubernetes.io/name
              operator: In
              values:
                - ares-dashboard
        topologyKey: topology.kubernetes.io/zone

tolerations:
  - key: "dedicated"
    operator: "Equal"
    value: "ares"
    effect: "NoSchedule"

nodeSelector:
  workload: production

postgresql:
  enabled: true
  architecture: replication
  replication:
    enabled: true
  readReplicas:
    replicaCount: 2
```

### Development Environment

```yaml
# dev-values.yaml
replicaCount: 1

image:
  tag: "latest"
  pullPolicy: Always

resources:
  limits:
    cpu: 500m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi

autoscaling:
  enabled: false

postgresql:
  enabled: true
  primary:
    persistence:
      enabled: false  # Use emptyDir for dev

ingress:
  enabled: true
  hosts:
    - host: ares-dev.local
      paths:
        - path: /
          pathType: Prefix
  tls: []

monitoring:
  enabled: false

networkPolicy:
  enabled: false
```

## Upgrade

```bash
# Upgrade to new version
helm upgrade ares-dashboard ./ares-dashboard \
  --set image.tag=1.1.0 \
  --reuse-values

# Upgrade with new values
helm upgrade ares-dashboard ./ares-dashboard -f production-values.yaml
```

## Rollback

```bash
# List releases
helm history ares-dashboard

# Rollback to previous version
helm rollback ares-dashboard

# Rollback to specific revision
helm rollback ares-dashboard 3
```

## Uninstall

```bash
# Uninstall release
helm uninstall ares-dashboard

# Uninstall and delete PVCs
helm uninstall ares-dashboard
kubectl delete pvc -l app.kubernetes.io/instance=ares-dashboard
```

## Monitoring

### Prometheus Metrics

The chart includes a ServiceMonitor for Prometheus Operator:

```yaml
monitoring:
  enabled: true
  serviceMonitor:
    enabled: true
    interval: 30s
```

Access metrics:

```bash
kubectl port-forward svc/ares-dashboard 3000:80
curl http://localhost:3000/api/metrics
```

### Grafana Dashboard

Import the ARES Dashboard Grafana dashboard (ID: coming soon).

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -l app.kubernetes.io/name=ares-dashboard
kubectl describe pod <pod-name>
kubectl logs <pod-name>
```

### Check Ingress

```bash
kubectl get ingress
kubectl describe ingress ares-dashboard
```

### Check Database Connection

```bash
kubectl exec -it <pod-name> -- sh
# Inside pod
psql $DATABASE_URL -c "SELECT 1"
```

### Common Issues

**Pod CrashLoopBackOff:**
- Check logs: `kubectl logs <pod-name>`
- Verify secrets exist: `kubectl get secret ares-dashboard-secrets`
- Check environment variables: `kubectl exec <pod-name> -- env`

**Ingress not working:**
- Verify ingress controller is running
- Check cert-manager for TLS issues
- Verify DNS points to ingress IP

**Database connection failed:**
- Verify PostgreSQL pod is running
- Check DATABASE_URL format
- Verify network policies allow connection

## Security

### Pod Security

The chart enforces security best practices:

- Runs as non-root user (UID 1001)
- Read-only root filesystem
- Drops all capabilities
- No privilege escalation

### Network Policies

Enable network policies for production:

```yaml
networkPolicy:
  enabled: true
```

### Secret Management

Use external secret managers:

- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- Google Secret Manager

## Contributing

See [CONTRIBUTING.md](../../docs/CONTRIBUTING.md)

## License

See [LICENSE](../../LICENSE)

## Support

- [GitHub Issues](https://github.com/Arnoldlarry15/ARES-Dashboard/issues)
- [Documentation](https://github.com/Arnoldlarry15/ARES-Dashboard/tree/main/docs)
