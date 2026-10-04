CREATE TABLE rule_evaluations(
 id text PRIMARY KEY,
 site_id text NOT NULL REFERENCES sites(id),
 rule_id text NOT NULL REFERENCES master_versions(id),
 record_id text NOT NULL,
 result text NOT NULL CHECK(result IN('PASS','EXCEED','INDETERMINATE','NOT_EVALUATED','PENDING')),
 value numeric(24,8),
 evaluated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(record_id,site_id) REFERENCES record_versions(id,site_id),
 UNIQUE(rule_id,record_id)
);
CREATE TRIGGER evaluations_immutable BEFORE UPDATE OR DELETE ON rule_evaluations FOR EACH ROW EXECUTE FUNCTION forbid_event_change();
