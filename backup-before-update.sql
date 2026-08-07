PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  anon_key      TEXT UNIQUE,                 -- hashed client-generated key, optional
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE incident_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT NOT NULL UNIQUE,        -- e.g. 'verbal_harassment'
  label_en      TEXT NOT NULL,
  label_ar      TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,  -- 0/1
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "incident_types" ("id","key","label_en","label_ar","active","sort_order","created_at") VALUES(1,'verbal_harassment','Verbal harassment','تحرش لفظي',1,1,'2026-08-05 08:52:29');
INSERT INTO "incident_types" ("id","key","label_en","label_ar","active","sort_order","created_at") VALUES(2,'stalking','Stalking / following','تعقّب / ملاحقة',1,2,'2026-08-05 08:52:29');
INSERT INTO "incident_types" ("id","key","label_en","label_ar","active","sort_order","created_at") VALUES(3,'physical','Physical contact','تلامس جسدي',1,3,'2026-08-05 08:52:29');
INSERT INTO "incident_types" ("id","key","label_en","label_ar","active","sort_order","created_at") VALUES(4,'catcalling','Catcalling','مضايقات في الشارع',1,4,'2026-08-05 08:52:29');
INSERT INTO "incident_types" ("id","key","label_en","label_ar","active","sort_order","created_at") VALUES(5,'online','Online harassment','تحرش إلكتروني',1,5,'2026-08-05 08:52:29');
INSERT INTO "incident_types" ("id","key","label_en","label_ar","active","sort_order","created_at") VALUES(6,'unsafe_area','Unsafe area / poor lighting','منطقة غير آمنة / إضاءة ضعيفة',1,6,'2026-08-05 08:52:29');
INSERT INTO "incident_types" ("id","key","label_en","label_ar","active","sort_order","created_at") VALUES(7,'other','Other','أخرى',1,7,'2026-08-05 08:52:29');
CREATE TABLE locations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  city          TEXT NOT NULL,
  region        TEXT,
  country       TEXT,
  latitude      REAL NOT NULL,
  longitude     REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_type   TEXT NOT NULL REFERENCES incident_types(key),
  description     TEXT,                       -- free text, max 2000 chars, sanitized
  latitude        REAL,
  longitude       REAL,
  city            TEXT,
  country         TEXT,
  incident_date   TEXT,                        -- ISO date, optional
  incident_time   TEXT,                         -- HH:MM, optional
  anonymous       INTEGER NOT NULL DEFAULT 1,   -- always 1 in current product; reserved for future
  status          TEXT NOT NULL DEFAULT 'visible', -- 'visible' | 'hidden' (spam/removed)
  ip_hash         TEXT,                         -- SHA-256 of submitting IP, for rate-limit/anti-spam ONLY
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "reports" ("id","incident_type","description","latitude","longitude","city","country","incident_date","incident_time","anonymous","status","ip_hash","created_at") VALUES(4,'physical','',30.311629210176704,31.374635696411136,'','Egypt','2026-08-06','18:36',1,'visible','76cfb878aca8bb42a1e27f200783efd194f1e235eefd89c7bbf0ba7236f0b6dc','2026-08-06 05:37:16');
INSERT INTO "reports" ("id","incident_type","description","latitude","longitude","city","country","incident_date","incident_time","anonymous","status","ip_hash","created_at") VALUES(6,'verbal_harassment','شباب قلالات الادب قالولي كلام عيب',31.412018211952006,31.811664582429337,'ميدان سرور','Egypt',NULL,NULL,1,'visible','71645b10a87de52efae157513c17d893d4b0cf1118fabfefdd0ce3f46bd660ae','2026-08-06 17:14:26');
CREATE TABLE evidence_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id     INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('image','video','audio')),
  google_drive_url TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE statistics (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date   TEXT NOT NULL,
  total_reports   INTEGER NOT NULL DEFAULT 0,
  total_areas     INTEGER NOT NULL DEFAULT 0,
  total_countries INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE admin_users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "admin_users" ("id","username","password_hash","password_salt","created_at") VALUES(1,'admin','17ca51778c12807511ef6b672743630bb8e484bffb6fab479307666b44aaf960','fcc3746c-83ad-4e2c-b88b-b94907156188','2026-08-05 09:32:06');
CREATE TABLE settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "settings" ("key","value","updated_at") VALUES('rate_limit_per_hour','5','2026-08-05 08:52:29');
INSERT INTO "settings" ("key","value","updated_at") VALUES('service_country','Egypt','2026-08-05 08:52:29');
INSERT INTO "settings" ("key","value","updated_at") VALUES('map_default_center_lat','26.8','2026-08-05 08:52:29');
INSERT INTO "settings" ("key","value","updated_at") VALUES('map_default_center_lng','30.8','2026-08-05 08:52:29');
INSERT INTO "settings" ("key","value","updated_at") VALUES('map_default_zoom','6','2026-08-05 08:52:29');
CREATE TABLE rate_limits (
  ip_hash       TEXT NOT NULL,
  bucket        TEXT NOT NULL,  -- e.g. '2026-08-05T14' (hour bucket)
  count         INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, bucket)
);
INSERT INTO "rate_limits" ("ip_hash","bucket","count") VALUES('c0f5d3aa79f52f54cefd0900647ee0b5062f76c11564a9f7876bae93c947e25f','2026-08-05T10',3);
INSERT INTO "rate_limits" ("ip_hash","bucket","count") VALUES('76cfb878aca8bb42a1e27f200783efd194f1e235eefd89c7bbf0ba7236f0b6dc','2026-08-06T05',1);
INSERT INTO "rate_limits" ("ip_hash","bucket","count") VALUES('76cfb878aca8bb42a1e27f200783efd194f1e235eefd89c7bbf0ba7236f0b6dc','2026-08-06T13',1);
INSERT INTO "rate_limits" ("ip_hash","bucket","count") VALUES('71645b10a87de52efae157513c17d893d4b0cf1118fabfefdd0ce3f46bd660ae','2026-08-06T17',1);
CREATE TABLE safe_places (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN (
                  'police', 'hospital', 'pharmacy', 'safe_shop',
                  'university', 'security_point', 'trusted_place'
                )),
  description   TEXT,
  latitude      REAL NOT NULL,
  longitude     REAL NOT NULL,
  opening_hours TEXT,
  phone_number  TEXT,
  image_url     TEXT,
  safety_notes  TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    INTEGER REFERENCES admin_users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "safe_places" ("id","name","category","description","latitude","longitude","opening_hours","phone_number","image_url","safety_notes","active","created_by","created_at","updated_at") VALUES(1,'مستشفي راس البر','hospital','مستشفي في راس البر  في شارع المديريه',31.515909,31.835712,'24','','','لو فيه خطر عليكي من شخص، الأحسن انك تبلغي الشرطة علي رقم ١٢٢ أو تصلي علي سخص آمن زي اهلك او صحابك',1,1,'2026-08-06 11:44:19','2026-08-06 11:44:19');
