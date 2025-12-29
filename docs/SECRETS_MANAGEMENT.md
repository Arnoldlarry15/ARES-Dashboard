# Secrets Management Guide

## Overview

This guide covers best practices for managing secrets, API keys, and credentials in ARES Dashboard. Proper secrets management is critical for security and compliance.

## Secret Types

ARES Dashboard uses the following types of secrets:

| Secret Type | Example | Purpose | Rotation Frequency |
|-------------|---------|---------|-------------------|
| Database credentials | `DATABASE_URL` | PostgreSQL connection | 90 days |
| API keys | `GEMINI_API_KEY` | External service access | 180 days |
| JWT secrets | `JWT_SECRET`, `JWT_REFRESH_SECRET` | Token signing | 365 days |
| OAuth credentials | `AUTH0_CLIENT_SECRET` | Identity provider | Per provider policy |
| SAML certificates | `SAML_CERT`, `SAML_PRIVATE_KEY` | SAML authentication | 365 days |
| Encryption keys | `ENCRYPTION_KEY` | Data encryption | 365 days |
| Session secrets | `SESSION_SECRET` | Session management | 180 days |

## Secret Storage

### Development

**`.env.local` (Git-ignored):**

```bash
# Never commit this file to version control
DATABASE_URL="postgresql://user:pass@localhost:5432/ares_dev"
GEMINI_API_KEY="your_dev_api_key"
JWT_SECRET="dev_jwt_secret_change_in_production"
JWT_REFRESH_SECRET="dev_refresh_secret_change_in_production"
```

**Best Practices:**
- Use `.env.local` for local development
- Add `.env.local` to `.gitignore`
- Use weak/test secrets in development
- Never use production secrets locally

### Production

#### Option 1: Vercel Environment Variables (Recommended)

**Web UI:**
1. Navigate to your project in Vercel
2. Go to Settings → Environment Variables
3. Add each secret with appropriate scope (Production/Preview/Development)

**CLI:**
```bash
# Add production secret
vercel env add GEMINI_API_KEY production

# Add secret to all environments
vercel env add JWT_SECRET production preview development

# Pull secrets for local development
vercel env pull .env.local
```

**Features:**
- ✅ Encrypted at rest
- ✅ Access control via team permissions
- ✅ Automatic injection into serverless functions
- ✅ No secrets in code or version control
- ✅ Audit logging

#### Option 2: AWS Secrets Manager

**Setup:**

```bash
# Install AWS CLI
aws configure

# Create secrets
aws secretsmanager create-secret \
  --name ares/production/database-url \
  --secret-string "postgresql://user:pass@host:5432/ares"

aws secretsmanager create-secret \
  --name ares/production/jwt-secret \
  --secret-string "$(openssl rand -base64 32)"
```

**Runtime retrieval:**

```typescript
// utils/secrets.ts
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });

export async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString || '';
}

// Usage
const databaseUrl = await getSecret('ares/production/database-url');
```

**Features:**
- ✅ Automatic rotation support
- ✅ Fine-grained IAM permissions
- ✅ Audit logging via CloudTrail
- ✅ Cross-region replication
- ✅ Version management

#### Option 3: HashiCorp Vault

**Setup:**

```bash
# Install Vault CLI
vault login

# Enable KV secrets engine
vault secrets enable -path=ares kv-v2

# Store secrets
vault kv put ares/production database_url="postgresql://..." \
  jwt_secret="$(openssl rand -base64 32)" \
  gemini_api_key="..."
```

**Runtime retrieval:**

```typescript
// utils/vault.ts
import vault from 'node-vault';

const client = vault({
  apiVersion: 'v1',
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
});

export async function getSecret(path: string): Promise<Record<string, string>> {
  const result = await client.read(`ares/data/${path}`);
  return result.data.data;
}

// Usage
const secrets = await getSecret('production');
const databaseUrl = secrets.database_url;
```

