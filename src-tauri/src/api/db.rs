use crate::api::models::{CategoryDto, ProjectDto, TaskDto, TodayTotals};
use chrono::{DateTime, Local, NaiveDate, SecondsFormat, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use std::path::Path;
use uuid::Uuid;

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "busy_timeout", 5000)?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        Ok(Self { conn })
    }

    // ---------------- Tasks ----------------

    pub fn active_task(&self) -> rusqlite::Result<Option<TaskRecord>> {
        self.conn
            .query_row(
                "SELECT id, name, project_id, category_id, billable, start_time, end_time, \
                 duration_seconds, status, created_at, updated_at \
                 FROM tasks \
                 WHERE status IN ('running','paused') \
                 ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, start_time ASC \
                 LIMIT 1",
                [],
                row_to_task,
            )
            .optional()
    }

    #[allow(dead_code)]
    pub fn find_task(&self, id: &str) -> rusqlite::Result<Option<TaskRecord>> {
        self.conn
            .query_row(
                "SELECT id, name, project_id, category_id, billable, start_time, end_time, \
                 duration_seconds, status, created_at, updated_at \
                 FROM tasks WHERE id = ?1",
                params![id],
                row_to_task,
            )
            .optional()
    }

    pub fn insert_task(&self, t: &TaskRecord) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO tasks (id, name, project_id, category_id, billable, start_time, \
             end_time, duration_seconds, status, sent_to_sheets, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11)",
            params![
                t.id,
                t.name,
                t.project_id,
                t.category_id,
                t.billable as i64,
                t.start_time,
                t.end_time,
                t.duration_seconds,
                t.status,
                t.created_at,
                t.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_task(&self, t: &TaskRecord) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE tasks SET name = ?1, project_id = ?2, category_id = ?3, billable = ?4, \
             start_time = ?5, end_time = ?6, duration_seconds = ?7, status = ?8, updated_at = ?9 \
             WHERE id = ?10",
            params![
                t.name,
                t.project_id,
                t.category_id,
                t.billable as i64,
                t.start_time,
                t.end_time,
                t.duration_seconds,
                t.status,
                t.updated_at,
                t.id,
            ],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Conclui qualquer tarefa ativa (running ou paused) com a duração efetiva até agora.
    pub fn complete_all_active(&self, now_iso: &str) -> rusqlite::Result<()> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, project_id, category_id, billable, start_time, end_time, \
             duration_seconds, status, created_at, updated_at \
             FROM tasks WHERE status IN ('running','paused')",
        )?;
        let tasks: Vec<TaskRecord> = stmt
            .query_map([], row_to_task)?
            .collect::<rusqlite::Result<_>>()?;

        for mut t in tasks {
            let duration = effective_duration(&t, now_iso);
            t.status = "completed".to_string();
            t.end_time = Some(now_iso.to_string());
            t.duration_seconds = Some(duration);
            t.updated_at = now_iso.to_string();
            self.update_task(&t)?;
        }
        Ok(())
    }

    /// Totais do dia atual (em fuso local).
    pub fn today_totals(&self) -> rusqlite::Result<TodayTotals> {
        let (start, end) = today_local_bounds_iso();
        let mut stmt = self.conn.prepare(
            "SELECT billable, duration_seconds, start_time, status \
             FROM tasks WHERE start_time >= ?1 AND start_time < ?2",
        )?;
        let rows = stmt.query_map(params![start, end], |r| {
            let billable: i64 = r.get(0)?;
            let duration: Option<i64> = r.get(1)?;
            let start_time: String = r.get(2)?;
            let status: String = r.get(3)?;
            Ok((billable == 1, duration, start_time, status))
        })?;

        let now_iso = now_iso_utc();
        let mut total = 0i64;
        let mut billable_sum = 0i64;
        let mut non_billable = 0i64;
        let mut count = 0i64;
        for r in rows {
            let (is_billable, duration, start, status) = r?;
            let secs = match status.as_str() {
                "running" => {
                    (duration.unwrap_or(0)).max(0)
                        + seconds_between(&start, &now_iso).max(0)
                }
                _ => duration.unwrap_or(0).max(0),
            };
            total += secs;
            if is_billable {
                billable_sum += secs;
            } else {
                non_billable += secs;
            }
            count += 1;
        }
        Ok(TodayTotals {
            total_seconds: total,
            billable_seconds: billable_sum,
            non_billable_seconds: non_billable,
            task_count: count,
        })
    }

    // ---------------- Projects ----------------

    pub fn list_projects(&self) -> rusqlite::Result<Vec<ProjectDto>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name FROM projects ORDER BY name ASC")?;
        let rows = stmt.query_map([], |r| {
            Ok(ProjectDto {
                id: r.get(0)?,
                name: r.get(1)?,
            })
        })?;
        rows.collect()
    }

    pub fn find_project_name(&self, id: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT name FROM projects WHERE id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .optional()
    }

    pub fn find_project_id_by_name(&self, name: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT id FROM projects WHERE name = ?1",
                params![name],
                |r| r.get::<_, String>(0),
            )
            .optional()
    }

    // ---------------- Categories ----------------

    pub fn list_categories(&self) -> rusqlite::Result<Vec<CategoryDto>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, default_billable FROM categories ORDER BY name ASC",
        )?;
        let rows = stmt.query_map([], |r| {
            let billable: i64 = r.get(2)?;
            Ok(CategoryDto {
                id: r.get(0)?,
                name: r.get(1)?,
                default_billable: billable == 1,
            })
        })?;
        rows.collect()
    }

    pub fn find_category_name(&self, id: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT name FROM categories WHERE id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            )
            .optional()
    }

    pub fn find_category_id_by_name(&self, name: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT id FROM categories WHERE name = ?1",
                params![name],
                |r| r.get::<_, String>(0),
            )
            .optional()
    }

    // ---------------- Config ----------------

    pub fn get_config_json(&self, key: &str) -> rusqlite::Result<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM config WHERE key = ?1",
                params![key],
                |r| r.get::<_, String>(0),
            )
            .optional()
    }
}

