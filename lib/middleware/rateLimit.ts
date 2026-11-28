import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../logger';
import { getClientIp } from './security';

/**
 * In-memory rate limiter with per-endpoint namespace isolation.
 *
 * Per-instance limitation:
 *   This store is local to a single Node.js / serverless instance. In multi-instance
 *   serverless deployments, each instance maintains an independent counter map. For
 *   strict global enforcement across instances, back this with a shared store such as
 *   Redis (e.g. @upstash/redis).
 *
 * Capacity & anti-eviction policy (RL-1):
 *   1. Entries are isolated per endpoint namespace (`namespaceStores`), each capped at
 *      `MAX_NAMESPACE_ENTRIES` (2,000), with total entries across all namespaces capped
 *      at `MAX_RATE_LIMIT_ENTRIES` (10,000) and active namespaces capped at
 *      `MAX_NAMESPACES` (32).
 *   2. Flooding one endpoint namespace cannot exhaust capacity or deny service to any
 *      other endpoint namespace.
 *   3. Actively blocked entries (`count > maxRequests` while `resetTime > now`) are
 *      NEVER evicted merely to admit new keys.
 *   4. Expired entries (`resetTime <= now`) are swept in O(1) amortized time via a
 *      bounded per-insert sweep of at most `SWEEP_BATCH_SIZE` (64) entries, plus a
 *      periodic `cleanupTimer`.
 *   5. When a namespace reaches `MAX_NAMESPACE_ENTRIES` after the bounded expiry sweep:
 *      - Oldest non-blocked entries (`count <= maxRequests`) in that namespace are
 *        evicted first to admit new keys without affecting other namespaces.
 *      - Only if ALL entries in that namespace are actively blocked (`count > maxRequests`),
 *        new unknown keys in *that* namespace are shed with HTTP 429 Too Many Requests,
 *        leaving all other endpoint namespaces completely unaffected.
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  maxRequests: number;
}

interface NamespaceStore {
  entries: Map<string, RateLimitEntry>;
  blockedCount: number;
}

export const MAX_NAMESPACE_ENTRIES = 2_000;
export const MAX_RATE_LIMIT_ENTRIES = 10_000;
export const MAX_NAMESPACES = 32;
const SWEEP_BATCH_SIZE = 64;

const namespaceStores = new Map<string, NamespaceStore>();
let totalEntryCount = 0;

function isEntryBlocked(entry: RateLimitEntry): boolean {
  return entry.count > entry.maxRequests;
}

function deleteEntry(ns: NamespaceStore, key: string, entry: RateLimitEntry): void {
  if (ns.entries.delete(key)) {
    totalEntryCount = Math.max(0, totalEntryCount - 1);
    if (isEntryBlocked(entry)) {
      ns.blockedCount = Math.max(0, ns.blockedCount - 1);
    }
  }
}

export function getRateLimitStoreSize(namespace?: string): number {
  if (namespace !== undefined) {
    return namespaceStores.get(namespace)?.entries.size ?? 0;
  }
  return totalEntryCount;
}

/**
 * Clears all namespace stores and resets counters. Intended for unit tests.
 */
export function resetRateLimitStore(): void {
  namespaceStores.clear();
  totalEntryCount = 0;
}

/**
 * Sweeps up to `budget` expired entries from a namespace in Map insertion order.
 */
function sweepNamespaceExpired(ns: NamespaceStore, now: number, budget: number): number {
  let checked = 0;
  for (const [k, entry] of ns.entries.entries()) {
    if (checked >= budget) {
      break;
    }
    checked++;
    if (entry.resetTime <= now) {
      deleteEntry(ns, k, entry);
    }
  }
  return checked;
}

/**
 * Sweeps expired entries across all namespaces (used by periodic cleanupTimer).
 */
function sweepAllExpiredEntries(now: number): void {
  for (const [nsName, ns] of namespaceStores.entries()) {
    for (const [k, entry] of ns.entries.entries()) {
      if (entry.resetTime <= now) {
        deleteEntry(ns, k, entry);
      }
    }
    if (ns.entries.size === 0) {
      namespaceStores.delete(nsName);
    }
  }
}

/**
 * Evicts the oldest non-blocked entry in `ns` (also pruning any expired entries
 * encountered along the way). Returns true if a slot was freed.
 */
function evictOldestNonBlocked(ns: NamespaceStore, now: number): boolean {
  if (ns.blockedCount >= ns.entries.size) {
    // Fast O(1) check: every entry in this namespace is actively blocked.
    return false;
  }
  for (const [k, entry] of ns.entries.entries()) {
    if (entry.resetTime <= now || !isEntryBlocked(entry)) {
      deleteEntry(ns, k, entry);
      return true;
    }
  }
  return false;
}

/**
 * Bounded expiry sweep across namespaces when global capacity is reached.
 */
function sweepGlobalBounded(now: number, totalBudget: number): void {
  let remaining = totalBudget;
  for (const [nsName, ns] of namespaceStores.entries()) {
    if (remaining <= 0) {
      break;
    }
    const used = sweepNamespaceExpired(ns, now, remaining);
    remaining -= used;
    if (ns.entries.size === 0) {
      namespaceStores.delete(nsName);
    }
  }
}

