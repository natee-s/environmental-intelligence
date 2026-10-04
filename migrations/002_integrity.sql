CREATE FUNCTION protect_master_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.approved_by IS NOT NULL AND (to_jsonb(NEW)-'status'-'effective_to') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'effective_to') THEN
  RAISE EXCEPTION 'Approved master configuration is immutable; create a new version';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER master_config_immutable BEFORE UPDATE ON master_versions FOR EACH ROW EXECUTE FUNCTION protect_master_version();
CREATE FUNCTION protect_report_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end THEN RAISE EXCEPTION 'Report snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER report_snapshot_immutable BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION protect_report_snapshot();
CREATE TRIGGER record_no_delete BEFORE DELETE ON record_versions FOR EACH ROW EXECUTE FUNCTION forbid_event_change();
CREATE TRIGGER evidence_no_delete BEFORE DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION forbid_event_change();
CREATE TRIGGER report_no_delete BEFORE DELETE ON reports FOR EACH ROW EXECUTE FUNCTION forbid_event_change();