**Features:**
- ✅ Dynamic secrets
- ✅ Automatic rotation
- ✅ Fine-grained access control
- ✅ Audit logging
- ✅ Multi-cloud support

#### Option 4: Kubernetes Secrets

**Create secret:**

```bash
# From literal values
kubectl create secret generic ares-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=jwt-secret="$(openssl rand -base64 32)"

# From files
kubectl create secret generic ares-secrets \
  --from-file=saml-cert=./saml.crt \
  --from-file=saml-key=./saml.key
```

**Use in deployment:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: ares-dashboard
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ares-secrets
              key: database-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: ares-secrets
              key: jwt-secret
```

**Features:**
- ✅ Native Kubernetes integration
- ✅ Encrypted at rest (with encryption provider)
- ✅ RBAC integration
- ✅ Easy rollback

## Secret Generation

### JWT Secrets

```bash
# Generate 32-byte random secret
openssl rand -base64 32

# Generate 64-byte random secret (recommended)
openssl rand -base64 64
```

**Requirements:**
- Minimum 32 bytes (256 bits)
- Cryptographically random
- Different secrets for JWT_SECRET and JWT_REFRESH_SECRET

### Session Secrets

```bash
# Generate session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Encryption Keys

```bash
# Generate AES-256 key
openssl rand -hex 32

# Generate RSA key pair
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -outform PEM -pubout -out public.pem
```

### SAML Certificates

```bash
# Generate self-signed certificate (development only)
openssl req -x509 -newkey rsa:2048 -keyout saml.key -out saml.crt -days 365 -nodes

# For production, use certificates from your CA or IdP
```

## Secret Rotation

### Rotation Schedule

| Secret Type | Frequency | Priority |
|-------------|-----------|----------|
| Database credentials | 90 days | High |
| API keys | 180 days | Medium |
| JWT secrets | 365 days | High |
| OAuth credentials | Per provider | High |
| SAML certificates | 365 days | High |
| Encryption keys | 365 days | Critical |

### Rotation Process

#### 1. Database Credentials

**Zero-downtime rotation:**

```bash
# Step 1: Create new user with same permissions
psql $DATABASE_URL -c "CREATE USER ares_new WITH PASSWORD 'new_password';"
psql $DATABASE_URL -c "GRANT ALL PRIVILEGES ON DATABASE ares TO ares_new;"

# Step 2: Update application config with new credentials
# (Deploy new version with new DATABASE_URL)

# Step 3: Wait for all instances to use new credentials
sleep 300

# Step 4: Revoke old user
psql $DATABASE_URL -c "DROP USER ares_old;"
```

#### 2. JWT Secrets

**Dual-secret rotation:**

```typescript
// Support both old and new secrets during rotation
const JWT_SECRETS = [
  process.env.JWT_SECRET,           // Current
  process.env.JWT_SECRET_PREVIOUS   // Previous (during rotation)
].filter(Boolean);

function verifyToken(token: string) {
  for (const secret of JWT_SECRETS) {
    try {
      return jwt.verify(token, secret);
    } catch (e) {
      continue;
    }
  }
  throw new Error('Invalid token');
}
```

**Rotation steps:**

```bash
# Step 1: Generate new secret
NEW_SECRET=$(openssl rand -base64 64)

# Step 2: Set both secrets
vercel env add JWT_SECRET_PREVIOUS production  # Set to current JWT_SECRET
vercel env add JWT_SECRET production           # Set to NEW_SECRET

# Step 3: Deploy with dual-secret support

# Step 4: Wait for all tokens to expire (24 hours)

# Step 5: Remove old secret
vercel env rm JWT_SECRET_PREVIOUS production
```

#### 3. API Keys (Gemini, etc.)

```bash
# Step 1: Generate new API key in provider dashboard

# Step 2: Add new key alongside old key
vercel env add GEMINI_API_KEY_NEW production

# Step 3: Update code to try both keys
# (Or deploy with new key immediately if provider supports it)

# Step 4: Monitor for errors

# Step 5: Remove old key
vercel env rm GEMINI_API_KEY production
vercel env add GEMINI_API_KEY production  # Set to GEMINI_API_KEY_NEW
vercel env rm GEMINI_API_KEY_NEW production
```

