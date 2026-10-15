import Database from 'better-sqlite3'

const MIGRATIONS: string[] = [
  `CREATE TABLE games (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     folder          TEXT NOT NULL UNIQUE,
     title           TEXT NOT NULL,
     exe_path        TEXT,
     exe_override    TEXT,
     cover_path      TEXT,
     added_at        INTEGER NOT NULL,
     last_played_at  INTEGER,
     total_seconds   INTEGER NOT NULL DEFAULT 0,
     hidden          INTEGER NOT NULL DEFAULT 0,
     input_mode      TEXT NOT NULL DEFAULT 'auto'
   );
   CREATE TABLE sessions (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     game_id     INTEGER NOT NULL REFERENCES games(id),
     started_at  INTEGER NOT NULL,
     ended_at    INTEGER,
     seconds     INTEGER
   );
   CREATE INDEX sessions_game ON sessions(game_id);
   CREATE TABLE input_profiles (
     game_id  INTEGER PRIMARY KEY REFERENCES games(id),
     json     TEXT NOT NULL
   );`,
  // v2: catalog games (folder NULL = not installed) + IGDB metadata.
  `CREATE TABLE games_v2 (
     id              INTEGER PRIMARY KEY AUTOINCREMENT,
     folder          TEXT UNIQUE,
     title           TEXT NOT NULL,
     exe_path        TEXT,
     exe_override    TEXT,
     cover_path      TEXT,
     art_path        TEXT,
     igdb_id         INTEGER UNIQUE,
     summary         TEXT,
     release_year    INTEGER,
     genres          TEXT NOT NULL DEFAULT '[]',
     added_at        INTEGER NOT NULL,
     last_played_at  INTEGER,
     total_seconds   INTEGER NOT NULL DEFAULT 0,
     hidden          INTEGER NOT NULL DEFAULT 0,
     input_mode      TEXT NOT NULL DEFAULT 'auto'
   );
   INSERT INTO games_v2 (id, folder, title, exe_path, exe_override, cover_path, added_at,
                         last_played_at, total_seconds, hidden, input_mode)
     SELECT id, folder, title, exe_path, exe_override, cover_path, added_at,
            last_played_at, total_seconds, hidden, input_mode FROM games;
   DROP TABLE games;
   ALTER TABLE games_v2 RENAME TO games;`,
  // v3: full release date (ms) for the "Aguardados" shelf.
  `ALTER TABLE games ADD COLUMN release_date INTEGER;`,
  // v4: games owned by Steam/Epic (launched through the platform).
  `ALTER TABLE games ADD COLUMN source TEXT NOT NULL DEFAULT 'folder';
   ALTER TABLE games ADD COLUMN external_id TEXT;
   ALTER TABLE games ADD COLUMN launch_uri TEXT;
   CREATE UNIQUE INDEX games_external ON games(source, external_id) WHERE external_id IS NOT NULL;`,
  // v5: repacks that still have to be installed (setup.exe in the folder).
  `ALTER TABLE games ADD COLUMN installer_path TEXT;`,
  // v6: emulated games (source 'emulator') and their system.
  `ALTER TABLE games ADD COLUMN platform TEXT;`
]

export function openDb(file: string): Database.Database {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  // FKs off while migrating: table rebuilds drop tables that sessions reference.
  db.pragma('foreign_keys = OFF')
  const version = db.pragma('user_version', { simple: true }) as number
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
  db.pragma('foreign_keys = ON')
  return db
}
