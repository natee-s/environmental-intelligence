CREATE TABLE background_jobs (
  id text PRIMARY KEY,
  site_id text NOT NULL REFERENCES sites(id),
  actor_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK(kind IN('IMPORT_PREVIEW','IMPORT_CONFIRM')),
  batch_id text NOT NULL REFERENCES import_batches(id),
  status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','RUNNING','COMPLETED','FAILED')),
  cursor int NOT NULL DEFAULT 0,
  total int NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  error text NOT NULL DEFAULT '',
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_queue ON background_jobs(status,created_at);
CREATE INDEX jobs_site ON background_jobs(site_id,created_at);
CREATE TABLE scheduler_state (site_id text PRIMARY KEY REFERENCES sites(id),last_scan timestamptz);