#### 4. OAuth Credentials

Follow your identity provider's rotation process:

**Auth0:**
1. Navigate to Application Settings
2. Click "Rotate Secret"
3. Update `AUTH0_CLIENT_SECRET` environment variable
4. Deploy

**Azure AD:**
1. Add new client secret in Azure Portal
2. Update `AZURE_AD_CLIENT_SECRET` environment variable
3. Deploy
4. Wait 24 hours
5. Remove old secret from Azure

### Automated Rotation

**AWS Lambda example:**

```typescript
// scripts/rotate-secrets.ts
import { SecretsManagerClient, RotateSecretCommand } from "@aws-sdk/client-secrets-manager";

export async function rotateSecret(secretName: string) {
  const client = new SecretsManagerClient({ region: "us-east-1" });
  
  const command = new RotateSecretCommand({
    SecretId: secretName,
    RotationLambdaARN: "arn:aws:lambda:us-east-1:123456789:function:ares-rotate-secret",
    RotationRules: {
      AutomaticallyAfterDays: 90
    }
  });
  
  await client.send(command);
}
```

**Vault automatic rotation:**

```hcl
# vault-rotation-policy.hcl
path "database/creds/ares" {
  capabilities = ["read"]
}

path "database/config/ares" {
  capabilities = ["update"]
}
```

## Secret Scanning

### Pre-commit Hooks

**Install git-secrets:**

```bash
# Install
brew install git-secrets  # macOS
# or
sudo apt-get install git-secrets  # Linux

# Setup
cd /path/to/ares-dashboard
git secrets --install
git secrets --register-aws
```

**Custom patterns:**

```bash
# Add custom patterns
git secrets --add 'JWT_SECRET=[a-zA-Z0-9+/]{43,}='
git secrets --add 'GEMINI_API_KEY=[a-zA-Z0-9_-]{30,}'
git secrets --add 'postgresql://[^@]+:[^@]+@'
```

### CI/CD Scanning

**GitHub Actions:**

```yaml
# .github/workflows/secret-scan.yml
name: Secret Scan

on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: TruffleHog Secret Scan
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
```

### Incident Response

**If a secret is leaked:**

1. **Immediate actions (< 5 minutes):**
   ```bash
   # Revoke the compromised secret
   vercel env rm COMPROMISED_SECRET production
   
   # Generate new secret
   NEW_SECRET=$(openssl rand -base64 64)
   vercel env add COMPROMISED_SECRET production
   
   # Deploy immediately
   vercel --prod
   ```

2. **Investigation (< 30 minutes):**
   - Check audit logs for unauthorized access
   - Review application logs for suspicious activity
   - Check database for unauthorized changes

3. **Notification (< 1 hour):**
   - Notify security team
   - Document incident
   - Update stakeholders if needed

4. **Post-incident (< 24 hours):**
   - Conduct root cause analysis
   - Update procedures
   - Implement additional controls

## Monitoring

### Secret Expiration

**Track secret age:**

```typescript
// scripts/check-secret-age.ts
const secretMetadata = {
  'JWT_SECRET': {
    createdAt: '2024-01-01',
    maxAge: 365
  },
  'DATABASE_PASSWORD': {
    createdAt: '2024-10-01',
    maxAge: 90
  }
};

function checkExpiration() {
  const now = new Date();
  const alerts: string[] = [];
  
  for (const [name, metadata] of Object.entries(secretMetadata)) {
    const age = (now.getTime() - new Date(metadata.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const daysUntilExpiry = metadata.maxAge - age;
    
    if (daysUntilExpiry < 30) {
      alerts.push(`${name} expires in ${Math.floor(daysUntilExpiry)} days`);
    }
  }
  
  return alerts;
}
```

