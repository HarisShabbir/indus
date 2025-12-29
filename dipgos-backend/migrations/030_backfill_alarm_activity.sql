-- Backfill activity_id for existing open alarms by mapping block/group to a schedule activity.
-- Preference order: exact block_number match, same group; otherwise first in group.

WITH candidate AS (
    SELECT
        al.id AS alarm_id,
        (
            SELECT a.id
            FROM dipgos.rcc_schedule_activities a
            WHERE a.block_group_code = al.block_group_code
              AND (a.block_number = al.block_number OR a.block_number IS NULL)
              AND a.status NOT IN ('complete', 'canceled')
            ORDER BY
              CASE WHEN a.block_number = al.block_number THEN 0 ELSE 1 END,
              a.baseline_start
            LIMIT 1
        ) AS activity_id
    FROM dipgos.rcc_alarm_events al
    WHERE al.activity_id IS NULL
)
UPDATE dipgos.rcc_alarm_events al
SET activity_id = c.activity_id
FROM candidate c
WHERE al.id = c.alarm_id
  AND c.activity_id IS NOT NULL;
