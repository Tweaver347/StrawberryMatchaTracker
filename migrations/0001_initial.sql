PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  google_sub TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  owner_sub TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_picture TEXT,
  place_name TEXT NOT NULL,
  location_label TEXT,
  latitude REAL,
  longitude REAL,
  location_source TEXT,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  vibe INTEGER NOT NULL CHECK (vibe BETWEEN 1 AND 5),
  price_cents INTEGER,
  drink_size TEXT,
  milk_type TEXT,
  sweetness TEXT,
  visit_date TEXT,
  wait_minutes INTEGER,
  add_ons TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  would_order_again INTEGER NOT NULL DEFAULT 0 CHECK (would_order_again IN (0, 1)),
  share_community INTEGER NOT NULL DEFAULT 0 CHECK (share_community IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_sub) REFERENCES users(google_sub) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  user_sub TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_sub, entry_id),
  FOREIGN KEY (user_sub) REFERENCES users(google_sub) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS entries_owner_sub_idx ON entries(owner_sub);
CREATE INDEX IF NOT EXISTS entries_share_community_idx ON entries(share_community, created_at DESC);
CREATE INDEX IF NOT EXISTS entries_location_idx ON entries(latitude, longitude);
CREATE INDEX IF NOT EXISTS favorites_user_sub_idx ON favorites(user_sub);
