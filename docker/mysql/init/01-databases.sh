#!/bin/sh
set -eu

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS twinklelogs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS twinkle_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON twinklelogs.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON twinkle_admin.* TO '${MYSQL_USER}'@'%';
CREATE TABLE IF NOT EXISTS twinkle_admin.bans (
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
FLUSH PRIVILEGES;
SQL