function getOrCreateNamespace(namespace: string, now: number): NamespaceStore | null {
  let ns = namespaceStores.get(namespace);
  if (ns) {
    return ns;
  }

  if (namespaceStores.size >= MAX_NAMESPACES) {
    sweepGlobalBounded(now, SWEEP_BATCH_SIZE);
  }

  if (namespaceStores.size >= MAX_NAMESPACES) {
    // Evict the oldest namespace that has no actively blocked entries
    for (const [nsName, candidate] of namespaceStores.entries()) {
      if (candidate.blockedCount === 0) {
        totalEntryCount = Math.max(0, totalEntryCount - candidate.entries.size);
        namespaceStores.delete(nsName);
        break;
      }
    }
  }

  if (namespaceStores.size >= MAX_NAMESPACES) {
    return null;
  }

  ns = { entries: new Map(), blockedCount: 0 };
  namespaceStores.set(namespace, ns);
  return ns;
}

function ensureCapacityForNewKey(ns: NamespaceStore, namespace: string, now: number): boolean {
  // 1. Ensure per-namespace capacity
  if (ns.entries.size >= MAX_NAMESPACE_ENTRIES) {
    sweepNamespaceExpired(ns, now, SWEEP_BATCH_SIZE);
    if (ns.entries.size >= MAX_NAMESPACE_ENTRIES) {
      if (!evictOldestNonBlocked(ns, now)) {
        return false;
      }
    }
  }

  // 2. Ensure global store capacity without letting one flooded namespace block others
  if (totalEntryCount >= MAX_RATE_LIMIT_ENTRIES) {
    sweepGlobalBounded(now, SWEEP_BATCH_SIZE);
  }

  if (totalEntryCount >= MAX_RATE_LIMIT_ENTRIES) {
    // Evict oldest non-blocked entry from the largest namespace that has non-blocked entries
    let targetNs: NamespaceStore | null = null;
    for (const [nsName, candidate] of namespaceStores.entries()) {
      if (nsName === namespace) {
        continue;
      }
      if (candidate.blockedCount < candidate.entries.size) {
        if (!targetNs || candidate.entries.size > targetNs.entries.size) {
          targetNs = candidate;
        }
      }
    }
    if (targetNs && evictOldestNonBlocked(targetNs, now)) {
      return true;
    }
    // Fallback to current namespace if no other namespace has non-blocked entries
    if (ns.blockedCount < ns.entries.size && evictOldestNonBlocked(ns, now)) {
      return true;
    }
    return false;
  }

  return true;
}

// Clean up expired entries periodically
const cleanupTimer = setInterval(() => {
  sweepAllExpiredEntries(Date.now());
}, 60_000);
cleanupTimer.unref?.();

function normalizeRequestPath(url: string | undefined): string {
  const path = url?.split('?')[0]?.trim();
  if (!path) {
    return '/';
  }
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
}

export interface RateLimitConfig {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Max requests per window
  message?: string; // Custom error message
  keyPrefix?: string; // Explicit endpoint/namespace prefix
  keyGenerator?: (req: VercelRequest) => string; // Custom key generator
}

export function rateLimit(config: RateLimitConfig = {}) {
  const {
    windowMs = 60_000, // 1 minute default
    maxRequests = 60, // 60 requests per minute default
    message = 'Too many requests, please try again later.',
    keyPrefix,
    keyGenerator = (req) => getClientIp(req),
  } = config;

  return (req: VercelRequest, res: VercelResponse, next: () => void) => {
    const namespace = keyPrefix || normalizeRequestPath(req.url);
    const key = `${namespace}:${keyGenerator(req)}`;
    const now = Date.now();

    const ns = getOrCreateNamespace(namespace, now);
    if (!ns) {
      const retryAfterSeconds = Math.max(1, Math.min(60, Math.ceil(windowMs / 1000)));
      const resetAt = now + retryAfterSeconds * 1000;

      logger.warn('Rate limit namespace capacity reached; shedding new namespace key', {
        namespace,
        key,
        namespaceCount: namespaceStores.size,
        maxNamespaces: MAX_NAMESPACES,
      });

      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', resetAt.toString());

      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: retryAfterSeconds,
      });
    }

    let entry = ns.entries.get(key);
    if (entry && entry.resetTime <= now) {
      deleteEntry(ns, key, entry);
      entry = undefined;
    }

    if (!entry) {
      if (!ensureCapacityForNewKey(ns, namespace, now)) {
        const retryAfterSeconds = Math.max(1, Math.min(60, Math.ceil(windowMs / 1000)));
        const resetAt = now + retryAfterSeconds * 1000;

        logger.warn('Rate limit namespace at blocked capacity; shedding new key', {
          namespace,
          key,
          namespaceSize: ns.entries.size,
          maxNamespaceEntries: MAX_NAMESPACE_ENTRIES,
          totalStoreSize: totalEntryCount,
          maxEntries: MAX_RATE_LIMIT_ENTRIES,
        });

        res.setHeader('Retry-After', retryAfterSeconds);
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', resetAt.toString());

        return res.status(429).json({
          error: 'Too Many Requests',
          message,
          retryAfter: retryAfterSeconds,
        });
      }

      entry = {
        count: 0,
        resetTime: now + windowMs,
        maxRequests,
      };
      ns.entries.set(key, entry);
      totalEntryCount++;
    }

    // Increment request count and track blocked state transitions
    const wasBlocked = isEntryBlocked(entry);
    entry.count++;
    if (!wasBlocked && isEntryBlocked(entry)) {
      ns.blockedCount++;
    }

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));

      logger.warn('Rate limit exceeded', {
        key,
        count: entry.count,
        limit: maxRequests,
        ip: getClientIp(req),
      });

      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());

      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: retryAfterSeconds,
      });
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
    res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());

    next();
  };
}

// Default rate limiter: 60 requests per 60 seconds (1 minute)
export const limiter = rateLimit({
  windowMs: 60_000,
  maxRequests: 60,
  message: 'Too many requests from this IP, please try again later.',
});