pub fn task_record_to_dto(task: &TaskRecord, project_name: Option<String>, category_name: Option<String>) -> TaskDto {
    let now_iso = now_iso_utc();
    let elapsed = match task.status.as_str() {
        "running" => {
            task.duration_seconds.unwrap_or(0).max(0)
                + seconds_between(&task.start_time, &now_iso).max(0)
        }
        _ => task.duration_seconds.unwrap_or(0).max(0),
    };
    TaskDto {
        id: task.id.clone(),
        name: task.name.clone(),
        project_id: task.project_id.clone(),
        project_name,
        category_id: task.category_id.clone(),
        category_name,
        billable: task.billable,
        status: task.status.clone(),
        start_time: task.start_time.clone(),
        end_time: task.end_time.clone(),
        duration_seconds: task.duration_seconds,
        elapsed_seconds: elapsed,
    }
}

#[derive(Debug, Clone)]
pub struct TaskRecord {
    pub id: String,
    pub name: Option<String>,
    pub project_id: Option<String>,
    pub category_id: Option<String>,
    pub billable: bool,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: Option<i64>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_task(r: &Row<'_>) -> rusqlite::Result<TaskRecord> {
    let billable: i64 = r.get(4)?;
    Ok(TaskRecord {
        id: r.get(0)?,
        name: r.get(1)?,
        project_id: r.get(2)?,
        category_id: r.get(3)?,
        billable: billable == 1,
        start_time: r.get(5)?,
        end_time: r.get(6)?,
        duration_seconds: r.get(7)?,
        status: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
    })
}

pub fn effective_duration(task: &TaskRecord, now_iso: &str) -> i64 {
    let acc = task.duration_seconds.unwrap_or(0).max(0);
    if task.status == "running" {
        acc + seconds_between(&task.start_time, now_iso).max(0)
    } else {
        acc
    }
}

pub fn seconds_between(earlier_iso: &str, later_iso: &str) -> i64 {
    let Ok(e) = DateTime::parse_from_rfc3339(earlier_iso) else { return 0 };
    let Ok(l) = DateTime::parse_from_rfc3339(later_iso) else { return 0 };
    (l.timestamp() - e.timestamp()).max(0)
}

pub fn now_iso_utc() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn new_uuid() -> String {
    Uuid::new_v4().to_string()
}

/// Retorna [inicio_do_dia_local_em_utc, inicio_do_proximo_dia_em_utc] como ISO.
/// Equivale a `new Date(local_date + "T00:00:00").toISOString()` do frontend.
fn today_local_bounds_iso() -> (String, String) {
    let now_local = Local::now();
    let start_local = Local
        .with_ymd_and_hms(now_local.year_naive(), now_local.month_naive(), now_local.day_naive(), 0, 0, 0)
        .single()
        .expect("valid local midnight");
    let end_local = start_local + chrono::Duration::days(1);
    (
        start_local
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true),
        end_local
            .with_timezone(&Utc)
            .to_rfc3339_opts(SecondsFormat::Millis, true),
    )
}

