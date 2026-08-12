use tauri_plugin_sql::{Migration, MigrationKind};

pub fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "initial_schema",
            sql: include_str!("../migrations/001_initial_schema.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "tasks",
            sql: include_str!("../migrations/002_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "planned_tasks",
            sql: include_str!("../migrations/003_planned_tasks.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "export_profiles",
            sql: include_str!("../migrations/004_export_profiles.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "config",
            sql: include_str!("../migrations/005_config.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "task_sheets_sent",
            sql: include_str!("../migrations/006_task_sheets_sent.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "task_integration_log",
            sql: include_str!("../migrations/007_task_integration_log.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "planned_tasks_times",
            sql: include_str!("../migrations/008_planned_tasks_times.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "calendar_tracked_meetings",
            sql: include_str!("../migrations/009_calendar_tracked_meetings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "monday_activity_items",
            sql: include_str!("../migrations/010_monday_activity_items.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "workspaces",
            sql: include_str!("../migrations/011_workspaces.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "custom_fields",
            sql: include_str!("../migrations/012_custom_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "monday_imported_items",
            sql: include_str!("../migrations/013_monday_imported_items.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "calendar_meeting_planned_link",
            sql: include_str!("../migrations/014_calendar_meeting_planned_link.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "task_planned_link",
            sql: include_str!("../migrations/015_task_planned_link.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "project_categories",
            sql: include_str!("../migrations/016_project_categories.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "project_color_index",
            sql: include_str!("../migrations/017_project_color_index.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
