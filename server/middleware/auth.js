// JWT verification middleware.
//
// Reads `Authorization: Bearer <token>`, verifies the Supabase session access
// token against the project's JWKS endpoint, and attaches req.user = { id }.
//
// Notes:
//  - Use the `.well-known/jwks.json` path. `/auth/v1/jwks` returns 404.
//  - Accept BOTH RS256 and ES256 — new Supabase projects issue ES256 (ECDSA
//    P-256) tokens, so hardcoding RS256 only would fail every verification.
//  - We also stash the raw token on req so route handlers can build a
//    user-scoped Supabase client (RLS) from it.
import jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

const SUPABASE_URL = process.env.SUPABASE_URL;

const jwks = new JwksClient({
  jwksUri: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000, // 10 minutes
  rateLimit: true,
});

function getKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

const UNAUTHORIZED = { error: 'unauthorized', message: 'Invalid or expired session.' };

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json(UNAUTHORIZED);
  }

  const token = match[1];

  jwt.verify(token, getKey, { algorithms: ['RS256', 'ES256'] }, (err, decoded) => {
    if (err || !decoded || !decoded.sub) {
      return res.status(401).json(UNAUTHORIZED);
    }
    req.user = { id: decoded.sub };
    req.accessToken = token;
    next();
  });
}
