-- Create domains and ventures tables and basic structure
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Domains table (top-level areas of focus)
CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ventures table (sub-areas under domains)
CREATE TABLE IF NOT EXISTS ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  primary_domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Area compatibility mapping (legacy bridge)
CREATE TABLE IF NOT EXISTS area_compat_map (
  legacy_area_key TEXT PRIMARY KEY,
  domain_id UUID REFERENCES domains(id) ON DELETE SET NULL,
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraint: at least one of domain_id or venture_id must be non-null
  CONSTRAINT area_compat_map_check CHECK (
    (domain_id IS NOT NULL) OR (venture_id IS NOT NULL)
  )
);

-- Add venture_id column to projects if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'venture_id'
  ) THEN
    ALTER TABLE projects ADD COLUMN venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_domains_slug ON domains(slug);
CREATE INDEX IF NOT EXISTS idx_ventures_slug ON ventures(slug);
CREATE INDEX IF NOT EXISTS idx_ventures_domain ON ventures(primary_domain_id);
CREATE INDEX IF NOT EXISTS idx_area_compat_legacy ON area_compat_map(legacy_area_key);
CREATE INDEX IF NOT EXISTS idx_area_compat_domain ON area_compat_map(domain_id);
CREATE INDEX IF NOT EXISTS idx_area_compat_venture ON area_compat_map(venture_id);
CREATE INDEX IF NOT EXISTS idx_projects_venture ON projects(venture_id);

-- Auto-update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_domains_updated_at ON domains;
CREATE TRIGGER update_domains_updated_at 
  BEFORE UPDATE ON domains 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ventures_updated_at ON ventures;
CREATE TRIGGER update_ventures_updated_at 
  BEFORE UPDATE ON ventures 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();