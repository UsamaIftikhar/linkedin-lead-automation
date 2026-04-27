const DEFAULT_PORT = 3001;
const DEFAULT_HUNTER_MIN_CONFIDENCE = 75;
const DEFAULT_CRON_SCHEDULE = '0 8 * * *';

function readString(
  config: Record<string, unknown>,
  key: string,
  fallback = '',
): string {
  const value = config[key];

  if (typeof value === 'string') {
    return value.trim();
  }

  return fallback;
}

function readNumber(
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = readString(config, key);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number.`);
  }

  return parsed;
}

export function validateEnv(config: Record<string, unknown>) {
  const databaseUrl = readString(config, 'DATABASE_URL');

  if (!databaseUrl) {
    throw new Error('Environment variable DATABASE_URL is required.');
  }

  return {
    ...config,
    PORT: readNumber(config, 'PORT', DEFAULT_PORT),
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: readString(config, 'CORS_ORIGIN'),
    RAPIDAPI_KEY: readString(config, 'RAPIDAPI_KEY'),
    RAPIDAPI_HOST: readString(
      config,
      'RAPIDAPI_HOST',
      'jsearch.p.rapidapi.com',
    ),
    JSEARCH_ENDPOINT: readString(
      config,
      'JSEARCH_ENDPOINT',
      'https://jsearch.p.rapidapi.com/search',
    ),
    UPWORK_RAPIDAPI_HOST: readString(
      config,
      'UPWORK_RAPIDAPI_HOST',
      'upwork-jobs-api3.p.rapidapi.com',
    ),
    UPWORK_RAPIDAPI_URL: readString(
      config,
      'UPWORK_RAPIDAPI_URL',
      'https://upwork-jobs-api3.p.rapidapi.com/upwork',
    ),
    UPWORK_CRON_SECRET: readString(config, 'UPWORK_CRON_SECRET'),
    UPWORK_CRON_Q: readString(config, 'UPWORK_CRON_Q'),
    UPWORK_CRON_SKILLS: readString(config, 'UPWORK_CRON_SKILLS'),
    UPWORK_CRON_SKILLS_MATCH_MODE: readString(
      config,
      'UPWORK_CRON_SKILLS_MATCH_MODE',
    ),
    UPWORK_CRON_HOURLY_MIN_USD: readString(
      config,
      'UPWORK_CRON_HOURLY_MIN_USD',
    ),
    UPWORK_CRON_HOURLY_MAX_USD: readString(
      config,
      'UPWORK_CRON_HOURLY_MAX_USD',
    ),
    UPWORK_CRON_FIXED_MIN_USD: readString(config, 'UPWORK_CRON_FIXED_MIN_USD'),
    UPWORK_CRON_FIXED_MAX_USD: readString(config, 'UPWORK_CRON_FIXED_MAX_USD'),
    UPWORK_CRON_LIMIT: readString(config, 'UPWORK_CRON_LIMIT'),
    SLACK_WEBHOOK_URL: readString(config, 'SLACK_WEBHOOK_URL'),
    SLACK_BOT_TOKEN: readString(config, 'SLACK_BOT_TOKEN'),
    SLACK_SIGNING_SECRET: readString(config, 'SLACK_SIGNING_SECRET'),
    SLACK_UPWORK_CHANNEL_ID: readString(config, 'SLACK_UPWORK_CHANNEL_ID'),
    TWILIO_ACCOUNT_SID: readString(config, 'TWILIO_ACCOUNT_SID'),
    TWILIO_AUTH_TOKEN: readString(config, 'TWILIO_AUTH_TOKEN'),
    TWILIO_WHATSAPP_FROM: readString(config, 'TWILIO_WHATSAPP_FROM'),
    TWILIO_WHATSAPP_TO: readString(config, 'TWILIO_WHATSAPP_TO'),
    WHATSAPP_CALLMEBOT_PHONE: readString(config, 'WHATSAPP_CALLMEBOT_PHONE'),
    WHATSAPP_CALLMEBOT_APIKEY: readString(config, 'WHATSAPP_CALLMEBOT_APIKEY'),
    HUNTER_API_KEY: readString(config, 'HUNTER_API_KEY'),
    HUNTER_MIN_CONFIDENCE: readNumber(
      config,
      'HUNTER_MIN_CONFIDENCE',
      DEFAULT_HUNTER_MIN_CONFIDENCE,
    ),
    RESEND_API_KEY: readString(config, 'RESEND_API_KEY'),
    RESEND_FROM_EMAIL: readString(config, 'RESEND_FROM_EMAIL'),
    OUTREACH_REPLY_TO: readString(config, 'OUTREACH_REPLY_TO'),
    DEFAULT_JOB_KEYWORDS: readString(config, 'DEFAULT_JOB_KEYWORDS'),
    DEFAULT_JOB_LOCATIONS: readString(config, 'DEFAULT_JOB_LOCATIONS'),
    CRON_SCHEDULE: readString(config, 'CRON_SCHEDULE', DEFAULT_CRON_SCHEDULE),
    PIPELINE_AUTO_SEND_EMAILS: readString(config, 'PIPELINE_AUTO_SEND_EMAILS'),
    ENABLE_BULK_OUTREACH: readString(config, 'ENABLE_BULK_OUTREACH'),
    OPENAI_API_KEY: readString(config, 'OPENAI_API_KEY'),
    OPENAI_MODEL: readString(config, 'OPENAI_MODEL', 'gpt-4o-mini'),
    QWEN_API_KEY: readString(config, 'QWEN_API_KEY'),
    QWEN_API_BASE: readString(
      config,
      'QWEN_API_BASE',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    ),
    QWEN_MODEL: readString(config, 'QWEN_MODEL', 'qwen-turbo'),
    OPENROUTER_API_KEY: readString(config, 'OPENROUTER_API_KEY'),
    OPENROUTER_API_BASE: readString(
      config,
      'OPENROUTER_API_BASE',
      'https://openrouter.ai/api/v1',
    ),
    OPENROUTER_MODEL: readString(
      config,
      'OPENROUTER_MODEL',
      'qwen/qwen3.6-plus-preview:free',
    ),
    OPENROUTER_REASONING_ENABLED:
      readString(
        config,
        'OPENROUTER_REASONING_ENABLED',
        'true',
      ).toLowerCase() !== 'false',
    OPENROUTER_EMBEDDING_MODEL: readString(
      config,
      'OPENROUTER_EMBEDDING_MODEL',
      'openai/text-embedding-3-small',
    ),
    OPENROUTER_PROPOSAL_MODEL: readString(config, 'OPENROUTER_PROPOSAL_MODEL'),
  };
}
