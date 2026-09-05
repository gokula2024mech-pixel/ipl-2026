/**
 * IPL-2026 Route-Specific In-Memory Sliding Window Rate Limiter
 * 
 * Protects endpoints against rapid bursts, scripted abuse, and double-clicks.
 * Keys on authenticated user.id (if available) to prevent students sharing college Wi-Fi
 * from starving each other behind NAT, falling back to client IP.
 * 
 * Note: Rate limiting is defense-in-depth. Database UNIQUE constraints remain
 * the ultimate authoritative authority for duplicate protection.
 */

function createRateLimiter({
  windowMs = 60 * 1000,
  max = 60,
  keyGenerator = null,
  message = 'Too many requests. Please slow down and try again shortly.',
  skipSuccessfulRequests = false
}) {
  const store = new Map();

  // Periodic cleanup of expired windows to prevent memory leaks (every 60s)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now > entry.resetTime) {
        store.delete(key);
      }
    }
  }, Math.max(windowMs, 30000));

  // Ensure timer does not prevent process exit in tests
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    let key;

    if (keyGenerator) {
      key = keyGenerator(req);
    } else if (req.user && req.user.id) {
      key = `user_${req.user.id}`;
    } else {
      const forwarded = req.headers['x-forwarded-for'];
      const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
      key = `ip_${ip || 'unknown'}`;
    }

    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      store.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error_code: 'RATE_LIMIT_EXCEEDED',
        message,
        retryAfterSeconds: retryAfter
      });
    }

    next();
  };
}

module.exports = {
  createRateLimiter,
  // Preset limiters configured for IPL-2026 event traffic
  voteLimiter: createRateLimiter({
    windowMs: 10 * 1000,
    max: 5, // 5 requests per 10s per voter (blocks double-clicks and script bursts)
    message: 'Too many vote attempts. Please wait a few seconds before trying again.'
  }),
  qrResolutionLimiter: createRateLimiter({
    windowMs: 60 * 1000,
    max: 60, // 60 lookups per minute per IP
    message: 'Too many QR code requests. Please slow down.'
  }),
  leaderboardLimiter: createRateLimiter({
    windowMs: 60 * 1000,
    max: 120, // 120 requests per minute per IP
    message: 'Leaderboard request limit exceeded. Please wait a few moments.'
  })
};
