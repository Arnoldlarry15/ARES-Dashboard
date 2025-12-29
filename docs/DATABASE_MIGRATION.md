# Database Migration Guide

## Overview

This guide covers migrating from localStorage to a persistent PostgreSQL database using Prisma ORM.

## What Changed

### Before (localStorage)
- Campaign data stored in browser localStorage
- User sessions stored in browser
- Audit logs stored locally
- Data lost when clearing browser cache
- No multi-user support
- No true persistence

### After (PostgreSQL + Prisma)
- ✅ Durable data persistence across sessions
- ✅ Multi-user support with proper isolation
- ✅ Comprehensive audit trails for compliance
- ✅ Scalable backend infrastructure
- ✅ Production-ready database layer

## Quick Start

### 1. Setup Database

Choose one of these options:

#### Option A: Neon (Recommended - Serverless PostgreSQL)
```bash
# 1. Sign up at https://neon.tech
# 2. Create a new project
# 3. Copy the connection string
# 4. Add to .env file:
DATABASE_URL="postgresql://user:password@ep-xyz.neon.tech/neondb"
```

#### Option B: Supabase (PostgreSQL with extras)
```bash
# 1. Sign up at https://supabase.com
# 2. Create a new project
# 3. Go to Settings > Database
# 4. Copy connection string (use "Transaction" pooler)
# 5. Add to .env file:
DATABASE_URL="postgresql://postgres:password@db.xyz.supabase.co:5432/postgres"
```

#### Option C: Local PostgreSQL
```bash
# Install PostgreSQL locally
# Create database
createdb ares_dashboard

# Add to .env file:
DATABASE_URL="postgresql://postgres:password@localhost:5432/ares_dashboard"
```

### 2. Initialize Database Schema

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (for development)
npm run db:push

# OR create a migration (for production)
npm run db:migrate
```

### 3. Verify Setup

```bash
# Open Prisma Studio to view database
npm run db:studio
```

## Database Schema

### Core Models

#### User
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      String   // admin, red_team_lead, analyst, viewer
  orgId     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  lastLogin DateTime?
  campaigns Campaign[]
  auditLogs AuditLog[]
}
```

#### Campaign
```prisma
model Campaign {
  id          String   @id @default(cuid())
  name        String
  description String?
  framework   String
  tacticId    String
  tacticName  String
  createdBy   String
  creator     User     @relation(fields: [createdBy], references: [id])
  selectedVectors        String[]
  selectedPayloadIndices Int[]
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

#### AuditLog
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  actorId   String
  actor     User     @relation(fields: [actorId], references: [id])
  action    String
  target    String
  details   Json?
  ipAddress String?
  userAgent String?
  timestamp DateTime @default(now())
}
```

## API Endpoints

### Users

```typescript
// Get user by email
GET /api/users?email=user@example.com

// Get user by ID
GET /api/users?id=clxxx

// Get all users in org
GET /api/users?orgId=org123

// Create user
POST /api/users
{
  "email": "user@example.com",
  "name": "John Doe",
  "role": "analyst",
  "orgId": "org123"
}

// Update user
PUT /api/users
{
  "id": "clxxx",
  "name": "Jane Doe",
  "role": "red_team_lead"
}

// Delete user
DELETE /api/users?id=clxxx
```

### Campaigns

```typescript
// Get all campaigns
GET /api/campaigns

// Get campaigns by user
GET /api/campaigns?userId=clxxx

// Get campaign by ID
GET /api/campaigns?id=clxxx

// Search campaigns
GET /api/campaigns?search=phishing&userId=clxxx

// Create campaign
POST /api/campaigns
{
  "name": "Q4 Phishing Campaign",
  "description": "Testing phishing vectors",
  "framework": "OWASP",
  "tacticId": "LLM01",
  "tacticName": "Prompt Injection",
  "createdBy": "clxxx",
  "selectedVectors": ["vector1", "vector2"],
  "selectedPayloadIndices": [0, 1, 2],
  "metadata": {}
}

// Update campaign
PUT /api/campaigns
{
  "id": "clxxx",
  "name": "Updated Campaign Name",
  "description": "Updated description"
}

// Delete campaign
DELETE /api/campaigns?id=clxxx&userId=clxxx
```

