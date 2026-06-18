-- One-time migration: add columns missing from original schema
ALTER TABLE audit_schedules ADD COLUMN total_assets_inspected INTEGER;
ALTER TABLE audit_schedules ADD COLUMN asset_status_summary TEXT;
ALTER TABLE audit_schedules ADD COLUMN verified_asset_count INTEGER;
ALTER TABLE audit_schedules ADD COLUMN asset_statuses TEXT;
