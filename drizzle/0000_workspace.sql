CREATE TABLE workspace (id INTEGER PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE members (email TEXT PRIMARY KEY, role TEXT NOT NULL, team TEXT NOT NULL, name TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, operation TEXT NOT NULL, details TEXT NOT NULL, at TEXT NOT NULL);
