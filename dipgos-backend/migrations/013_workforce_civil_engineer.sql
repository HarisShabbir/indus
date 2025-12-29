-- 013_workforce_civil_engineer.sql
-- Enriched workforce professional profile for Civil Engineer (FWO)
SET search_path TO dipgos, public;

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_rcc
)
INSERT INTO dipgos.atom_manifestation (
  id,
  tenant_id,
  vendor,
  machine_type,
  model,
  attribute_name,
  attribute_value,
  units,
  validation
)
SELECT
  gen_random_uuid(),
  tenant_id,
  'FWO Talent Pool',
  'CivilEngineer',
  'RCC Specialist',
  attr.attribute_name,
  attr.attribute_value,
  attr.units,
  attr.validation
FROM params
CROSS JOIN (
  VALUES
    ('Demographics · Nationality', 'Pakistani', NULL, NULL),
    ('Demographics · Languages', 'Urdu · English · Pashto (working)', NULL, NULL),
    ('Demographics · Hometown', 'Rawalpindi, Pakistan', NULL, NULL),
    ('Experience · Years', '12', 'years', NULL),
    ('Experience · Mega Projects', '7', NULL, NULL),
    ('Experience · Core Discipline', 'Roller compacted concrete / structural QA', NULL, NULL),
    ('Experience · Leadership', 'Former section engineer · 5 direct reports', NULL, NULL),
    ('Contact · Phone', '+92-300-555-8921', NULL, NULL),
    ('Contact · Email', 'civil.engineer@fwo.pk', NULL, NULL),
    ('Contact · Emergency', '+92-321-444-5522', NULL, NULL),
    ('Education · Degree', 'Master of Civil Engineering', NULL, NULL),
    ('Education · University', 'University of Engineering & Technology (UET) Lahore', NULL, NULL),
    ('Certifications', 'PEC Registered Engineer · ACI Field Testing Grade 1 · NEBOSH IGC', NULL, NULL),
    ('Safety Training', 'Confined space refresher: 2025-04-22 · LOTO audit: 2025-05-02', NULL, NULL),
    ('Specialties', 'Thermal control · Structural remediation · Field mentoring', NULL, NULL),
    ('Digital Toolchain', 'Primavera · BIM 360 · FieldVu QA dashboards · PowerBI', NULL, NULL)
) AS attr(attribute_name, attribute_value, units, validation)
ON CONFLICT (tenant_id, vendor, machine_type, model, attribute_name) DO NOTHING;

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id
)
INSERT INTO dipgos.atom_attributes (id, atom_id, label, value, tenant_id)
SELECT
  gen_random_uuid(),
  atom_id,
  attr.label,
  attr.value::jsonb,
  tenant_id
