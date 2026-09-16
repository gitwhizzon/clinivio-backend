export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  redis: {
    // Only pass URL if it looks like a valid redis(s):// scheme — prevents ioredis crashes on malformed values.
    url: /^rediss?:\/\//.test(process.env.REDIS_URL ?? '')
      ? process.env.REDIS_URL!
      : '',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    sasl: process.env.KAFKA_SASL_USERNAME
      ? {
          mechanism: 'scram-sha-256' as const,
          username: process.env.KAFKA_SASL_USERNAME,
          password: process.env.KAFKA_SASL_PASSWORD ?? '',
        }
      : undefined,
    ssl: process.env.KAFKA_SSL === 'true',
    clientId: process.env.KAFKA_CLIENT_ID ?? 'mediflow-api',
    groupId: process.env.KAFKA_GROUP_ID ?? 'mediflow-api-group',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  },

  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? 'mediflow-verify',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
  },

  gst: {
    cgstRate: parseFloat(process.env.GST_CGST_RATE ?? '0.09'),
    sgstRate: parseFloat(process.env.GST_SGST_RATE ?? '0.09'),
    igstRate: parseFloat(process.env.GST_IGST_RATE ?? '0.18'),
  },

  sessionTtl: parseInt(process.env.SESSION_TTL ?? '86400', 10),

  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Clinivio <noreply@clinivio.ai>',
  },

  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
});