### Audit Logs

```typescript
// Get all audit logs
GET /api/audit-logs

// Get audit logs with filters
GET /api/audit-logs?actorId=clxxx&action=campaign_created

// Get audit logs with pagination
GET /api/audit-logs?skip=0&take=50

// Get audit logs by date range
GET /api/audit-logs?startDate=2024-01-01&endDate=2024-12-31

// Create audit log
POST /api/audit-logs
{
  "actorId": "clxxx",
  "action": "campaign_created",
  "target": "campaign_id",
  "details": { "name": "Campaign Name" },
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

## Migration from localStorage

### Export Existing Data

```typescript
// In browser console, export existing campaigns
const campaigns = localStorage.getItem('ares_campaigns');
console.log(campaigns);
// Copy the output
```

### Import to Database

```typescript
// Use API to import each campaign
const campaigns = JSON.parse(exportedData);

for (const campaign of campaigns) {
  await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: campaign.name,
      description: campaign.description,
      framework: campaign.framework,
      tacticId: campaign.tactic_id,
      tacticName: campaign.tactic_name,
      createdBy: userId, // Current user ID
      selectedVectors: campaign.selected_vectors,
      selectedPayloadIndices: campaign.selected_payload_indices,
      metadata: {}
    })
  });
}
```

## Environment Variables

Add to your `.env.local` file:

```bash
# Database Connection
DATABASE_URL="postgresql://user:password@host:5432/database"

# Optional: For Prisma Migrate
SHADOW_DATABASE_URL="postgresql://user:password@host:5432/shadow_db"
```

For production deployment (Vercel):

1. Go to Project Settings > Environment Variables
2. Add `DATABASE_URL` with your production database URL
3. Redeploy

## Prisma Commands

```bash
# Generate Prisma Client
npm run db:generate

# Push schema changes (dev)
npm run db:push

# Create a migration (prod)
npm run db:migrate

# Open Prisma Studio
npm run db:studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Pull schema from existing database
npx prisma db pull
```

## Troubleshooting

### Connection Issues

```bash
# Test database connection
npx prisma db pull
```

If you see connection errors:
- Verify DATABASE_URL is correct
- Check firewall/security group settings
- Ensure database is accessible from your IP
- For cloud databases, add your IP to allowed list

### Schema Sync Issues

```bash
# If schema is out of sync
npm run db:push
```

### Migration Issues

```bash
# If migrations fail
npx prisma migrate resolve --rolled-back <migration-name>
npx prisma migrate deploy
```

## Production Deployment

### Vercel

1. Add DATABASE_URL to environment variables
2. Prisma Client is generated automatically during build
3. No additional configuration needed

### Docker

```dockerfile
# Add to Dockerfile
RUN npm run db:generate

# Before starting app
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
```

### Best Practices

1. **Connection Pooling**: Use a connection pooler (PgBouncer) for serverless
2. **Migrations**: Always use migrations in production
3. **Backups**: Set up automated backups
4. **Monitoring**: Monitor query performance
5. **Security**: Use SSL connections, rotate credentials

## Support

For issues or questions:
- Check [Prisma Documentation](https://www.prisma.io/docs)
- See [DATABASE.md](database/DATABASE.md) for PostgreSQL details
- Open an issue on GitHub

## Next Steps

1. Set up your database (Neon, Supabase, or local)
2. Configure DATABASE_URL in `.env.local`
3. Run `npm run db:push` to create tables
4. Test API endpoints
5. Migrate existing data if needed
6. Deploy to production with database URL
