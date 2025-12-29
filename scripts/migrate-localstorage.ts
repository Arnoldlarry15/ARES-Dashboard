#!/usr/bin/env tsx
/**
 * Migration Script: localStorage to Database
 * 
 * This script helps migrate existing data from localStorage to the PostgreSQL database.
 * Run this in the browser console or as a standalone script.
 * 
 * Usage:
 *   1. In browser console: Copy and paste this script
 *   2. From command line: npm run migrate:localstorage
 */

interface LocalStorageCampaign {
  id: string;
  name: string;
  description?: string;
  tactic_id: string;
  tactic_name: string;
  framework: string;
  selected_vectors: string[];
  selected_payload_indices: number[];
  created_at: string;
  updated_at: string;
}

interface LocalStorageAuditLog {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  session_id?: string;
}

/**
 * Browser-based migration (run in console)
 */
async function migrateInBrowser() {
  console.log('🚀 Starting localStorage to Database Migration...\n');

  // Get current user ID (needed for campaigns)
  const session = localStorage.getItem('ares_auth_session');
  if (!session) {
    console.error('❌ No authenticated session found. Please log in first.');
    return;
  }

  const { user } = JSON.parse(session);
  const userId = user.id;

  // Migrate Campaigns
  console.log('📦 Migrating campaigns...');
  const campaignsData = localStorage.getItem('ares_campaigns');
  
  if (campaignsData) {
    try {
      const campaigns: LocalStorageCampaign[] = JSON.parse(campaignsData);
      console.log(`   Found ${campaigns.length} campaigns to migrate`);

      let successCount = 0;
      let failCount = 0;

      for (const campaign of campaigns) {
        try {
          const response = await fetch('/api/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: campaign.name,
              description: campaign.description,
              framework: campaign.framework,
              tacticId: campaign.tactic_id,
              tacticName: campaign.tactic_name,
              createdBy: userId,
              selectedVectors: campaign.selected_vectors,
              selectedPayloadIndices: campaign.selected_payload_indices,
            }),
          });

          if (response.ok) {
            successCount++;
            console.log(`   ✅ Migrated: ${campaign.name}`);
          } else {
            failCount++;
            const error = await response.json();
            console.error(`   ❌ Failed: ${campaign.name} - ${error.error}`);
          }
        } catch (error) {
          failCount++;
          console.error(`   ❌ Failed: ${campaign.name} - ${(error as Error).message}`);
        }
      }

      console.log(`\n   Summary: ${successCount} succeeded, ${failCount} failed\n`);
    } catch (error) {
      console.error('   ❌ Error parsing campaigns data:', error);
    }
  } else {
    console.log('   No campaigns found in localStorage\n');
  }

  // Migrate Audit Logs
  console.log('📋 Migrating audit logs...');
  const auditLogsData = localStorage.getItem('ares_audit_logs');
  
  if (auditLogsData) {
    try {
      const logs: LocalStorageAuditLog[] = JSON.parse(auditLogsData);
      console.log(`   Found ${logs.length} audit logs to migrate`);

      let successCount = 0;
      let failCount = 0;

      for (const log of logs) {
        try {
          const response = await fetch('/api/audit-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actorId: log.user_id,
              action: log.action,
              target: log.resource_id || log.resource_type,
              details: {
                resource_type: log.resource_type,
                ...log.details,
              },
              ipAddress: log.ip_address,
              userAgent: log.user_agent,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (err) {
          console.error('Failed to migrate campaign:', err);
          failCount++;
        }
      }

      console.log(`   Summary: ${successCount} succeeded, ${failCount} failed\n`);
    } catch (error) {
      console.error('   ❌ Error parsing audit logs data:', error);
    }
  } else {
    console.log('   No audit logs found in localStorage\n');
  }

  console.log('✨ Migration complete!\n');
  console.log('⚠️  Note: localStorage data has NOT been deleted automatically.');
  console.log('   You can manually clear it after verifying the migration:\n');
  console.log('   localStorage.removeItem("ares_campaigns");');
  console.log('   localStorage.removeItem("ares_audit_logs");');
}

/**
 * Export localStorage data for backup
 */
function exportLocalStorageData() {
  const data = {
    campaigns: localStorage.getItem('ares_campaigns'),
    audit_logs: localStorage.getItem('ares_audit_logs'),
    auth_session: localStorage.getItem('ares_auth_session'),
    workspace: localStorage.getItem('ares_workspace'),
    workspace_members: localStorage.getItem('ares_workspace_members'),
    campaign_shares: localStorage.getItem('ares_campaign_shares'),
    team_activity: localStorage.getItem('ares_team_activity'),
    exported_at: new Date().toISOString(),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `ares-localstorage-backup-${Date.now()}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  console.log('✅ localStorage data exported successfully');
}

// Browser usage instructions
if (typeof window !== 'undefined') {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  ARES Dashboard: localStorage to Database Migration Tool     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Available commands:                                         ║
║                                                              ║
║  1. Export backup (recommended first):                       ║
║     exportLocalStorageData()                                 ║
║                                                              ║
║  2. Run migration:                                           ║
║     migrateInBrowser()                                       ║
║                                                              ║
║  3. Clear localStorage after verification:                   ║
║     localStorage.removeItem('ares_campaigns')                ║
║     localStorage.removeItem('ares_audit_logs')               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // Make functions globally available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).migrateInBrowser = migrateInBrowser;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).exportLocalStorageData = exportLocalStorageData;
}

// Node.js usage (for future server-side migrations)
export { migrateInBrowser, exportLocalStorageData };