// Helpers para acessar componentes da data local sem dependência extra de chrono::Datelike.
trait DateLocalParts {
    fn year_naive(&self) -> i32;
    fn month_naive(&self) -> u32;
    fn day_naive(&self) -> u32;
}
impl DateLocalParts for DateTime<Local> {
    fn year_naive(&self) -> i32 {
        use chrono::Datelike;
        self.year()
    }
    fn month_naive(&self) -> u32 {
        use chrono::Datelike;
        self.month()
    }
    fn day_naive(&self) -> u32 {
        use chrono::Datelike;
        self.day()
    }
}

// ================================================================
// PlannedTask
// ================================================================

#[derive(Debug, Clone)]
pub struct PlannedTaskRecord {
    pub id: String,
    pub name: String,
    pub project_id: Option<String>,
    pub category_id: Option<String>,
    pub billable: bool,
    pub schedule_type: String,
    pub schedule_date: Option<String>,
    pub recurring_days: Option<String>, // JSON array string
    pub period_start: Option<String>,
    pub period_end: Option<String>,
    pub completed_dates: String, // JSON array string, default '[]'
    pub actions: String,         // JSON array string, default '[]'
    pub sort_order: i64,
    pub created_at: String,
}

const PLANNED_SELECT: &str =
    "SELECT id, name, project_id, category_id, billable, schedule_type, schedule_date, \
     recurring_days, period_start, period_end, completed_dates, actions, sort_order, created_at \
     FROM planned_tasks";

fn row_to_planned_task(r: &Row<'_>) -> rusqlite::Result<PlannedTaskRecord> {
    let billable: i64 = r.get(4)?;
    Ok(PlannedTaskRecord {
        id: r.get(0)?,
        name: r.get(1)?,
        project_id: r.get(2)?,
        category_id: r.get(3)?,
        billable: billable == 1,
        schedule_type: r.get(5)?,
        schedule_date: r.get(6)?,
        recurring_days: r.get(7)?,
        period_start: r.get(8)?,
        period_end: r.get(9)?,
        completed_dates: r.get(10)?,
        actions: r.get(11)?,
        sort_order: r.get(12)?,
        created_at: r.get(13)?,
    })
}

impl Db {
    // ---------------- PlannedTask ----------------

    pub fn list_planned_tasks(&self) -> rusqlite::Result<Vec<PlannedTaskRecord>> {
        let sql = format!("{} ORDER BY sort_order ASC, created_at ASC", PLANNED_SELECT);
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map([], row_to_planned_task)?;
        rows.collect()
    }

