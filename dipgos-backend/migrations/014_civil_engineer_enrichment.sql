-- 014_civil_engineer_enrichment.sql
-- Ensure the Civil Engineer atom exists with enriched human-centric data
SET search_path TO dipgos, public;

-- Ensure a workforce professionals group exists
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'b0000000-0000-0000-0000-000000000003'::uuid AS workforce_root
)
INSERT INTO dipgos.atom_groups (id, category, name, parent_id, tenant_id)
SELECT
  'b2000000-0000-0000-0000-000000000701'::uuid,
  'actors',
  'Professional Staff',
  workforce_root,
  tenant_id
FROM seed
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    parent_id = EXCLUDED.parent_id;

-- Ensure the Civil Engineer atom type exists
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'b2000000-0000-0000-0000-000000000701'::uuid AS group_id
)
INSERT INTO dipgos.atom_types (id, group_id, category, name, spec, tenant_id)
SELECT
  'c0000000-0000-0000-0000-000000000006'::uuid,
  group_id,
  'actors',
  'Civil Engineer · RCC Structures',
  jsonb_build_object('discipline', 'RCC Structures', 'role', 'Senior Civil Engineer'),
  tenant_id
FROM seed
ON CONFLICT (id) DO UPDATE
SET group_id = EXCLUDED.group_id,
    name = EXCLUDED.name,
    spec = EXCLUDED.spec,
    tenant_id = EXCLUDED.tenant_id;

-- Ensure the Civil Engineer atom record exists
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AS contractor_id,
    '22222222-2222-2222-2222-222222222222'::uuid AS contract_id
)
INSERT INTO dipgos.atoms (id, atom_type_id, name, unit, contractor_id, home_entity_id, spec, tenant_id)
SELECT
  'd0000000-0000-0000-0000-000000000007'::uuid,
  'c0000000-0000-0000-0000-000000000006'::uuid,
  'Senior Civil Engineer · RCC Structures',
  'person',
  contractor_id,
  contract_id,
  jsonb_build_object(
    'experienceYears', 12,
    'primaryDiscipline', 'RCC Structures',
    'role', 'Senior Civil Engineer',
    'languages', jsonb_build_array('Urdu', 'English'),
    'availability', 'Rotation A · 28/14'
  ),
  tenant_id
FROM seed
ON CONFLICT (id) DO UPDATE
SET atom_type_id = EXCLUDED.atom_type_id,
    name = EXCLUDED.name,
    unit = EXCLUDED.unit,
    contractor_id = EXCLUDED.contractor_id,
    home_entity_id = EXCLUDED.home_entity_id,
    spec = EXCLUDED.spec,
    active = TRUE,
    tenant_id = EXCLUDED.tenant_id;

-- Seed mobilization history for the Civil Engineer
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id
)
INSERT INTO dipgos.atom_mobilization (id, atom_id, mobilized_on, demobilized_on, location, status, metadata, tenant_id)
SELECT
  entry.id,
  atom_id,
  entry.mobilized_on,
  entry.demobilized_on,
  entry.location,
  entry.status,
  entry.metadata::jsonb,
  tenant_id
FROM seed
CROSS JOIN (
  VALUES
    (
      'e2000000-0000-0000-0000-000000000701'::uuid,
      (CURRENT_DATE - INTERVAL '45 days')::date,
      NULL::date,
      'RCC Pour Yard · Lift L14',
      'active',
      '{"readinessKpi":"Thermal compliance 98%","crew":"Day shift","shift":"Day"}'
    ),
    (
      'e2000000-0000-0000-0000-000000000702'::uuid,
      DATE '2024-11-04',
      DATE '2025-02-28',
      'Cofferdam Remediation Cell',
      'completed',
      '{"readinessKpi":"Structural NCR closeout 100%","lessons":"Adopted 4D pour simulations"}'
    )
) AS entry(id, mobilized_on, demobilized_on, location, status, metadata)
ON CONFLICT (id) DO UPDATE
SET mobilized_on = EXCLUDED.mobilized_on,
    demobilized_on = EXCLUDED.demobilized_on,
    location = EXCLUDED.location,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    tenant_id = EXCLUDED.tenant_id;

-- Refresh attribute slots to avoid duplicates
DELETE FROM dipgos.atom_attributes
WHERE atom_id = 'd0000000-0000-0000-0000-000000000007'::uuid
  AND label IN (
    'Career Highlights',
    'Wellness & Readiness',
    'Skills Matrix',
    'Base Location',
    'Human Profile',
    'Mobilization KPIs',
    'Execution Snapshot'
  );

-- Core attribute enrichment
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id
)
INSERT INTO dipgos.atom_attributes (id, atom_id, label, value, tenant_id)
SELECT
  attr.id,
  atom_id,
  attr.label,
  attr.value::jsonb,
  tenant_id
