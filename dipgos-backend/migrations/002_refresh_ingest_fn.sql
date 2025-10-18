CREATE OR REPLACE FUNCTION dipgos.ingest_daily_kpis(p_from DATE, p_to DATE)
RETURNS void AS $$
BEGIN
  WITH base AS (
    SELECT r.project_id,
           r.contract_id,
           r.sow_id,
           r.process_id,
           r.report_date,
           i.id AS item_id,
           COALESCE(i.extra ->> 'activity_label', '') AS activity_label,
           i.metric_label,
           i.designed_total,
           COALESCE(i.produced_total, COALESCE(i.produced_day,0) + COALESCE(i.produced_night,0)) AS produced_total,
           COALESCE(i.cumulative_actual, 0) AS cumulative_actual,
           COALESCE(i.cumulative_planned, 0) AS cumulative_planned,
           i.remaining,
           i.completion_pct,
           i.cost_actual,
           i.cost_planned,
           i.extra
    FROM dipgos.process_daily_report r
    JOIN dipgos.process_daily_item i ON i.report_id = r.id
    WHERE r.report_date BETWEEN p_from AND p_to
  ),
  prepared AS (
    SELECT b.*,
           CASE
             WHEN b.designed_total IS NULL OR b.designed_total = 0 THEN NULL
             ELSE LEAST(100.0, GREATEST(0.0, (b.cumulative_actual / b.designed_total) * 100.0))
           END AS pct_actual,
           CASE
             WHEN b.designed_total IS NULL OR b.designed_total = 0 THEN NULL
             ELSE LEAST(100.0, GREATEST(0.0, (b.cumulative_planned / NULLIF(b.designed_total,0)) * 100.0))
           END AS pct_planned,
           COALESCE((b.extra ->> 'ncr_open')::numeric, 0) AS ncr_open_val,
           COALESCE((b.extra ->> 'ncr_closed')::numeric, 0) AS ncr_closed_val,
           COALESCE((b.extra ->> 'qaor_open')::numeric, 0) AS qaor_open_val,
           COALESCE((b.extra ->> 'qaor_closed')::numeric, 0) AS qaor_closed_val,
           COALESCE((b.extra ->> 'quality_conf')::numeric, b.completion_pct) AS quality_conf_val,
           COALESCE((b.extra ->> 'schedule_progress_pct')::numeric, b.completion_pct) AS schedule_progress_val,
           COALESCE((b.extra ->> 'spi')::numeric, NULL) AS spi_val,
           COALESCE((b.extra ->> 'ev')::numeric, NULL) AS ev_val,
           COALESCE((b.extra ->> 'pv')::numeric, NULL) AS pv_val
    FROM base b
  ),
  metrics AS (
    SELECT project_id,
           contract_id,
           sow_id,
           process_id,
           report_date AS ts_date,
           'prod_actual_pct'::text AS metric_code,
           pct_actual AS actual_value,
           pct_planned AS planned_value,
           jsonb_build_object('source','process_daily_item','item_id', item_id) AS extra
    FROM prepared
    WHERE pct_actual IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, ts_date,
           'prod_planned_pct', planned_value, planned_value,
           jsonb_build_object('source','process_daily_item','item_id', item_id)
    FROM (
      SELECT project_id, contract_id, sow_id, process_id, report_date AS ts_date,
             pct_planned AS planned_value, item_id
      FROM prepared
    ) q
    WHERE planned_value IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'const_output',
           COALESCE(pct_actual, completion_pct), pct_planned,
           jsonb_build_object('activity', activity_label, 'item_id', item_id)
    FROM prepared
    WHERE activity_label IN ('excavation','tunneling','concrete','structure')

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'design_output',
           COALESCE(pct_actual, completion_pct), pct_planned,
           jsonb_build_object('activity', activity_label, 'item_id', item_id)
    FROM prepared
    WHERE activity_label IN ('structure','other')

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'prep_output',
           COALESCE(pct_actual, completion_pct), pct_planned,
           jsonb_build_object('activity', activity_label, 'item_id', item_id)
    FROM prepared
    WHERE activity_label IN ('tunneling','other')

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ncr_open',
           ncr_open_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE ncr_open_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ncr_closed',
           ncr_closed_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE ncr_closed_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'qaor_open',
           qaor_open_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE qaor_open_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'qaor_closed',
           qaor_closed_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE qaor_closed_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'quality_conf',
           quality_conf_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE quality_conf_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'schedule_progress_pct',
           schedule_progress_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE schedule_progress_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'spi',
           spi_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE spi_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ev',
           ev_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE ev_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'pv',
           pv_val::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE pv_val IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'ac',
           cost_actual::double precision, NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE cost_actual IS NOT NULL

    UNION ALL

    SELECT project_id, contract_id, sow_id, process_id, report_date, 'cpi',
           CASE
             WHEN cost_actual IS NULL OR cost_actual = 0 THEN NULL
             ELSE COALESCE(ev_val,0)::double precision / NULLIF(cost_actual::double precision, 0)
           END,
           NULL,
           jsonb_build_object('item_id', item_id)
    FROM prepared
    WHERE cost_actual IS NOT NULL AND cost_actual <> 0 AND ev_val IS NOT NULL
  )
  INSERT INTO dipgos.kpi_fact (
    scope_level,
    project_id,
    contract_id,
    sow_id,
    process_id,
    metric_code,
    ts_date,
    actual_numeric,
    planned_numeric,
    extra
  )
  SELECT DISTINCT ON (process_id, metric_code, ts_date)
         'process'::dipgos.scope_level,
         project_id,
         contract_id,
         sow_id,
         process_id,
         metric_code,
         ts_date,
         actual_value,
         planned_value,
         extra
  FROM metrics
  ORDER BY process_id, metric_code, ts_date, actual_value DESC;
END;
$$ LANGUAGE plpgsql;
