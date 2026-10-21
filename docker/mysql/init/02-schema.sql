USE twinklerp;

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  character1 BIGINT NOT NULL DEFAULT 0,
  character2 BIGINT NOT NULL DEFAULT -1,
  character3 BIGINT NOT NULL DEFAULT -1,
  donate INT NOT NULL DEFAULT 0,
  social_club VARCHAR(128) NOT NULL,
  social_club_id VARCHAR(128) NULL,
  RegHwid VARCHAR(255) NULL,
  LastHwid VARCHAR(255) NULL,
  RegIP VARCHAR(100) NULL,
  LastIp VARCHAR(100) NULL,
  reg_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  LastLogin DATETIME NULL,
  remember_me TINYINT(1) NOT NULL DEFAULT 0,
  promocode VARCHAR(50) NULL,
  whitelist TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_login (login),
  UNIQUE KEY uq_accounts_email (email),
  UNIQUE KEY uq_accounts_social_club (social_club),
  KEY idx_accounts_hwid (RegHwid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS characters (
  uuid BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(32) NOT NULL,
  lastname VARCHAR(32) NOT NULL,
  gender ENUM('male','female') NOT NULL DEFAULT 'male',
  age TINYINT UNSIGNED NOT NULL DEFAULT 18,
  admin_level INT NOT NULL DEFAULT 0,
  vip_type VARCHAR(32) NOT NULL DEFAULT 'none',
  vip_until DATETIME NULL,
  cash BIGINT NOT NULL DEFAULT 0,
  bank BIGINT NOT NULL DEFAULT 0,
  tcoin BIGINT NOT NULL DEFAULT 0,
  position JSON NULL,
  health FLOAT NOT NULL DEFAULT 100,
  armor FLOAT NOT NULL DEFAULT 0,
  xp INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  fraction_id INT NOT NULL DEFAULT 0,
  fraction_rank INT NOT NULL DEFAULT 0,
  promo_code VARCHAR(50) NULL,
  promo_rewarded TINYINT(1) NOT NULL DEFAULT 0,
  customization JSON NULL,
  clothes JSON NULL,
  appearance JSON NULL,
  avatar VARCHAR(255) NULL,
  avatar_dirty TINYINT(1) NOT NULL DEFAULT 0,
  avatar_updated_at DATETIME NULL,
  has_fraction TINYINT(1) NOT NULL DEFAULT 0,
  has_admin_profile TINYINT(1) NOT NULL DEFAULT 0,
  create_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_play DATETIME NULL,
  online_today_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  online_month_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  online_total_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
  online_stat_date DATE NULL,
  online_stat_month CHAR(7) NULL,
  online_reward_claimed_date DATE NULL,
  PRIMARY KEY (uuid),
  KEY idx_characters_account (account_id),
  KEY idx_characters_fraction (fraction_id),
  CONSTRAINT fk_characters_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_recovery_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  code VARCHAR(16) NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_recovery_email_code (email, code),
  CONSTRAINT fk_recovery_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS promo_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL,
  type VARCHAR(64) NOT NULL DEFAULT 'default',
  owner_character_uuid BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  rewarded_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_promo_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hwid_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  old_hwid VARCHAR(255) NULL,
  new_hwid VARCHAR(255) NULL,
  ip VARCHAR(100) NULL,
  date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hwid_account (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NULL,
  character_uuid BIGINT UNSIGNED NULL,
  social_club VARCHAR(128) NULL,
  social_club_id VARCHAR(128) NULL,
  hwid VARCHAR(255) NULL,
  ip VARCHAR(100) NULL,
  ban_type VARCHAR(32) NOT NULL DEFAULT 'character',
  reason VARCHAR(255) NULL,
  admin VARCHAR(128) NULL,
  date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unban_date DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_bans_account (account_id),
  KEY idx_bans_character (character_uuid),
  KEY idx_bans_hwid (hwid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mutes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uuid BIGINT UNSIGNED NOT NULL,
  admin_uuid BIGINT UNSIGNED NULL,
  reason VARCHAR(255) NULL,
  remaining_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mutes_uuid (uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS houses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 0,
  z FLOAT NOT NULL DEFAULT 0,
  price BIGINT NOT NULL DEFAULT 0,
  owner BIGINT UNSIGNED NULL,
  dimension INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_houses_owner (owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS apartments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  x FLOAT NOT NULL DEFAULT 0,
  y FLOAT NOT NULL DEFAULT 0,
  z FLOAT NOT NULL DEFAULT 0,
  dimension INT UNSIGNED NOT NULL DEFAULT 0,
  owner BIGINT UNSIGNED NULL,
  owner_uuid BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY idx_apartments_owner (owner_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fractions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fraction_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  short_name VARCHAR(32) NOT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'state',
  leader_uuid BIGINT UNSIGNED NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  spawn_points JSON NULL,
  locker_marker JSON NULL,
  settings JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  spawn_x FLOAT NULL,
  spawn_y FLOAT NULL,
  spawn_z FLOAT NULL,
  spawn_h FLOAT NULL,
  spawn_dimension INT NOT NULL DEFAULT 0,
  color_hex VARCHAR(16) NULL,
  rage_color INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fractions_fraction_id (fraction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fraction_ranks (
  rank_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fraction_id INT NOT NULL,
  rank_index INT NOT NULL,
  rank_name VARCHAR(128) NOT NULL,
  salary BIGINT NOT NULL DEFAULT 0,
  permissions JSON NULL,
  is_leader TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rank_id),
  UNIQUE KEY uq_fraction_rank (fraction_id, rank_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fraction_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fraction_id INT NOT NULL,
  character_uuid BIGINT UNSIGNED NOT NULL,
  rank_index INT NOT NULL DEFAULT 1,
  division VARCHAR(64) NULL,
  invited_by_uuid BIGINT UNSIGNED NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  warn_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_seen_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fraction_character (character_uuid),
  KEY idx_fraction_members_fraction (fraction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS character_inventories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  static_id BIGINT UNSIGNED NOT NULL,
  inventory JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_static_id (static_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS character_job_skills (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  character_uuid BIGINT UNSIGNED NOT NULL,
  job_id VARCHAR(64) NOT NULL,
  level INT UNSIGNED NOT NULL DEFAULT 1,
  exp INT UNSIGNED NOT NULL DEFAULT 0,
  completed_tasks INT UNSIGNED NOT NULL DEFAULT 0,
  total_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_character_job (character_uuid, job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_id BIGINT UNSIGNED NOT NULL,
  player_name VARCHAR(128) NOT NULL,
  question TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  admin_id BIGINT UNSIGNED NULL,
  admin_name VARCHAR(128) NULL,
  answer_seconds INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_reports_status (status),
  KEY idx_reports_player (player_id),
  KEY idx_reports_admin (admin_id),
  KEY idx_reports_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NULL,
  admin_id BIGINT UNSIGNED NULL,
  author_name VARCHAR(128) NOT NULL,
  role VARCHAR(32) NOT NULL,
  action_type VARCHAR(64) NULL,
  text TEXT NOT NULL,
  answer_seconds INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_report_messages_report (report_id),
  KEY idx_report_messages_created (created_at),
  CONSTRAINT fk_report_messages_report FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner BIGINT UNSIGNED NULL,
  model VARCHAR(100) NOT NULL,
  pos_x FLOAT NOT NULL DEFAULT 0,
  pos_y FLOAT NOT NULL DEFAULT 0,
  pos_z FLOAT NOT NULL DEFAULT 0,
  heading FLOAT NOT NULL DEFAULT 0,
  dimension INT NOT NULL DEFAULT 0,
  fuel FLOAT NOT NULL DEFAULT 100,
  mileage FLOAT NOT NULL DEFAULT 0,
  locked TINYINT(1) NOT NULL DEFAULT 1,
  engine TINYINT(1) NOT NULL DEFAULT 0,
  health FLOAT NOT NULL DEFAULT 1000,
  plate VARCHAR(16) NULL,
  color1 INT NOT NULL DEFAULT 0,
  color2 INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vehicles_owner (owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

USE twinklelogs;

CREATE TABLE IF NOT EXISTS server_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type VARCHAR(64) NOT NULL DEFAULT 'system',
  level VARCHAR(32) NOT NULL DEFAULT 'info',
  player_uuid BIGINT NULL,
  player_name VARCHAR(128) NULL,
  message TEXT NOT NULL,
  data JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_server_logs_type (type),
  KEY idx_server_logs_level (level),
  KEY idx_server_logs_player (player_uuid),
  KEY idx_server_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

USE twinklerp;

CREATE TABLE IF NOT EXISTS character_jobs (
  character_uuid BIGINT UNSIGNED NOT NULL,
  job_id VARCHAR(32) NOT NULL,
  hired_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (character_uuid),
  KEY idx_character_jobs_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cargo_loader_deliveries (
  cargo_id VARCHAR(64) NOT NULL,
  character_uuid BIGINT NOT NULL,
  job_id VARCHAR(32) NOT NULL,
  site_id VARCHAR(32) NOT NULL,
  source_id VARCHAR(48) NOT NULL,
  destination_id VARCHAR(48) NOT NULL,
  distance_m INT UNSIGNED NOT NULL DEFAULT 0,
  payout INT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cargo_id),
  KEY idx_cargo_loader_character (character_uuid, completed_at),
  KEY idx_cargo_loader_job (job_id, completed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS character_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  static_id BIGINT UNSIGNED NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  document_number VARCHAR(48) NOT NULL,
  issuer_static_id BIGINT UNSIGNED NULL,
  issuer_name VARCHAR(128) NULL,
  payload LONGTEXT NOT NULL,
  issued_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_character_documents_active_slot (static_id, document_type),
  KEY idx_character_documents_number (document_number),
  KEY idx_character_documents_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS character_licenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  static_id BIGINT UNSIGNED NOT NULL,
  license_id VARCHAR(64) NOT NULL,
  license_label VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  issued_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  document_number VARCHAR(48) NOT NULL,
  data LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_character_licenses_static_license (static_id, license_id),
  KEY idx_character_licenses_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trucker_profiles (
  character_uuid BIGINT UNSIGNED NOT NULL,
  xp INT UNSIGNED NOT NULL DEFAULT 0,
  rank_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
  skill_points INT UNSIGNED NOT NULL DEFAULT 0,
  skill_progress INT UNSIGNED NOT NULL DEFAULT 0,
  completed_orders INT UNSIGNED NOT NULL DEFAULT 0,
  failed_orders INT UNSIGNED NOT NULL DEFAULT 0,
  on_time_orders INT UNSIGNED NOT NULL DEFAULT 0,
  late_orders INT UNSIGNED NOT NULL DEFAULT 0,
  total_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_distance_m BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_fuel_used DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (character_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trucker_skill_unlocks (
  character_uuid BIGINT UNSIGNED NOT NULL,
  skill_id VARCHAR(64) NOT NULL,
  spent_points INT UNSIGNED NOT NULL,
  unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (character_uuid, skill_id),
  KEY idx_trucker_skill_id (skill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trucker_rentals (
  lease_id VARCHAR(48) NOT NULL,
  character_uuid BIGINT UNSIGNED NOT NULL,
  vehicle_config_id VARCHAR(64) NOT NULL,
  vehicle_model VARCHAR(64) NOT NULL,
  vehicle_type ENUM('pickup','van','truck') NOT NULL,
  trailer_model VARCHAR(64) NULL,
  rent_price INT UNSIGNED NOT NULL,
  orders_remaining TINYINT UNSIGNED NOT NULL,
  last_consumed_order_id VARCHAR(64) NULL,
  status ENUM('active','ended','expired','destroyed') NOT NULL DEFAULT 'active',
  claimed_at DATETIME NULL,
  active_character_uuid BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN character_uuid ELSE NULL END) STORED,
  end_reason VARCHAR(96) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (lease_id),
  UNIQUE KEY uq_trucker_rentals_one_active (active_character_uuid),
  KEY idx_trucker_rentals_character (character_uuid, status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trucker_orders (
  order_id VARCHAR(64) NOT NULL,
  refresh_bucket BIGINT UNSIGNED NOT NULL,
  slot_index TINYINT UNSIGNED NOT NULL,
  template_id VARCHAR(32) NOT NULL,
  status ENUM('available','accepted','delivered','expired','failed') NOT NULL DEFAULT 'available',
  cargo VARCHAR(128) NOT NULL,
  company VARCHAR(128) NOT NULL,
  cargo_kind VARCHAR(32) NOT NULL,
  vehicle_type ENUM('pickup','van','truck') NOT NULL,
  required_license VARCHAR(32) NOT NULL,
  required_rank TINYINT UNSIGNED NOT NULL,
  required_skill VARCHAR(64) NULL,
  trailer_model VARCHAR(64) NULL,
  trailer_livery INT NULL,
  trailer_color1 INT NULL,
  trailer_color2 INT NULL,
  weight_kg INT UNSIGNED NOT NULL,
  origin_x DOUBLE NOT NULL,
  origin_y DOUBLE NOT NULL,
  origin_z DOUBLE NOT NULL,
  origin_heading FLOAT NOT NULL DEFAULT 0,
  destination_x DOUBLE NOT NULL,
  destination_y DOUBLE NOT NULL,
  destination_z DOUBLE NOT NULL,
  destination_heading FLOAT NOT NULL DEFAULT 0,
  route_distance_m INT UNSIGNED NOT NULL,
  time_limit_seconds INT UNSIGNED NOT NULL,
  base_pay INT UNSIGNED NOT NULL,
  accepted_by BIGINT UNSIGNED NULL,
  accepted_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  UNIQUE KEY uq_trucker_rotation_slot (refresh_bucket, slot_index),
  KEY idx_trucker_orders_pool (refresh_bucket, status, expires_at),
  KEY idx_trucker_orders_acceptor (accepted_by, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trucker_active_deliveries (
  character_uuid BIGINT UNSIGNED NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  lease_id VARCHAR(48) NOT NULL,
  vehicle_runtime_id INT NULL,
  vehicle_config_id VARCHAR(64) NOT NULL,
  vehicle_model VARCHAR(64) NOT NULL,
  vehicle_type ENUM('pickup','van','truck') NOT NULL,
  trailer_model VARCHAR(64) NULL,
  stage ENUM('to_pickup','loading','to_dropoff','unloading') NOT NULL DEFAULT 'to_pickup',
  cargo_validity DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 100,
  accepted_at DATETIME NOT NULL,
  loaded_at DATETIME NULL,
  deadline_at DATETIME NOT NULL,
  fuel_start DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
  fuel_used DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
  actual_distance_m BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (character_uuid),
  UNIQUE KEY uq_trucker_active_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trucker_delivery_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  character_uuid BIGINT UNSIGNED NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  lease_id VARCHAR(48) NOT NULL,
  cargo VARCHAR(128) NOT NULL,
  company VARCHAR(128) NOT NULL,
  cargo_kind VARCHAR(32) NOT NULL,
  vehicle_type VARCHAR(16) NOT NULL,
  vehicle_model VARCHAR(64) NOT NULL,
  weight_kg INT UNSIGNED NOT NULL,
  planned_distance_m INT UNSIGNED NOT NULL,
  actual_distance_m BIGINT UNSIGNED NOT NULL DEFAULT 0,
  accepted_at DATETIME NOT NULL,
  loaded_at DATETIME NULL,
  delivered_at DATETIME NULL,
  deadline_at DATETIME NOT NULL,
  early_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  late_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  cargo_validity DECIMAL(5,2) UNSIGNED NOT NULL DEFAULT 100,
  fuel_used DECIMAL(12,3) UNSIGNED NOT NULL DEFAULT 0,
  base_pay INT UNSIGNED NOT NULL DEFAULT 0,
  early_bonus INT UNSIGNED NOT NULL DEFAULT 0,
  skill_bonus INT UNSIGNED NOT NULL DEFAULT 0,
  damage_penalty INT UNSIGNED NOT NULL DEFAULT 0,
  late_penalty INT UNSIGNED NOT NULL DEFAULT 0,
  final_payout INT UNSIGNED NOT NULL DEFAULT 0,
  xp_earned INT UNSIGNED NOT NULL DEFAULT 0,
  skill_progress_earned INT UNSIGNED NOT NULL DEFAULT 0,
  skill_points_earned INT UNSIGNED NOT NULL DEFAULT 0,
  result_status ENUM('delivered','failed','cancelled') NOT NULL,
  failure_reason VARCHAR(96) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trucker_history_order (order_id),
  KEY idx_trucker_history_character (character_uuid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