FROM seed
CROSS JOIN (
  VALUES
    (
      'f2000000-0000-0000-0000-000000000601'::uuid,
      'Career Highlights',
      '{"notable":"Delivered RCC lift L12 ahead of schedule","awards":["Best Field Engineer 2024","FWO Excellence Medal"]}'
    ),
    (
      'f2000000-0000-0000-0000-000000000602'::uuid,
      'Wellness & Readiness',
      '{"wellnessScore":0.91,"fatigueRisk":"Low","lastBreak":"2025-05-14"}'
    ),
    (
      'f2000000-0000-0000-0000-000000000603'::uuid,
      'Skills Matrix',
      '{"core":["Thermal control","Structural QA/QC","Field mentoring"],"digital":["Primavera","BIM 360","FieldVu"],"safety":["Confined space lead","First aider"]}'
    ),
    (
      'f2000000-0000-0000-0000-000000000604'::uuid,
      'Base Location',
      '{"lat":35.6179,"lng":73.1371,"site":"MW-01 RCC Pour Yard"}'
    )
) AS attr(id, label, value)
ON CONFLICT (id) DO UPDATE
SET value = EXCLUDED.value,
    tenant_id = EXCLUDED.tenant_id;

-- Human profile attribute
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id
)
INSERT INTO dipgos.atom_attributes (id, atom_id, label, value, tenant_id)
SELECT
  'f2000000-0000-0000-0000-000000000701'::uuid,
  atom_id,
  'Human Profile',
  jsonb_build_object(
    'demographics', jsonb_build_object(
      'nationality', 'Pakistani',
      'homeBase', 'MW-01 RCC Pour Yard',
      'experienceYears', 12,
      'languages', jsonb_build_array('Urdu', 'English')
    ),
    'experience', jsonb_build_object(
      'primaryDiscipline', 'RCC Structures',
      'role', 'Senior Civil Engineer',
      'specialties', jsonb_build_array(
        'Thermal control strategy',
        'Mass concrete sequencing',
        'Structural QA/QC oversight',
        'Pour simulation facilitation'
      ),
      'licenses', jsonb_build_array(
        'PEC Registered Engineer',
        'ACI Concrete Field Testing Grade 1',
        'NESPAK RCC Quality Certification'
      ),
      'safetyTraining', jsonb_build_array(
        jsonb_build_object('name', 'High-angle rescue supervisor', 'completed', '2024-11-18'),
        jsonb_build_object('name', 'Confined space supervisor', 'completed', '2025-02-12'),
        jsonb_build_object('name', 'Permit-to-work issuer refresher', 'completed', '2025-04-03')
      ),
      'certifications', jsonb_build_array(
        'Lean Construction Practitioner',
        'Primavera P6 Advanced'
      ),
      'languages', jsonb_build_array('Urdu', 'English'),
      'availability', 'Rotation A · 28/14'
    ),
    'contact', jsonb_build_object(
      'phone', '+92-300-555-8921',
      'email', 'civil.engineer@fwo.pk'
    ),
    'education', jsonb_build_object(
      'degree', 'Master of Civil Engineering',
      'university', 'University of Engineering & Technology Lahore',
      'year', 2013
    ),
    'characteristics', jsonb_build_array(
      jsonb_build_object('label', 'Years of experience', 'value', '12 years'),
      jsonb_build_object('label', 'Primary discipline', 'value', 'RCC Structural Works'),
      jsonb_build_object('label', 'Field specialties', 'value', 'Thermal control · Lift sequencing · Field QA/QC'),
      jsonb_build_object('label', 'Licenses', 'value', 'PEC Registered Engineer · ACI Grade 1'),
      jsonb_build_object('label', 'Safety training', 'value', 'Confined space supervisor · High-angle rescue · Permit issuer'),
      jsonb_build_object('label', 'Digital toolkit', 'value', 'Primavera · BIM 360 · FieldVu QA dashboards')
    ),
    'strengths', jsonb_build_array(
      'Thermal analytics storyteller',
      'Mentors junior field engineers',
      'Aligns design-house RFIs with site reality'
    ),
    'availability', jsonb_build_object(
      'current', 'On site',
      'nextRotation', to_char(CURRENT_DATE + INTERVAL '14 days', 'YYYY-MM-DD')
    )
  ),
  tenant_id
FROM seed
ON CONFLICT (id) DO UPDATE
SET value = EXCLUDED.value,
    tenant_id = EXCLUDED.tenant_id;

