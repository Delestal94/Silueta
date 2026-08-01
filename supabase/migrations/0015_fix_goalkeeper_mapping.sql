-- ============================================================
-- 0015: Repair goalkeepers imported as defenders
--
-- EA groups goalkeepers under positionType "Defense", so the first import
-- mapped every keeper to `defender` and no room could ever fill its GK slot.
-- The specific position (ea_position) is the reliable signal.
-- Safe to re-run.
-- ============================================================

update public.players
set position_type = 'goalkeeper'
where ea_position = 'GK'
  and position_type is distinct from 'goalkeeper';

update public.players
set position_type = 'defender'
where ea_position in ('CB', 'LB', 'RB', 'LWB', 'RWB')
  and position_type is distinct from 'defender';

update public.players
set position_type = 'midfielder'
where ea_position in ('CDM', 'CM', 'CAM', 'LM', 'RM')
  and position_type is distinct from 'midfielder';

update public.players
set position_type = 'forward'
where ea_position in ('ST', 'CF', 'LW', 'RW')
  and position_type is distinct from 'forward';
