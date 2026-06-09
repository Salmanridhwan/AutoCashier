/**
 * Property 3: Invalid route returns 404
 * **Validates: Requirements 3.5**
 *
 * For any path that does not match a valid route pattern,
 * the server must return a 404 response.
 *
 * Valid route patterns (should NOT be tested):
 * - /api/health
 * - /api/shared/*
 * - /api/admin/*
 * - /api/kasir/*
 * - /api/member/*
 * - /uploads/*
 * - / (root, production only)
 * - /admin/* (production only)
 * - /kasir/* (production only)
 * - /member/* (production only)
 *
 * Invalid routes should return:
 * - API routes (/api/nonexistent/*): 404 JSON { success: false, message: 'Endpoint not found' }
 * - Non-API routes: 404 HTML page
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import app from '../app.js';

// Generate a random path segment (1-10 chars, alphanumeric)
const segmentArb = fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
  'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
  'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
) });

// Generate a random path with 1-4 segments
const randomPathArb = fc
  .array(segmentArb, { minLength: 1, maxLength: 4 })
  .map((segments) => '/' + segments.join('/'));

// Known valid API sub-prefixes that we must avoid
const validApiPrefixes = ['health', 'shared', 'admin', 'kasir', 'member'];

// Known valid top-level prefixes to avoid (production static serving + uploads)
const validTopLevelPrefixes = ['api', 'admin', 'kasir', 'member', 'uploads'];

/**
 * Filter out paths that could accidentally match valid routes.
 * We only want paths that are guaranteed to hit the 404 handler.
 */
function isInvalidApiPath(path: string): boolean {
  // Must start with /api/
  if (!path.startsWith('/api/')) return false;

  // Extract the segment after /api/
  const afterApi = path.slice(5); // remove '/api/'
  const firstSegment = afterApi.split('/')[0];

  // Must NOT match any valid API sub-prefix
  return !validApiPrefixes.includes(firstSegment);
}

function isInvalidNonApiPath(path: string): boolean {
  // Must NOT start with /api/
  if (path.startsWith('/api/') || path === '/api') return false;

  // Extract first segment
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return false; // root '/' is valid in production

  const firstSegment = segments[0];

  // Must NOT match any valid top-level prefix
  return !validTopLevelPrefixes.includes(firstSegment);
}

describe('Property 3: Invalid route returns 404', () => {
  it('should return 404 JSON for invalid API routes', () => {
    return fc.assert(
      fc.asyncProperty(
        // Generate paths like /api/<random>/<random>
        fc.array(segmentArb, { minLength: 1, maxLength: 3 }).map(
          (segments) => '/api/' + segments.join('/')
        ).filter(isInvalidApiPath),
        async (path) => {
          const res = await request(app).get(path);

          expect(res.status).toBe(404);
          expect(res.body).toEqual({
            success: false,
            message: 'Endpoint not found',
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should return 404 for invalid non-API routes', () => {
    return fc.assert(
      fc.asyncProperty(
        randomPathArb.filter(isInvalidNonApiPath),
        async (path) => {
          const res = await request(app).get(path);

          expect(res.status).toBe(404);
          // Non-API 404 returns HTML
          expect(res.headers['content-type']).toMatch(/html/);
          expect(res.text).toContain('404');
        }
      ),
      { numRuns: 50 }
    );
  });
});