-- Mobilization KPIs attribute with trends
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id
),
attendance_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.945 + sin(gs::double precision / 3.5) * 0.008 + (gs % 3) * 0.002)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
),
shift_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.928 + cos(gs::double precision / 4.0) * 0.009 - (gs % 4) * 0.0015)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
),
readiness_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.953 + sin(gs::double precision / 5.0) * 0.007 + (gs % 2) * 0.0015)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
)
INSERT INTO dipgos.atom_attributes (id, atom_id, label, value, tenant_id)
SELECT
  'f2000000-0000-0000-0000-000000000702'::uuid,
  atom_id,
  'Mobilization KPIs',
  jsonb_build_object(
    'kpis', jsonb_build_object(
      'onboardingReadiness', 0.982,
      'permitReadiness', 0.965,
      'shiftAdherence', 0.932,
      'attendance', 0.968,
      'toolboxTalkParticipation', 0.918,
      'certificationCurrency', 0.943,
      'travelStatus', 'On site',
      'equipmentAccess', 'Assigned survey kit · QA temperature probes',
      'readinessScore', 0.955,
      'trainingCompletion', 0.903,
      'siteAccessApprovals', 5,
      'openActions', 2,
      'travelWindow', 'Rotation changeout in 14 days'
    ),
    'assignments', jsonb_build_array(
      jsonb_build_object(
        'location', 'RCC Pour Yard · Lift L14',
        'role', 'Field engineering lead',
        'startDate', to_char(CURRENT_DATE - INTERVAL '58 days', 'YYYY-MM-DD'),
        'endDate', NULL,
        'status', 'Active'
      ),
      jsonb_build_object(
        'location', 'Cofferdam remediation cell',
        'role', 'Structural QA/QC lead',
        'startDate', '2024-11-04',
        'endDate', '2025-02-28',
        'status', 'Completed'
      )
    ),
    'contextNotes', jsonb_build_array(
      'Permit renewals cleared for MW-01 access through Q2',
      'Toolbox facilitator for HSSE week 21',
      'Shift adherence trending above 92% despite extended pours'
    ),
    'trend', jsonb_build_object(
      'attendance', attendance_trend.data,
      'shiftAdherence', shift_trend.data,
      'readiness', readiness_trend.data
    )
  ),
  tenant_id
FROM seed, attendance_trend, shift_trend, readiness_trend
ON CONFLICT (id) DO UPDATE
SET value = EXCLUDED.value,
    tenant_id = EXCLUDED.tenant_id;