FROM params
CROSS JOIN (
  VALUES
    ('Career Highlights', '{"notable":"Delivered RCC lift L14 ahead of schedule","awards":["Best Field Engineer 2024","FWO Excellence Medal"],"ncrZero":"180 days without structural NCR"}'),
    ('Wellness & Readiness', '{"wellnessScore":0.93,"fatigueRisk":"Low","lastBreak":"2025-05-19","readinessScore":0.95}'),
    ('Skills Matrix', '{"core":["Thermal control","Structural QA/QC","Field mentoring"],"digital":["Primavera","BIM 360","FieldVu"],"safety":["Confined space lead","First aider"],"languages":["Urdu","English","Pashto (working)"]}'),
    ('Base Location', '{"lat":35.6179,"lng":73.1371,"site":"MW-01 RCC Pour Yard","mapZoom":14}'),
    ('Contact Details', '{"phone":"+92-300-555-8921","email":"civil.engineer@fwo.pk","emergency":"+92-321-444-5522"}'),
    ('Project Allocations', '{"current":[{"project":"Diamer Basha RCC","role":"Senior Field Engineer","start":"2024-11-01","status":"Active","scope":"Lift sequencing & QA"}],"history":[{"project":"Cofferdam Remediation","role":"Field Lead","start":"2024-08-01","end":"2024-10-30"},{"project":"Kohala Hydropower","role":"Section Engineer","start":"2022-04-01","end":"2024-06-15"}]}'),
    ('Working Hours', '{"today":9.4,"weekToDate":46.5,"overtime":3.8,"breaks":1.2,"travelStatus":"On-site"}'),
    ('Attendance Trend', '{"attendance":[96,97,95,98,99,97,96,98,97,99,98,99,97,98],"shiftAdherence":[94,95,93,96,97,95,94,96,95,97,95,96,94,95],"readiness":[92,93,92,94,95,94,93,95,94,96,95,95,94,95]}'),
    ('Toolbox & Permits', '{"toolboxParticipation":0.94,"lastToolbox":"2025-05-18","permits":["Confined Space","Hot Work"],"certificationCurrency":0.98,"siteAccessApprovals":3,"openActions":1}'),
    ('Equipment Access', '{"access":["Thermal cameras","Concrete maturity sensors","Laser scanners"],"toolReady":0.96}'),
    ('Performance KPIs', '{"productivity":{"value":5.3,"unit":"tasks/hr","trend":[4.6,4.8,4.9,5.0,5.1,5.2,5.3,5.4,5.5,5.4,5.5,5.6,5.5,5.3]},"quality":{"value":98.0,"unit":"%","trend":[96,96,97,97,98,98,99,99,99,98,98,99,98,98]},"rework":{"value":0.8,"unit":"%","trend":[1.6,1.5,1.4,1.3,1.2,1.1,1.0,0.9,0.9,0.8,0.8,0.8,0.7,0.8]},"collaboration":{"value":92.0,"unit":"%"},"utilization":{"value":90.0,"unit":"%"},"safetyIncidents":{"value":0,"unit":"count"},"sla":{"value":0.96,"unit":"%"}}'),
    ('Work Completed', '{"recent":["Closed 4 structural RFIs","Approved thermal control plan for Lift L14","Mentored 2 junior engineers on BIM checklists"],"milestones":[{"name":"Lift L13 concrete","date":"2025-05-12","status":"Signed-off"},{"name":"Thermal dashboard rollout","date":"2025-05-08","status":"Complete"}],"approvals":[{"name":"Workface planning","count":6},{"name":"Quality dossiers","count":3}]}'),
    ('Performance Notes', '{"positives":["Concrete maturity alerts responded within 8 minutes","QA dossiers accepted on first submission"],"watch":["Coordinate design response for RFI #542 within SLA"]}')
) AS attr(label, value)
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id
)
INSERT INTO dipgos.atom_mobilization (
  id,
  atom_id,
  mobilized_on,
  demobilized_on,
  location,
  status,
  metadata,
  tenant_id
)
SELECT
  gen_random_uuid(),
  atom_id,
  mobilization.mobilized_on,
  mobilization.demobilized_on,
  mobilization.location,
  mobilization.status,
  mobilization.metadata::jsonb,
  tenant_id
FROM params
CROSS JOIN (
  VALUES
    (CURRENT_DATE - INTERVAL '45 days', NULL, 'RCC Pour Yard · Lift L14', 'active', '{"readinessKpi":"Thermal compliance 98%","shift":"Day","attendance":"98%","toolAccess":"Ready"}'),
    (DATE '2024-11-04', DATE '2025-02-28', 'Cofferdam Remediation Cell', 'completed', '{"readinessKpi":"Structural NCR closeout 100%","toolbox":"Weekly","travel":"Commute from site camp"}')
) AS mobilization(mobilized_on, demobilized_on, location, status, metadata)
ON CONFLICT (id) DO NOTHING;

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_rcc
)
INSERT INTO dipgos.atom_productivity_logs (
  id,
  atom_id,
  deployment_id,
  scope_entity_id,
  log_date,
  shift,
  output_quantity,
  output_unit,
  productive_hours,
  idle_hours,
  quality_score,
  notes,
  tenant_id
)
SELECT
  gen_random_uuid(),
  atom_id,
  NULL,
  process_rcc,
  (CURRENT_DATE - gs * INTERVAL '1 day')::date,
  'day',
  (5.5 + gs * 0.1)::numeric(14,2),
  'RFIs closed',
  7.2 + (gs * 0.1),
  0.6,
  96 - (gs * 0.3),
  CONCAT('RFI closeout batch ', 540 + gs),
  tenant_id
FROM params
CROSS JOIN generate_series(0, 13) AS gs
ON CONFLICT (tenant_id, atom_id, log_date, shift) DO NOTHING;
