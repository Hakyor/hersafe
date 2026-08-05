-- HerSafe seed data

INSERT OR IGNORE INTO incident_types (key, label_en, label_ar, sort_order) VALUES
  ('verbal_harassment', 'Verbal harassment', 'تحرش لفظي', 1),
  ('stalking',          'Stalking / following', 'تعقّب / ملاحقة', 2),
  ('physical',          'Physical contact', 'تلامس جسدي', 3),
  ('catcalling',        'Catcalling', 'مضايقات في الشارع', 4),
  ('online',            'Online harassment', 'تحرش إلكتروني', 5),
  ('unsafe_area',       'Unsafe area / poor lighting', 'منطقة غير آمنة / إضاءة ضعيفة', 6),
  ('other',             'Other', 'أخرى', 7);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('rate_limit_per_hour', '5'),
  ('service_country', 'Egypt'),
  ('map_default_center_lat', '26.8'),
  ('map_default_center_lng', '30.8'),
  ('map_default_zoom', '6');

-- NOTE: Do not seed admin_users here with a plaintext password.
-- Create your admin account with the helper script described in the
-- README ("Cloudflare D1 setup" section), which hashes the password
-- client-side before generating the INSERT statement.
