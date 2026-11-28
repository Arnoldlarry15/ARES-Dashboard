// API endpoint for user operations
import type { VercelResponse } from '@vercel/node';
import { ALLOWED_INVITATION_ROLES, UserRepository, type InvitationRole } from '../repositories/userRepository';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import prisma from '../utils/db';
import { securityHeaders, cors, requestLogger, csrfProtection, compose, getClientIp } from '../lib/middleware/security';
import { requireAuth, type AuthenticatedRequest } from '../lib/middleware/auth';
import { catchAsync } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logger';
import { rateLimit } from '../lib/middleware/rateLimit';
import { cancelActiveJobsForUserInTx } from '../lib/jobs/generationJobService';

const usersRateLimit = rateLimit({
  keyPrefix: 'users',
  maxRequests: 60,
  windowMs: 60000,
});

// GET /api/users - Get self or (admin-only) user by email, id, or orgId
// POST /api/users - Deprecated (410 Gone); use POST /api/users?resource=invitations
// PUT /api/users - Update a user (admin-only)
// DELETE /api/users - Delete a user (admin-only)

const ALLOWED_ROLES = new Set(['admin', 'red_team_lead', 'analyst', 'viewer']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  try {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
    }
    if (!authUser.organizationId || !authUser.organizationId.trim() || authUser.organizationId === 'default_org') {
      return res.status(403).json({ error: 'Forbidden', message: 'Organization context required' });
    }
    const isAdmin = authUser.role === 'admin';
    const method = req.method;

    if (req.query?.resource === 'invitations') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admin access required for invitation management' });
      }
      const orgId = authUser.organizationId.trim();
      switch (method) {
        case 'GET': {
          const invitations = await UserRepository.listInvitations(orgId);
          return res.status(200).json({ invitations });
        }
        case 'POST': {
          const { invitedEmail, role = 'analyst', expiresInHours } = (req.body || {}) as {
            invitedEmail?: unknown;
            role?: unknown;
            expiresInHours?: unknown;
          };
          if (typeof role !== 'string' || !ALLOWED_INVITATION_ROLES.includes(role as InvitationRole)) {
            return res.status(400).json({ error: 'Bad Request', message: `Invalid role. Must be one of: ${ALLOWED_INVITATION_ROLES.join(', ')}` });
          }
          let normalizedEmail: string | undefined;
          if (invitedEmail !== undefined && invitedEmail !== null && invitedEmail !== '') {
            if (typeof invitedEmail !== 'string' || !EMAIL_REGEX.test(invitedEmail.trim())) {
              return res.status(400).json({ error: 'Bad Request', message: 'invitedEmail must be a valid email address' });
            }
            normalizedEmail = invitedEmail.trim().toLowerCase();
          }
          let parsedExpiresInHours: number | undefined;
          if (expiresInHours !== undefined) {
            if (typeof expiresInHours !== 'number' || !Number.isFinite(expiresInHours) || expiresInHours <= 0 || expiresInHours > 720) {
              return res.status(400).json({ error: 'Bad Request', message: 'expiresInHours must be a positive number up to 720' });
            }
            parsedExpiresInHours = expiresInHours;
          }
          const { invitation, token } = await prisma.$transaction(async (tx) => {
            const created = await UserRepository.createInvitation(
              {
                orgId,
                invitedEmail: normalizedEmail,
                role,
                createdBy: authUser.userId,
                expiresInHours: parsedExpiresInHours,
              },
              tx
            );
            await AuditLogRepository.create(
              {
                orgId,
                actorId: authUser.userId,
                action: 'invitation_created',
                target: created.invitation.id,
                details: {
                  role: created.invitation.role,
                  invitedEmail: created.invitation.invitedEmail,
                  expiresAt: created.invitation.expiresAt.toISOString(),
                },
                ipAddress: getClientIp(req),
                userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
              },
              tx
            );
            return created;
          });
          return res.status(201).json({
            invitation: {
              id: invitation.id,
              orgId: invitation.orgId,
              invitedEmail: invitation.invitedEmail,
              role: invitation.role,
              createdBy: invitation.createdBy,
              expiresAt: invitation.expiresAt,
              createdAt: invitation.createdAt,
            },
            token,
          });
        }
        case 'DELETE': {
          const { id } = req.query || {};
          if (typeof id !== 'string' || !id.trim()) {
            return res.status(400).json({ error: 'Bad Request', message: 'Missing or invalid query parameter: id' });
          }
          const invitationId = id.trim();
          const revoked = await prisma.$transaction(async (tx) => {
            const deleted = await UserRepository.revokeInvitation(invitationId, orgId, tx);
            if (!deleted) {
              return false;
            }
            await AuditLogRepository.create(
              {
                orgId,
                actorId: authUser.userId,
                action: 'invitation_revoked',
                target: invitationId,
                details: {},
                ipAddress: getClientIp(req),
                userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
              },
              tx
            );
            return true;
          });
          if (!revoked) {
            return res.status(404).json({ error: 'Not Found', message: 'Invitation not found' });
          }
          return res.status(200).json({ success: true });
        }
        default:
          return res.status(405).json({ error: 'Method not allowed' });
      }
    }

    switch (method) {
      case 'GET': {
        const { email, id, orgId } = req.query || {};

        if (id !== undefined) {
          if (typeof id !== 'string' || !id.trim()) {
            return res.status(400).json({ error: 'Invalid query parameter: id' });
          }
          if (!isAdmin && id !== authUser.userId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          const user = await UserRepository.findByIdInOrg(id, authUser.organizationId);
          return res.status(200).json({ user });
        }

        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }

        if (email !== undefined) {
          if (typeof email !== 'string' || !email.trim()) {
            return res.status(400).json({ error: 'Invalid query parameter: email' });
          }
          const user = await UserRepository.findByEmailInOrg(email, authUser.organizationId);
          return res.status(200).json({ user });
        }

        if (orgId !== undefined) {
          if (typeof orgId !== 'string' || !orgId.trim()) {
            return res.status(400).json({ error: 'Invalid query parameter: orgId' });
          }
          if (orgId !== authUser.organizationId) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          const users = await UserRepository.findByOrgId(orgId);
          return res.status(200).json({ users });
        }

        return res.status(400).json({ error: 'Missing query parameter: email, id, or orgId' });
      }

      case 'POST': {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }
        return res.status(410).json({
          error: 'Gone',
          code: 'DIRECT_USER_CREATION_DEPRECATED',
          message: 'Direct user creation is deprecated. Use POST /api/users?resource=invitations to invite users.',
        });
      }

      case 'PUT': {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }
        const { id, name, role } = req.body || {};

        if (!id || typeof id !== 'string' || !id.trim()) {
          return res.status(400).json({ error: 'Missing required field: id' });
        }
        if (name !== undefined && typeof name !== 'string') {
          return res.status(400).json({ error: 'Invalid name' });
        }
        if (role !== undefined && (typeof role !== 'string' || !ALLOWED_ROLES.has(role))) {
          return res.status(400).json({ error: 'Invalid role' });
        }

        const orgId = authUser.organizationId.trim();
        const targetId = id.trim();

        const outcome = await prisma.$transaction(async (tx) => {
          await UserRepository.acquireOrgAdminLock(orgId, tx);

          const existingTarget = await UserRepository.findByIdInOrg(targetId, orgId, tx);
          if (!existingTarget) {
            return { status: 'not_found' as const };
          }

          if (existingTarget.role === 'admin' && role !== undefined && role !== 'admin') {
            const remainingAdmins = await UserRepository.countActiveAdminsInOrg(orgId, targetId, tx);
            if (remainingAdmins === 0) {
              return { status: 'last_admin' as const };
            }
          }

          const updated = await UserRepository.updateInOrg(targetId, orgId, { name, role }, tx);
          if (!updated) {
            return { status: 'not_found' as const };
          }

          await AuditLogRepository.create(
            {
              orgId,
              actorId: authUser.userId,
              action: 'user_updated',
              target: targetId,
              details: { name, role },
              ipAddress: getClientIp(req),
              userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
            },
            tx
          );

          return { status: 'updated' as const, user: updated };
        });
        if (outcome.status === 'not_found') {
          return res.status(404).json({ error: 'User not found' });
        }
        if (outcome.status === 'last_admin') {
          return res.status(409).json({
            error: 'Conflict',
            message: 'Cannot demote the last active administrator in the organization',
          });
        }

        return res.status(200).json({ user: outcome.user });
      }

      case 'DELETE': {
        if (!isAdmin) {
          return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
        }
        const { id } = req.query || {};

        if (!id || typeof id !== 'string' || !id.trim()) {
          return res.status(400).json({ error: 'Missing required parameter: id' });
        }

        const orgId = authUser.organizationId.trim();
        const targetId = id.trim();

        if (targetId === authUser.userId) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Administrators cannot delete or deactivate their own account',
          });
        }

        const outcome = await prisma.$transaction(async (tx) => {
          await UserRepository.acquireOrgAdminLock(orgId, tx);

          const existingTarget = await UserRepository.findByIdInOrg(targetId, orgId, tx);
          if (!existingTarget) {
            return { status: 'not_found' as const };
          }

          if (existingTarget.role === 'admin') {
            const remainingAdmins = await UserRepository.countActiveAdminsInOrg(orgId, targetId, tx);
            if (remainingAdmins === 0) {
              return { status: 'last_admin' as const };
            }
          }

          const removed = await UserRepository.deleteInOrg(targetId, orgId, tx);
          if (!removed) {
            return { status: 'not_found' as const };
          }

          const revokedPendingInvitations = await UserRepository.revokePendingInvitationsByCreator(
            targetId,
            orgId,
            tx
          );

          const cancelledJobs = await cancelActiveJobsForUserInTx(tx, {
            userId: targetId,
            orgId,
            actorId: authUser.userId,
            ipAddress: getClientIp(req),
            userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
          });

          await AuditLogRepository.create(
            {
              orgId,
              actorId: authUser.userId,
              action: 'user_deactivated',
              target: targetId,
              details: {
                mode: 'soft_delete',
                email: existingTarget.email,
                role: existingTarget.role,
                revokedPendingInvitations,
                cancelledActiveJobs: cancelledJobs.cancelledJobIds.length,
                releasedCredits: cancelledJobs.releasedCredits,
              },
              ipAddress: getClientIp(req),
              userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
            },
            tx
          );

          return { status: 'deactivated' as const };
        });

        if (outcome.status === 'not_found') {
          return res.status(404).json({ error: 'User not found' });
        }
        if (outcome.status === 'last_admin') {
          return res.status(409).json({
            error: 'Conflict',
            message: 'Cannot deactivate the last active administrator in the organization',
          });
        }

        return res.status(200).json({ success: true, deactivated: true });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('User API error', error as Error, {
      method: req.method,
      url: req.url,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export default async function (req: AuthenticatedRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors({ origin: (process.env.ALLOWED_ORIGINS?.split(',') || []).map(o => o.trim()).filter(Boolean), credentials: true }),
    requestLogger,
    usersRateLimit,
    requireAuth,
    csrfProtection
  );

  await middleware(req, res, async () => {
    await catchAsync(handler)(req, res);
  });
}
