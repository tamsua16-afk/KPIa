ALTER TABLE members ADD COLUMN password_hash TEXT;
--> statement-breakpoint
ALTER TABLE members ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE members ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE members ADD COLUMN scope_level TEXT NOT NULL DEFAULT 'personal';
--> statement-breakpoint
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX sessions_email ON sessions(email);
--> statement-breakpoint
CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