-- Execution snapshot attribute with KPI trend slices
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id
),
productivity_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((4.300 + sin(gs::double precision / 4.0) * 0.250 - gs * 0.010)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
),
quality_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.974 + cos(gs::double precision / 4.6) * 0.004)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
),
utilisation_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.884 + sin(gs::double precision / 3.2) * 0.018 - gs * 0.0018)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
),
rework_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.016 - cos(gs::double precision / 3.4) * 0.0025)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
),
collaboration_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.912 + sin(gs::double precision / 3.8) * 0.012)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
),
sla_trend AS (
  SELECT jsonb_agg(
      jsonb_build_object(
        'date', to_char((CURRENT_DATE - gs * INTERVAL '1 day')::date, 'YYYY-MM-DD'),
        'value', ROUND((0.959 + cos(gs::double precision / 5.2) * 0.005)::numeric, 3)
      )
      ORDER BY (CURRENT_DATE - gs * INTERVAL '1 day')
    ) AS data
  FROM generate_series(13, 0, -1) AS gs
)
INSERT INTO dipgos.atom_attributes (id, atom_id, label, value, tenant_id)
SELECT
  'f2000000-0000-0000-0000-000000000703'::uuid,
  atom_id,
  'Execution Snapshot',
  jsonb_build_object(
    'worksite', jsonb_build_object(
      'name', 'RCC Pour Yard · Lift L14',
      'lat', 35.6179,
      'lng', 73.1371,
      'lastSeen', to_char(CURRENT_TIMESTAMP - INTERVAL '3 hours', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    'profileCard', jsonb_build_object(
      'role', 'Senior Civil Engineer · RCC Structures',
      'phone', '+92-300-555-8921',
      'email', 'civil.engineer@fwo.pk',
      'skills', jsonb_build_array(
        'Thermal control strategy',
        'Concrete maturity analytics',
        'RFI triage & closure',
        'Crew mentoring'
      ),
      'avatar', '/images/jpg_output/civic_engineer1.jpg'
    ),
    'allocations', jsonb_build_array(
      jsonb_build_object(
        'project', 'MW-01 Main Dam',
        'role', 'Field Engineering Lead',
        'start', '2024-09-01',
        'end', NULL
      ),
      jsonb_build_object(
        'project', 'Cofferdam Remediation',
        'role', 'Structural QA/QC Lead',
        'start', '2024-11-04',
        'end', '2025-02-28'
      ),
      jsonb_build_object(
        'project', 'Thermal Control Task Force',
        'role', 'Thermal Analytics Coordinator',
        'start', '2025-03-12',
        'end', NULL
      )
    ),
    'hours', jsonb_build_object(
      'today', 9.3,
      'weekToDate', 46.8,
      'overtime', 6.4,
      'breaks', 1.6
    ),
    'workCompleted', jsonb_build_object(
      'tasks', jsonb_build_array(
        'Closed 5 structural RFIs (Lift L14)',
        'Updated thermal control logbook to v2.3',
        'Validated reinforcement congestion mitigation plan'
      ),
      'milestones', jsonb_build_array(
        'Lift L14 pour release signed',
        'Embedded sensor calibrations verified'
      ),
      'approvals', jsonb_build_array(
        'PTW #4581 · RCC pour',
        'Concrete maturity override #782 cleared',
        'Toolbox talk attendance log exported'
      )
    ),
    'performance', jsonb_build_object(
      'productivity', jsonb_build_object(
        'value', 4.18,
        'unit', 'tasks/hr',
        'trend', productivity_trend.data
      ),
      'qualityScore', jsonb_build_object(
        'value', 0.982,
        'unit', '%',
        'trend', quality_trend.data
      ),
      'reworkRate', jsonb_build_object(
        'value', 0.014,
        'unit', '%',
        'trend', rework_trend.data
      ),
      'collaboration', jsonb_build_object(
        'value', 0.918,
        'unit', '%',
        'trend', collaboration_trend.data
      ),
      'utilization', jsonb_build_object(
        'value', 0.886,
        'unit', '%',
        'trend', utilisation_trend.data
      ),
      'safetyIncidents', jsonb_build_object(
        'count', 0,
        'severity', 'None recorded'
      ),
      'slaAdherence', jsonb_build_object(
        'value', 0.961,
        'unit', '%',
        'trend', sla_trend.data
      )
    )
  ),
  tenant_id
FROM seed, productivity_trend, quality_trend, utilisation_trend, rework_trend, collaboration_trend, sla_trend
ON CONFLICT (id) DO UPDATE
SET value = EXCLUDED.value,
    tenant_id = EXCLUDED.tenant_id;

-- Refresh manifestation descriptors
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id
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
FROM seed
CROSS JOIN (
  VALUES
    ('Specialty · Thermal control strategy', 'Implemented gradient control playbook for lifts L12-L14', NULL, NULL),
    ('Specialty · Structural QA/QC', 'Leads rebar congestion audits & pour readiness sign-offs', NULL, NULL),
    ('Safety Training · Confined space supervisor', 'Certified 2025-02-12', NULL, 'Valid 12 months'),
    ('Safety Training · High-angle rescue', 'Supervisor track, refreshed 2024-11-18', NULL, 'Valid 24 months'),
    ('Availability · Rotation', '28/14 rotation · Next travel window 2025-05-28', NULL, NULL),
    ('Digital Toolkit', 'Primavera · BIM 360 · FieldVu QA dashboards · AnyLogic scenario models', NULL, NULL)
) AS attr(attribute_name, attribute_value, units, validation)
ON CONFLICT (tenant_id, vendor, machine_type, model, attribute_name) DO UPDATE
SET attribute_value = EXCLUDED.attribute_value,
    units = EXCLUDED.units,
    validation = EXCLUDED.validation;

-- Ensure 14-day productivity logs exist for trend views
WITH seed AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,
    'd0000000-0000-0000-0000-000000000007'::uuid AS atom_id,
    '44444444-4444-4444-4444-444444444444'::uuid AS process_id
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
  process_id,
  (CURRENT_DATE - gs * INTERVAL '1 day')::date,
  'day',
  ROUND((5.6 + sin(gs::double precision / 3.6) * 0.6 + (gs % 4) * 0.05)::numeric, 2),
  'RFIs closed',
  ROUND((7.4 + cos(gs::double precision / 4.2) * 0.6)::numeric, 2),
  ROUND((0.8 + sin(gs::double precision / 4.3) * 0.25)::numeric, 2),
  ROUND((97.2 - gs * 0.35 + sin(gs::double precision / 4.5) * 0.2)::numeric, 1),
  concat('Closed structural QA log #', 240 + gs, ' • Toolbox lead ', (88 + (gs % 5) * 2)::text, '%'),
  tenant_id
FROM seed
JOIN generate_series(0, 13) AS gs ON TRUE
ON CONFLICT (tenant_id, atom_id, log_date, shift) DO UPDATE
SET output_quantity = EXCLUDED.output_quantity,
    productive_hours = EXCLUDED.productive_hours,
    idle_hours = EXCLUDED.idle_hours,
    quality_score = EXCLUDED.quality_score,
    notes = EXCLUDED.notes,
    updated_at = NOW();