    pub fn list_planned_tasks_for_date(&self, date: &str) -> rusqlite::Result<Vec<PlannedTaskRecord>> {
        let weekday = NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .map(|d| {
                use chrono::Datelike;
                d.weekday().num_days_from_sunday()
            })
            .unwrap_or(7u32);

        let all = self.list_planned_tasks()?;
        let filtered = all
            .into_iter()
            .filter(|t| match t.schedule_type.as_str() {
                "specific_date" => t.schedule_date.as_deref() == Some(date),
                "period" => {
                    let start = t.period_start.as_deref().unwrap_or("");
                    let end = t.period_end.as_deref().unwrap_or("");
                    !start.is_empty() && !end.is_empty() && date >= start && date <= end
                }
                "recurring" => {
                    if let Some(ref days_json) = t.recurring_days {
                        if let Ok(days) = serde_json::from_str::<Vec<u32>>(days_json) {
                            return days.contains(&weekday);
                        }
                    }
                    false
                }
                _ => false,
            })
            .collect();
        Ok(filtered)
    }

    pub fn find_planned_task(&self, id: &str) -> rusqlite::Result<Option<PlannedTaskRecord>> {
        let sql = format!("{} WHERE id = ?1", PLANNED_SELECT);
        self.conn
            .query_row(&sql, params![id], row_to_planned_task)
            .optional()
    }

    pub fn insert_planned_task(&self, t: &PlannedTaskRecord) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO planned_tasks \
             (id, name, project_id, category_id, billable, schedule_type, schedule_date, \
              recurring_days, period_start, period_end, completed_dates, actions, sort_order, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                t.id,
                t.name,
                t.project_id,
                t.category_id,
                t.billable as i64,
                t.schedule_type,
                t.schedule_date,
                t.recurring_days,
                t.period_start,
                t.period_end,
                t.completed_dates,
                t.actions,
                t.sort_order,
                t.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_planned_task(&self, t: &PlannedTaskRecord) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE planned_tasks \
             SET name = ?1, project_id = ?2, category_id = ?3, billable = ?4, \
                 schedule_type = ?5, schedule_date = ?6, recurring_days = ?7, \
                 period_start = ?8, period_end = ?9, completed_dates = ?10, \
                 actions = ?11, sort_order = ?12 \
             WHERE id = ?13",
            params![
                t.name,
                t.project_id,
                t.category_id,
                t.billable as i64,
                t.schedule_type,
                t.schedule_date,
                t.recurring_days,
                t.period_start,
                t.period_end,
                t.completed_dates,
                t.actions,
                t.sort_order,
                t.id,
            ],
        )?;
        Ok(())
    }

    pub fn delete_planned_task(&self, id: &str) -> rusqlite::Result<()> {
        self.conn
            .execute("DELETE FROM planned_tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn max_planned_task_sort_order(&self) -> rusqlite::Result<i64> {
        self.conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM planned_tasks",
            [],
            |r| r.get::<_, i64>(0),
        )
    }

    pub fn complete_planned_task(&self, id: &str, date: &str) -> rusqlite::Result<bool> {
        let task = match self.find_planned_task(id)? {
            Some(t) => t,
            None => return Ok(false),
        };
        let mut dates: Vec<String> =
            serde_json::from_str(&task.completed_dates).unwrap_or_default();
        if !dates.contains(&date.to_string()) {
            dates.push(date.to_string());
            let json = serde_json::to_string(&dates).unwrap_or_else(|_| "[]".to_string());
            self.conn.execute(
                "UPDATE planned_tasks SET completed_dates = ?1 WHERE id = ?2",
                params![json, id],
            )?;
        }
        Ok(true)
    }

    pub fn uncomplete_planned_task(&self, id: &str, date: &str) -> rusqlite::Result<bool> {
        let task = match self.find_planned_task(id)? {
            Some(t) => t,
            None => return Ok(false),
        };
        let mut dates: Vec<String> =
            serde_json::from_str(&task.completed_dates).unwrap_or_default();
        dates.retain(|d| d != date);
        let json = serde_json::to_string(&dates).unwrap_or_else(|_| "[]".to_string());
        self.conn.execute(
            "UPDATE planned_tasks SET completed_dates = ?1 WHERE id = ?2",
            params![json, id],
        )?;
        Ok(true)
    }
}
