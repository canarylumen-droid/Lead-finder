import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sql = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  niches TEXT NOT NULL,
  cities TEXT NOT NULL,
  country TEXT NOT NULL,
  max_reviews INTEGER NOT NULL DEFAULT 40,
  target_volume INTEGER NOT NULL DEFAULT 500,
  status TEXT NOT NULL DEFAULT 'running',
  leads_count INTEGER NOT NULL DEFAULT 0,
  email_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

ALTER TABLE scrape_sessions ADD COLUMN IF NOT EXISTS include_phone INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_sessions_user ON scrape_sessions(user_id);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES scrape_sessions(id),
  user_id INTEGER NOT NULL,
  niche TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  rating TEXT,
  reviews_count INTEGER,
  address TEXT,
  email TEXT,
  email_verified INTEGER DEFAULT 0,
  maps_url TEXT,
  scraped_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_session_name_city_idx ON leads(session_id, name, city);
CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_session_scraped ON leads(session_id, scraped_at DESC);

-- ── SMTP Providers ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smtp_providers (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user_template TEXT,
  spf_include TEXT,
  dkim_selector TEXT,
  api_base TEXT,
  docs_url TEXT,
  has_api_fetch INTEGER DEFAULT 0,
  color TEXT
);

-- Seed canonical provider list (upsert so re-runs are safe)
INSERT INTO smtp_providers (slug, name, smtp_host, smtp_port, smtp_user_template, spf_include, dkim_selector, api_base, docs_url, has_api_fetch, color) VALUES
  ('resend',          'Resend',                   'smtp.resend.com',           465, 'resend',        'spf.resend.com',          'resend',     'https://api.resend.com',                         'https://resend.com/docs',             1, '#000000'),
  ('brevo',           'Brevo',                    'smtp-relay.brevo.com',      587, '{login}',       'spf.brevo.com',           'mail',       'https://api.brevo.com/v3',                       'https://developers.brevo.com',        1, '#0b996e'),
  ('mailgun',         'Mailgun',                  'smtp.mailgun.org',          587, '{login}',       'mailgun.org',             'krs',        'https://api.mailgun.net/v3',                     'https://documentation.mailgun.com',   0, '#f06b1e'),
  ('sendgrid',        'SendGrid',                 'smtp.sendgrid.net',         587, 'apikey',        'sendgrid.net',            's1',         'https://api.sendgrid.com/v3',                    'https://docs.sendgrid.com',           0, '#1a82e2'),
  ('postmark',        'Postmark',                 'smtp.postmarkapp.com',      587, '{token}',       'spf.mtasv.net',           'pm',         'https://api.postmarkapp.com',                    'https://postmarkapp.com/developer',   0, '#ffde00'),
  ('sparkpost',       'SparkPost',                'smtp.sparkpostmail.com',    587, 'SMTP_Injection', 'sparkpostmail.com',      'scph1224',   'https://api.sparkpost.com/api/v1',               'https://developers.sparkpost.com',    0, '#fa6423'),
  ('ses',             'Amazon SES',               'email-smtp.us-east-1.amazonaws.com', 587, '{accessKey}', 'amazonses.com',  'ses',        'https://email.us-east-1.amazonaws.com',          'https://docs.aws.amazon.com/ses',     0, '#ff9900'),
  ('mailjet',         'Mailjet',                  'in-v3.mailjet.com',         587, '{apiKey}',      'spf.mailjet.com',         'mailjet',    'https://api.mailjet.com/v3.1',                   'https://dev.mailjet.com',             0, '#9b59b6'),
  ('elasticemail',    'Elastic Email',            'smtp.elasticemail.com',     2525,'{login}',       'elasticemail.com',        'ee',         'https://api.elasticemail.com/v4',                'https://elasticemail.com/developers', 0, '#28a8e0'),
  ('smtp2go',         'SMTP2GO',                  'mail.smtp2go.com',          2525,'{login}',       'spf.smtp2go.com',         's2g',        'https://api.smtp2go.com/v3',                     'https://apidoc.smtp2go.com',          0, '#2e7d32'),
  ('mailtrap',        'Mailtrap',                 'live.smtp.mailtrap.io',     587, 'api',           'mailtrap.io',             'mailtrap',   'https://mailtrap.io/api',                        'https://api-docs.mailtrap.io',        0, '#16c79a'),
  ('cloudmailin',     'Cloudmailin',              'smtp.cloudmailin.net',      587, '{address}',     'cloudmailin.net',         'cm',         NULL,                                             'https://docs.cloudmailin.com',        0, '#4285f4'),
  ('mandrill',        'Mandrill (Mailchimp)',      'smtp.mandrillapp.com',      587, 'apikey',        'spf.mandrillapp.com',     'mandrill',   'https://mandrillapp.com/api/1.0',                'https://mailchimp.com/developer',     0, '#ffe01b'),
  ('zohomail',        'Zoho Mail',                'smtp.zoho.com',             465, '{email}',       'zoho.com',                'zoho',       'https://mail.zoho.com/api',                      'https://www.zoho.com/mail/help',      0, '#e42527'),
  ('smtpcom',         'SMTP.com',                 'send.smtp.com',             2525,'{login}',       'smtp.com',                'smtp',       'https://api.smtp.com/v4',                        'https://www.smtp.com/resources',      0, '#1565c0')
ON CONFLICT (slug) DO UPDATE SET
  smtp_host = EXCLUDED.smtp_host,
  smtp_port = EXCLUDED.smtp_port,
  smtp_user_template = EXCLUDED.smtp_user_template,
  spf_include = EXCLUDED.spf_include,
  dkim_selector = EXCLUDED.dkim_selector,
  api_base = EXCLUDED.api_base,
  docs_url = EXCLUDED.docs_url,
  has_api_fetch = EXCLUDED.has_api_fetch,
  color = EXCLUDED.color;

-- ── SMTP Accounts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS smtp_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider_id INTEGER NOT NULL REFERENCES smtp_providers(id),
  label TEXT NOT NULL,
  api_key TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  degraded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smtp_accounts_user ON smtp_accounts(user_id);

-- ── Domain → Account Map ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domain_account_map (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  domain TEXT NOT NULL,
  primary_account_id INTEGER NOT NULL REFERENCES smtp_accounts(id),
  fallback_account_id INTEGER REFERENCES smtp_accounts(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_map_user_domain ON domain_account_map(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_domain_map_user ON domain_account_map(user_id);

-- ── Mailcow Config ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mailcow_config (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  base_url TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  relay_configured INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ── DNS Records ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dns_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  domain TEXT NOT NULL,
  record_type TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  ttl INTEGER DEFAULT 3600,
  provider TEXT,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dns_records_user_domain ON dns_records(user_id, domain);

-- ── Relay Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relay_logs (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  account_id INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_logs_created ON relay_logs(created_at DESC);
`;

async function main() {
  await pool.query(sql);
  console.log("Schema + seed data applied successfully");
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
