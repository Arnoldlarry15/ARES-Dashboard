// API endpoint for user operations
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { UserRepository } from '../repositories/userRepository';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import { securityHeaders, cors, requestLogger, compose } from './middleware/security';

// GET /api/users - Get all users or single user by email
// POST /api/users - Create a new user
// PUT /api/users - Update a user
// DELETE /api/users - Delete a user

const handler = async (req: VercelRequest, res: VercelResponse) => {
  try {
    const method = req.method;

    switch (method) {
      case 'GET': {
        const { email, id, orgId } = req.query;

        if (email) {
          const user = await UserRepository.findByEmail(email as string);
          return res.status(200).json({ user });
        }

        if (id) {
          const user = await UserRepository.findById(id as string);
          return res.status(200).json({ user });
        }

        if (orgId) {
          const users = await UserRepository.findByOrgId(orgId as string);
          return res.status(200).json({ users });
        }

        return res.status(400).json({ error: 'Missing query parameter: email, id, or orgId' });
      }

      case 'POST': {
        const { email, name, role, orgId } = req.body;

        if (!email || !role || !orgId) {
          return res.status(400).json({ error: 'Missing required fields: email, role, orgId' });
        }

        const user = await UserRepository.create({ email, name, role, orgId });

        // Log user creation
        await AuditLogRepository.create({
          actorId: user.id,
          action: 'user_created',
          target: user.id,
          details: { email, role, orgId },
        });

        return res.status(201).json({ user });
      }

      case 'PUT': {
        const { id, name, role } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Missing required field: id' });
        }

        const user = await UserRepository.update(id, { name, role });

        // Log user update
        await AuditLogRepository.create({
          actorId: id,
          action: 'user_updated',
          target: id,
          details: { name, role },
        });

        return res.status(200).json({ user });
      }

      case 'DELETE': {
        const { id } = req.query;

        if (!id) {
          return res.status(400).json({ error: 'Missing required parameter: id' });
        }

        await UserRepository.delete(id as string);

        // Log user deletion
        await AuditLogRepository.create({
          actorId: id as string,
          action: 'user_deleted',
          target: id as string,
          details: {},
        });

        return res.status(200).json({ message: 'User deleted successfully' });
      }

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('User API error:', error);
    return res.status(500).json({ error: 'Internal server error', message: (error as Error).message });
  }
};

export default async function (req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors(),
    requestLogger
  );

  middleware(req, res, async () => {
    await handler(req, res);
  });
}