### Alerts

**Prometheus alerts:**

```yaml
# alerts/secrets.yml
groups:
  - name: secrets
    rules:
      - alert: SecretExpiringSoon
        expr: secret_age_days > (secret_max_age_days - 30)
        labels:
          severity: warning
        annotations:
          summary: "Secret {{ $labels.secret_name }} expiring soon"
          description: "Secret will expire in {{ $value }} days"
      
      - alert: SecretExpired
        expr: secret_age_days > secret_max_age_days
        labels:
          severity: critical
        annotations:
          summary: "Secret {{ $labels.secret_name }} has expired"
          description: "Immediate rotation required"
```

## Best Practices

### Development

1. ✅ Never commit secrets to version control
2. ✅ Use `.env.local` for local development
3. ✅ Use weak/test secrets in development
4. ✅ Document all required secrets in `.env.example`
5. ✅ Use pre-commit hooks to prevent leaks

### Production

1. ✅ Use dedicated secret management service
2. ✅ Enable encryption at rest
3. ✅ Implement least privilege access
4. ✅ Enable audit logging
5. ✅ Rotate secrets regularly
6. ✅ Monitor for expiration
7. ✅ Use different secrets per environment
8. ✅ Implement secret versioning
9. ✅ Have incident response plan
10. ✅ Regular security audits

### Code

1. ✅ Never hardcode secrets
2. ✅ Never log secret values
3. ✅ Mask secrets in error messages
4. ✅ Use environment variables
5. ✅ Validate secret format before use
6. ✅ Clear secrets from memory after use
7. ✅ Use secure comparison for secret validation

**Example:**

```typescript
// ❌ BAD - Hardcoded secret
const JWT_SECRET = 'my-secret-key';

// ✅ GOOD - From environment
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET not configured');
}

// ❌ BAD - Logging secret
console.log('JWT Secret:', JWT_SECRET);

// ✅ GOOD - Not logging secret
console.log('JWT Secret configured');

// ❌ BAD - Timing attack vulnerable
if (providedSecret === JWT_SECRET) { }

// ✅ GOOD - Constant-time comparison
import { timingSafeEqual } from 'crypto';
const isValid = timingSafeEqual(
  Buffer.from(providedSecret),
  Buffer.from(JWT_SECRET)
);
```

## Compliance

### Requirements

**SOC 2:**
- Encryption at rest and in transit
- Access controls and audit logging
- Regular rotation
- Incident response procedures

**PCI DSS:**
- No storage of authentication data
- Encryption of cardholder data
- Regular testing of security systems

**GDPR:**
- Data encryption
- Access controls
- Right to erasure support

### Audit Trail

Log all secret operations:

```typescript
// utils/audit-secrets.ts
import { auditLog } from './audit';

export async function rotateSecret(secretName: string, actor: string) {
  await auditLog({
    action: 'secret_rotated',
    actor,
    resource: secretName,
    timestamp: new Date(),
    metadata: {
      previousAge: calculateSecretAge(secretName)
    }
  });
}
```

## Tools

### Secret Management

- **AWS Secrets Manager** - AWS-native solution
- **HashiCorp Vault** - Multi-cloud, feature-rich
- **Azure Key Vault** - Azure-native solution
- **Google Secret Manager** - GCP-native solution
- **Doppler** - Developer-friendly, cross-platform

### Secret Scanning

- **TruffleHog** - Open source secret scanner
- **git-secrets** - Prevents committing secrets
- **GitGuardian** - Real-time secret detection
- **GitHub Secret Scanning** - Native GitHub feature

### Rotation

- **AWS Lambda** - Automated rotation functions
- **Kubernetes CronJobs** - Scheduled rotation
- **Vault** - Built-in rotation support

## References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [HashiCorp Vault Best Practices](https://learn.hashicorp.com/tutorials/vault/production-hardening)
- [NIST SP 800-57: Key Management](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
