CREATE TABLE IF NOT EXISTS swatch_workspace (
  id text PRIMARY KEY,
  body text NOT NULL,
  version integer NOT NULL,
  saved_at text
);
CREATE TABLE IF NOT EXISTS swatch_assets (
  workspace text NOT NULL,
  id text NOT NULL,
  mime text NOT NULL,
  bytes bytea NOT NULL,
  PRIMARY KEY (workspace, id)
);
