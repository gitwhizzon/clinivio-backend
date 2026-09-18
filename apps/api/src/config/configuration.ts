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
    // Base URL + API version are configurable because the WhatsApp Business
    // Solution Provider can change (currently Fast2SMS, which proxies the
    // same Graph-API-shaped endpoint Meta uses directly) without touching code.
    apiBaseUrl:
      process.env.WHATSAPP_API_BASE_URL ?? 'https://www.fast2sms.com/dev/whatsapp',
    apiVersion: process.env.WHATSAPP_API_VERSION ?? 'v26.0',
    // Fast2SMS's docs show the access token passed bare in the Authorization
    // header (no "Bearer " prefix), unlike Meta's direct Graph API.
    authScheme: process.env.WHATSAPP_AUTH_SCHEME ?? 'raw',
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

  // Microsoft Entra ID SSO — platform SUPER_ADMIN login only, on app.megnim.com.
  // Hospital staff login (password + subdomain) is completely untouched by this.
  azureAd: {
    tenantId: process.env.AZURE_AD_TENANT_ID ?? '',
    clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
    redirectUri: process.env.AZURE_AD_REDIRECT_URI ?? '',
    // Comma-separated corporate email domains (e.g. "hansvl.com") allowed to
    // claim an existing, not-yet-linked SUPER_ADMIN seat by domain rather
    // than an exact email match — still not auto-provisioning: a SUPER_ADMIN
    // row must already exist and be unclaimed by a different Microsoft
    // identity. Empty by default (exact email match only).
    allowedEmailDomains: (process.env.AZURE_AD_ALLOWED_EMAIL_DOMAINS ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  },

  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Megnim <noreply@clinivio.ai>',
  },

  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
});
