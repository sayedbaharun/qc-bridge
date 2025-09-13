-- Focus slots master table
CREATE TABLE IF NOT EXISTS focus_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with current slots (non-emoji canonical)
INSERT INTO focus_slots (slot) VALUES
  ('Morning Routine'),
  ('Deep Work Block 1'),
  ('Admin Block 1'),
  ('Recharge & Rest'),
  ('Deep Work Block 2'),
  ('Admin Block 2'),
  ('Shutdown Routine')
ON CONFLICT (slot) DO NOTHING;

-- Optional: view that shows both canonical and emoji mapping examples
CREATE OR REPLACE VIEW focus_slot_aliases AS
SELECT slot,
  CASE slot
    WHEN 'Morning Routine' THEN '🌅 Morning Routine'
    WHEN 'Deep Work Block 1' THEN '🎯 Deep Work Block 1'
    WHEN 'Admin Block 1' THEN '📋 Admin Block 1'
    WHEN 'Recharge & Rest' THEN '🔋 Recharge & Rest'
    WHEN 'Deep Work Block 2' THEN '🎯 Deep Work Block 2'
    WHEN 'Admin Block 2' THEN '📋 Admin Block 2'
    WHEN 'Shutdown Routine' THEN '🌙 Shutdown Routine'
  END AS emoji_variant
FROM focus_slots;

