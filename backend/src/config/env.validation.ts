import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1h'),
  CORS_ORIGIN: Joi.string().default('http://localhost:3001'),
  JSON_BODY_LIMIT: Joi.string().default('5mb'),

  // ----- Blockchain Gateway integration -----
  GATEWAY_BASE_URL: Joi.string().uri().optional(),
  GATEWAY_API_KEY: Joi.string().optional(),
  GATEWAY_TIMEOUT_MS: Joi.number().default(10000),
  GATEWAY_USE_MOCK: Joi.boolean().default(true),

  // Inbound webhook: Gateway → Switching (Point #3 hardening)
  GATEWAY_WEBHOOK_API_KEY: Joi.string().default('dev-webhook-key'),
  GATEWAY_WEBHOOK_SHARED_SECRET: Joi.string().allow('').default(''),
  GATEWAY_WEBHOOK_TOLERANCE_MS: Joi.number().positive().default(5 * 60 * 1000),
  GATEWAY_WEBHOOK_SIGNATURE_REQUIRED: Joi.boolean().default(false),

  // Outbound request: Switching → Gateway signing
  GATEWAY_OUTBOUND_SHARED_SECRET: Joi.string().allow('').default(''),
  GATEWAY_OUTBOUND_HEADER_CONVENTION: Joi.string()
    .valid('switching-prefixed', 'gateway-prefixed')
    .default('switching-prefixed'),

  // Operational retries & stale-pending timeouts
  TRANSACTION_PENDING_TIMEOUT_MS: Joi.number().default(60000),
  RETRY_BACKOFF_BASE_MS: Joi.number().default(5000),
  RETRY_MAX_ATTEMPTS: Joi.number().default(5),
});