CREATE TABLE street_ratings (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  street_key          TEXT NOT NULL,   -- rounded "lat,lng" bucket, e.g. "30.06,31.24"
  latitude            REAL NOT NULL,
  longitude           REAL NOT NULL,
  city                TEXT,
  lighting            INTEGER NOT NULL CHECK (lighting BETWEEN 1 AND 5),
  crowd_level         INTEGER NOT NULL CHECK (crowd_level BETWEEN 1 AND 5),
  security_presence   INTEGER NOT NULL CHECK (security_presence BETWEEN 1 AND 5),
  camera_coverage     INTEGER NOT NULL CHECK (camera_coverage BETWEEN 1 AND 5),
  public_transport    INTEGER NOT NULL CHECK (public_transport BETWEEN 1 AND 5),
  general_feeling     INTEGER NOT NULL CHECK (general_feeling BETWEEN 1 AND 5),
  comment             TEXT,
  status              TEXT NOT NULL DEFAULT 'visible', -- 'visible' | 'hidden' (admin-removed)
  ip_hash             TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "street_ratings" ("id","street_key","latitude","longitude","city","lighting","crowd_level","security_presence","camera_coverage","public_transport","general_feeling","comment","status","ip_hash","created_at") VALUES(1,'31.521,31.837',31.52055267790464,31.837073435008897,'',4,5,3,5,2,3,'توخي الحظر لأنه يبيقي زحمة اوي اوي علي البنات','visible','c0f5d3aa79f52f54cefd0900647ee0b5062f76c11564a9f7876bae93c947e25f','2026-08-06 01:22:48');
CREATE TABLE community_alerts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  area_key        TEXT NOT NULL,   -- rounded "lat,lng" bucket
  latitude        REAL NOT NULL,
  longitude       REAL NOT NULL,
  city            TEXT,
  report_count    INTEGER NOT NULL,
  window_days     INTEGER NOT NULL DEFAULT 7,
  severity        TEXT NOT NULL DEFAULT 'notice', -- 'notice' | 'elevated'
  generated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE safe_routes_cache (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key     TEXT NOT NULL UNIQUE, -- hash of start/end/mode
  start_lat     REAL NOT NULL,
  start_lng     REAL NOT NULL,
  end_lat       REAL NOT NULL,
  end_lng       REAL NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('shortest','safer')),
  route_json    TEXT NOT NULL, -- serialized route + safety metadata
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO "safe_routes_cache" ("id","cache_key","start_lat","start_lng","end_lat","end_lng","mode","route_json","created_at") VALUES(1,'3cd226df03d1039cc392f21a7d912a34d87080d2b8930a4f4ed3248311a35aa4',31.521794297043698,31.841153000659467,31.515453064167826,31.83252286389901,'safer','{"mode":"safer","distance_meters":1340,"duration_seconds":142,"geometry":{"coordinates":[[31.841131,31.521757],[31.840907,31.521851],[31.840628,31.521968],[31.840356,31.522082],[31.840171,31.521747],[31.839938,31.521843],[31.839878,31.521871],[31.839587,31.521997],[31.839366,31.522105],[31.839339,31.522123],[31.839308,31.522136],[31.839274,31.522142],[31.83924,31.522143],[31.8392,31.522136],[31.839164,31.522121],[31.837822,31.521186],[31.837772,31.521152],[31.837725,31.521113],[31.837686,31.521074],[31.837651,31.521031],[31.83757,31.52088],[31.837541,31.520843],[31.837505,31.520811],[31.837466,31.520788],[31.837423,31.520771],[31.837407,31.520788],[31.837387,31.5208],[31.837358,31.520808],[31.837328,31.520809],[31.837299,31.520803],[31.837243,31.520773],[31.837196,31.520727],[31.837135,31.520654],[31.837039,31.520492],[31.836905,31.520256],[31.836815,31.520098],[31.836777,31.520032],[31.836562,31.51966],[31.836422,31.519427],[31.836303,31.519218],[31.836015,31.51872],[31.835797,31.518344],[31.835678,31.518124],[31.835544,31.517877],[31.83541,31.517631],[31.835331,31.517486],[31.835285,31.517406],[31.835139,31.517157],[31.835077,31.517036],[31.835012,31.516926],[31.834798,31.516552],[31.834614,31.516214],[31.83455,31.516099],[31.834492,31.515997],[31.83433,31.5157],[31.83416,31.515409],[31.834029,31.515166],[31.833956,31.515033],[31.833892,31.514925],[31.833585,31.515051],[31.833302,31.515167],[31.833018,31.515284],[31.83273,31.515402],[31.832539,31.515481]],"type":"LineString"},"safety":{"score":67,"samples":13,"rated_samples":2,"report_penalty":0},"alternatives_considered":1}','2026-08-06 01:23:57');
INSERT INTO "safe_routes_cache" ("id","cache_key","start_lat","start_lng","end_lat","end_lng","mode","route_json","created_at") VALUES(2,'f954cd43fc8ecfb1d8e19d736b7f3d55142bc2bfe303869ea531ea4214df84b9',31.52282922782022,31.841414180888634,31.511865036255138,31.830613062227716,'safer','{"mode":"safer","distance_meters":1995,"duration_seconds":187,"geometry":{"coordinates":[[31.841436,31.52282],[31.841268,31.522513],[31.841088,31.522182],[31.840907,31.521851],[31.840724,31.521513],[31.840456,31.521626],[31.840171,31.521747],[31.839938,31.521843],[31.839878,31.521871],[31.839587,31.521997],[31.839366,31.522105],[31.839339,31.522123],[31.839308,31.522136],[31.839274,31.522142],[31.83924,31.522143],[31.8392,31.522136],[31.839164,31.522121],[31.837822,31.521186],[31.837772,31.521152],[31.837725,31.521113],[31.837686,31.521074],[31.837651,31.521031],[31.83757,31.52088],[31.837541,31.520843],[31.837505,31.520811],[31.837466,31.520788],[31.837423,31.520771],[31.837407,31.520788],[31.837387,31.5208],[31.837358,31.520808],[31.837328,31.520809],[31.837299,31.520803],[31.837243,31.520773],[31.837196,31.520727],[31.837135,31.520654],[31.837039,31.520492],[31.836905,31.520256],[31.836815,31.520098],[31.836777,31.520032],[31.836562,31.51966],[31.836422,31.519427],[31.836303,31.519218],[31.836015,31.51872],[31.835797,31.518344],[31.835678,31.518124],[31.835544,31.517877],[31.83541,31.517631],[31.835331,31.517486],[31.835285,31.517406],[31.835139,31.517157],[31.835077,31.517036],[31.835012,31.516926],[31.834798,31.516552],[31.834614,31.516214],[31.83455,31.516099],[31.834492,31.515997],[31.83433,31.5157],[31.83416,31.515409],[31.834029,31.515166],[31.833956,31.515033],[31.833892,31.514925],[31.833795,31.514741],[31.833755,31.514674],[31.8336,31.514415],[31.833555,31.514337],[31.833452,31.514184],[31.833387,31.514112],[31.833275,31.514015],[31.833207,31.513953],[31.833137,31.513861],[31.833088,31.51376],[31.833062,31.513674],[31.833051,31.51359],[31.833039,31.513513],[31.832985,31.51335],[31.832937,31.513245],[31.832862,31.513109],[31.832741,31.51288],[31.83262,31.512653],[31.832576,31.512567],[31.832496,31.512422],[31.832395,31.512233],[31.832048,31.511612],[31.831972,31.511479],[31.83193,31.511404],[31.831743,31.511044],[31.831436,31.511164],[31.831147,31.511278],[31.83086,31.511393],[31.830573,31.511508],[31.830283,31.511624],[31.830518,31.512051],[31.83068,31.511986]],"type":"LineString"},"safety":{"score":67,"samples":14,"rated_samples":1,"report_penalty":0},"alternatives_considered":1}','2026-08-06 19:22:30');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('incident_types',7);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('admin_users',1);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('reports',6);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('street_ratings',1);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('safe_routes_cache',2);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('safe_places',1);
CREATE INDEX idx_locations_coords ON locations (latitude, longitude);
CREATE INDEX idx_reports_created ON reports (created_at);
CREATE INDEX idx_reports_type ON reports (incident_type);
CREATE INDEX idx_reports_city ON reports (city);
CREATE INDEX idx_reports_status ON reports (status);
CREATE INDEX idx_evidence_report ON evidence_links (report_id);
CREATE UNIQUE INDEX idx_statistics_date ON statistics (snapshot_date);
CREATE INDEX idx_safe_places_category ON safe_places (category);
CREATE INDEX idx_safe_places_coords ON safe_places (latitude, longitude);
CREATE INDEX idx_safe_places_active ON safe_places (active);
CREATE INDEX idx_street_ratings_key ON street_ratings (street_key);
CREATE INDEX idx_street_ratings_status ON street_ratings (status);
CREATE INDEX idx_street_ratings_created ON street_ratings (created_at);
CREATE INDEX idx_street_ratings_spam_check ON street_ratings (street_key, ip_hash, created_at);
CREATE INDEX idx_alerts_area ON community_alerts (area_key);
CREATE INDEX idx_alerts_generated ON community_alerts (generated_at);
CREATE INDEX idx_routes_cache_created ON safe_routes_cache (created_at);
