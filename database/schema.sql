-- Structure only. No player accounts, logs or other records.
SET NAMES utf8mb4;
CREATE TABLE `account_recovery_codes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL DEFAULT 0,
  `email` varchar(255) DEFAULT NULL,
  `code` varchar(100) DEFAULT NULL,
  `used` tinyint(1) NOT NULL DEFAULT 0,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `login` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `character1` int(11) DEFAULT 0,
  `character2` int(11) DEFAULT 0,
  `character3` int(11) DEFAULT 0,
  `donate` int(11) DEFAULT 0,
  `social_club` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `RegHwid` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `LastHwid` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `RegIP` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `LastIp` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reg_date` datetime DEFAULT NULL,
  `LastLogin` datetime DEFAULT NULL,
  `remember_me` tinyint(1) DEFAULT 0,
  `promocode` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `social_club_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `whitelist` tinyint(1) NOT NULL DEFAULT 0,
  `requestId` int(11) NOT NULL DEFAULT 0,
  `characterUuid` int(11) NOT NULL DEFAULT 0,
  `betAmount` int(11) NOT NULL DEFAULT 0,
  `selectedMultiplier` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `segmentId` int(11) NOT NULL DEFAULT 0,
  `resultMultiplier` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `win` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `winAmount` int(11) NOT NULL DEFAULT 0,
  `balanceBefore` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `balanceAfter` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_presence_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `character_uuid` int(11) NOT NULL DEFAULT 0,
  `character_name` int(11) NOT NULL DEFAULT 0,
  `event_type` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `apartments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `x` float NOT NULL DEFAULT 0,
  `y` float NOT NULL DEFAULT 0,
  `z` float NOT NULL DEFAULT 0,
  `dimension` varchar(255) DEFAULT NULL,
  `owner_uuid` int(11) NOT NULL DEFAULT 0,
  `owner` varchar(255) DEFAULT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `bans` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL DEFAULT 0,
  `character_uuid` int(11) NOT NULL DEFAULT 0,
  `social_club` varchar(128) DEFAULT NULL,
  `hwid` int(11) NOT NULL DEFAULT 0,
  `reason` varchar(255) DEFAULT NULL,
  `admin` int(11) NOT NULL DEFAULT 0,
  `date` datetime DEFAULT NULL,
  `unban_date` datetime DEFAULT NULL,
  `ban_type` varchar(64) DEFAULT NULL,
  `social_club_id` int(11) NOT NULL DEFAULT 0,
  `ip` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `character_f2_cases` (
  `character_uuid` bigint(20) NOT NULL,
  `case_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int(11) NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`character_uuid`,`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_f2_items` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `character_uuid` bigint(20) NOT NULL,
  `item_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int(11) NOT NULL DEFAULT 1,
  `source` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_character_f2_items_character` (`character_uuid`),
  KEY `idx_character_f2_items_item` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_inventories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `static_id` bigint unsigned NOT NULL,
  `inventory` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_static_id` (`static_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_job_skills` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `character_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `job_id` int(11) DEFAULT NULL,
  `level` int(11) DEFAULT 0,
  `exp` int(11) DEFAULT 0,
  `completed_tasks` int(11) DEFAULT 0,
  `total_earned` double DEFAULT 0,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_jobs` (
  `character_uuid` bigint(20) NOT NULL,
  `job_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hired_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`character_uuid`),
  KEY `idx_character_jobs_job` (`job_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `cargo_loader_deliveries` (
  `cargo_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint(20) NOT NULL,
  `job_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `site_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_id` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `destination_id` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `distance_m` int(10) unsigned NOT NULL DEFAULT 0,
  `payout` int(10) unsigned NOT NULL DEFAULT 0,
  `started_at` datetime NOT NULL,
  `completed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`cargo_id`),
  KEY `idx_cargo_loader_character` (`character_uuid`,`completed_at`),
  KEY `idx_cargo_loader_job` (`job_id`,`completed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_known_players` (
  `character_uuid` bigint(20) NOT NULL,
  `target_uuid` bigint(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`character_uuid`,`target_uuid`),
  KEY `idx_character_known_players_target` (`target_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_quest_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `character_uuid` int(11) NOT NULL,
  `quest_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quest_version` int(10) unsigned NOT NULL DEFAULT 1,
  `event_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject_id` varchar(96) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `idempotency_key` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int(11) NOT NULL DEFAULT 1,
  `metadata_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `accepted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_character_quest_event_idempotency` (`character_uuid`,`idempotency_key`),
  KEY `idx_character_quest_events_progress` (`character_uuid`,`quest_id`,`event_type`,`created_at`),
  CONSTRAINT `fk_character_quest_events_character` FOREIGN KEY (`character_uuid`) REFERENCES `characters` (`uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_quest_rewards` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `character_uuid` int(11) NOT NULL,
  `quest_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quest_version` int(10) unsigned NOT NULL DEFAULT 1,
  `reward_key` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reward_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` int(11) NOT NULL DEFAULT 0,
  `payload_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `granted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_character_quest_reward` (`character_uuid`,`quest_id`,`quest_version`,`reward_key`),
  KEY `idx_character_quest_rewards_history` (`character_uuid`,`quest_id`,`granted_at`),
  CONSTRAINT `fk_character_quest_rewards_character` FOREIGN KEY (`character_uuid`) REFERENCES `characters` (`uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_quest_steps` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `quest_instance_id` bigint(20) unsigned NOT NULL,
  `character_uuid` int(11) NOT NULL,
  `quest_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quest_version` int(10) unsigned NOT NULL DEFAULT 1,
  `step_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `state` enum('active','completed','skipped') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `current_amount` int(11) NOT NULL DEFAULT 0,
  `target_amount` int(11) NOT NULL DEFAULT 1,
  `progress_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_character_quest_step` (`quest_instance_id`,`step_id`),
  KEY `idx_character_quest_steps_active` (`character_uuid`,`state`,`quest_id`),
  CONSTRAINT `fk_character_quest_steps_instance` FOREIGN KEY (`quest_instance_id`) REFERENCES `character_quests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_quests` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `character_uuid` int(11) NOT NULL,
  `quest_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quest_version` int(10) unsigned NOT NULL DEFAULT 1,
  `state` enum('active','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `current_step_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `revision` bigint(20) unsigned NOT NULL DEFAULT 1,
  `progress_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `completed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_character_quest_version` (`character_uuid`,`quest_id`,`quest_version`),
  KEY `idx_character_quest_active` (`character_uuid`,`state`,`updated_at`),
  KEY `idx_character_quest_history` (`character_uuid`,`quest_id`,`state`,`completed_at`),
  CONSTRAINT `fk_character_quests_character` FOREIGN KEY (`character_uuid`) REFERENCES `characters` (`uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_vehicle_garage_slots` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `character_uuid` int(11) NOT NULL,
  `garage_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slot_index` int(10) unsigned NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `status` enum('stored','blocked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'stored',
  `stored_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_character_garage_slot` (`character_uuid`,`garage_id`,`slot_index`),
  UNIQUE KEY `uq_character_garage_vehicle` (`character_uuid`,`vehicle_id`),
  KEY `idx_character_garage_history` (`character_uuid`,`garage_id`,`updated_at`),
  KEY `fk_character_vehicle_garage_slots_vehicle` (`vehicle_id`),
  CONSTRAINT `fk_character_vehicle_garage_slots_character` FOREIGN KEY (`character_uuid`) REFERENCES `characters` (`uuid`) ON DELETE CASCADE,
  CONSTRAINT `fk_character_vehicle_garage_slots_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `characters` (
  `uuid` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastname` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `age` int(11) DEFAULT 18,
  `vip_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  `vip_until` datetime DEFAULT NULL,
  `cash` double DEFAULT 0,
  `bank` double DEFAULT 0,
  `position` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `health` int(11) NOT NULL DEFAULT 100,
  `armor` double DEFAULT 0,
  `xp` int(11) DEFAULT 0,
  `level` int(11) DEFAULT 1,
  `promo_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `promo_rewarded` tinyint(1) DEFAULT 0,
  `create_date` datetime DEFAULT NULL,
  `last_play` datetime DEFAULT NULL,
  `customization` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clothes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `appearance` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `has_fraction` tinyint(1) DEFAULT 0,
  `has_admin_profile` tinyint(1) DEFAULT 0,
  `online_today_seconds` int(11) DEFAULT 0,
  `online_month_seconds` int(11) DEFAULT 0,
  `online_total_seconds` int(11) DEFAULT 0,
  `online_stat_date` date DEFAULT NULL,
  `online_stat_month` char(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `online_reward_claimed_date` date DEFAULT NULL,
  `admin_level` int(11) NOT NULL DEFAULT 0,
  `tcoin` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_dirty` tinyint(1) NOT NULL DEFAULT 0,
  `avatar_updated_at` datetime DEFAULT NULL,
  `fraction_id` int(11) NOT NULL DEFAULT 0,
  `fraction_rank` int(11) NOT NULL DEFAULT 0,
  `tco` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cleanAccountId` int(11) NOT NULL DEFAULT 0,
  `cleanSlotId` int(11) NOT NULL DEFAULT 0,
  `login` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `LastHwid` int(11) NOT NULL DEFAULT 0,
  `social_club_id` int(11) NOT NULL DEFAULT 0,
  `LastIp` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `water` int(11) NOT NULL DEFAULT 100,
  `food` int(11) NOT NULL DEFAULT 100,
  `last_xp_payday_total_seconds` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `level_reward_claimed_level` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `jail_sentences` (
  `character_uuid` int(11) NOT NULL,
  `admin_uuid` int(11) DEFAULT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remaining_seconds` int(10) unsigned NOT NULL,
  `total_seconds` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`character_uuid`),
  KEY `idx_jail_sentences_admin` (`admin_uuid`),
  KEY `idx_jail_sentences_remaining` (`remaining_seconds`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `condos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `number` varchar(10) NOT NULL DEFAULT '1',
  `condo_big_id` int(11) NOT NULL DEFAULT 0,
  `address` varchar(256) NOT NULL DEFAULT '',
  `street` varchar(256) NOT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL DEFAULT 0,
  `user_name` varchar(256) NOT NULL DEFAULT '',
  `pin` int(11) NOT NULL DEFAULT 0,
  `is_safe` int(11) NOT NULL DEFAULT 0,
  `is_sec` tinyint(1) NOT NULL DEFAULT 0,
  `is_lock` tinyint(1) NOT NULL DEFAULT 0,
  `interior` int(11) NOT NULL DEFAULT 0,
  `x` float NOT NULL DEFAULT 0,
  `y` float NOT NULL DEFAULT 0,
  `z` float NOT NULL DEFAULT 0,
  `rot` float NOT NULL DEFAULT 0,
  `tax_score` int(11) NOT NULL DEFAULT 0,
  `tax_money` float NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_condos_building_number` (`condo_big_id`,`number`),
  KEY `idx_condos_user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=587 DEFAULT CHARSET=utf8;


CREATE TABLE `condos_big` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `address` varchar(256) NOT NULL DEFAULT '',
  `street` varchar(256) NOT NULL DEFAULT '',
  `number` varchar(10) NOT NULL DEFAULT '0',
  `x` float NOT NULL DEFAULT 0,
  `y` float NOT NULL DEFAULT 0,
  `z` float NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8;


CREATE TABLE `current_timestamp` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `f2_roulette_settlements` (
  `account_id` bigint(20) unsigned NOT NULL,
  `request_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint(20) unsigned NOT NULL,
  `bet_amount` int(10) unsigned NOT NULL,
  `selected_multiplier` tinyint(3) unsigned NOT NULL,
  `segment_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `result_multiplier` tinyint(3) unsigned NOT NULL,
  `win` tinyint(1) NOT NULL,
  `win_amount` int(10) unsigned NOT NULL,
  `balance_before` bigint(20) unsigned NOT NULL,
  `balance_after` bigint(20) unsigned NOT NULL,
  `acknowledged_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`account_id`,`request_id`),
  KEY `idx_f2_roulette_character_created` (`character_uuid`,`created_at`),
  KEY `idx_f2_roulette_account_ack_created` (`account_id`,`acknowledged_at`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fishing_catch_ledger` (
  `uid` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_static_id` bigint(20) NOT NULL,
  `species_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `species_name` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `point_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `weight_kg` decimal(8,2) NOT NULL DEFAULT 0.00,
  `length_cm` decimal(8,2) NOT NULL DEFAULT 0.00,
  `quality` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `rarity` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'common',
  `price` int(11) NOT NULL DEFAULT 0,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `caught_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `sold_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`uid`),
  KEY `idx_fishing_owner` (`owner_static_id`),
  KEY `idx_fishing_species` (`species_id`),
  KEY `idx_fishing_point` (`point_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fishing_profiles` (
  `static_id` bigint(20) NOT NULL,
  `profile` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`static_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fraction_blacklist` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) NOT NULL,
  `character_uuid` bigint(20) NOT NULL,
  `issuer_uuid` bigint(20) NOT NULL,
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `removed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fraction_blacklist` (`fraction_id`,`character_uuid`),
  KEY `idx_fraction_blacklist_active` (`fraction_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fraction_departments` (
  `department_id` int(11) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) DEFAULT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`department_id`)
) ENGINE=InnoDB AUTO_INCREMENT=485 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fraction_members` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) DEFAULT NULL,
  `character_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rank_index` int(11) DEFAULT NULL,
  `division` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invited_by_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `joined_at` datetime DEFAULT NULL,
  `leader_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `warn_count` int(11) DEFAULT 0,
  `last_seen_at` datetime DEFAULT NULL,
  `rank_name` int(11) NOT NULL DEFAULT 0,
  `short_name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fraction_ranks` (
  `rank_id` int(11) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) DEFAULT NULL,
  `rank_index` int(11) DEFAULT NULL,
  `rank_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `salary` int(11) DEFAULT 0,
  `permissions` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_leader` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`rank_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1170 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fraction_storage_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) DEFAULT NULL,
  `item_key` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `item_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` int(11) DEFAULT 0,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fractions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `short_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `leader_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `balance` int(11) DEFAULT 0,
  `spawn_points` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locker_marker` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `settings` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `spawn_x` decimal(10,4) DEFAULT NULL,
  `spawn_y` decimal(10,4) DEFAULT NULL,
  `spawn_z` decimal(10,4) DEFAULT NULL,
  `spawn_h` decimal(10,4) DEFAULT NULL,
  `spawn_dimension` int(11) DEFAULT 0,
  `color_hex` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rage_color` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `ghetto_captures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `finished_at` datetime DEFAULT NULL,
  `zone_id` int(11) DEFAULT NULL,
  `attacker_fraction_id` int(11) DEFAULT NULL,
  `defender_fraction_id` int(11) DEFAULT NULL,
  `started_by_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ends_at` datetime DEFAULT NULL,
  `attacker_score` int(11) DEFAULT 0,
  `defender_score` int(11) DEFAULT 0,
  `attacker_kills` int(11) DEFAULT 0,
  `defender_kills` int(11) DEFAULT 0,
  `winner_fraction_id` int(11) DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `ghetto_zones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_x` decimal(10,4) DEFAULT NULL,
  `max_x` decimal(10,4) DEFAULT NULL,
  `min_y` decimal(10,4) DEFAULT NULL,
  `max_y` decimal(10,4) DEFAULT NULL,
  `z` decimal(10,4) DEFAULT NULL,
  `owner_fraction_id` int(11) DEFAULT NULL,
  `is_title` tinyint(1) DEFAULT 0,
  `title_fraction_id` int(11) DEFAULT NULL,
  `enabled` tinyint(1) DEFAULT 1,
  `sort_order` int(11) DEFAULT 0,
  `captured_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `government_decree_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `decree_id` bigint(20) NOT NULL,
  `actor_uuid` bigint(20) NOT NULL,
  `action` varchar(32) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_government_decree_logs` (`decree_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `government_decree_versions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `decree_id` bigint(20) NOT NULL,
  `version` int(11) NOT NULL,
  `title` varchar(180) NOT NULL,
  `summary` varchar(500) DEFAULT NULL,
  `body` mediumtext NOT NULL,
  `effective_at` date DEFAULT NULL,
  `editor_uuid` bigint(20) NOT NULL,
  `pdf_object_key` varchar(512) DEFAULT NULL,
  `pdf_url` varchar(1024) DEFAULT NULL,
  `pdf_checksum` char(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_government_decree_version` (`decree_id`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `government_decrees` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `document_number` varchar(64) NOT NULL,
  `title` varchar(180) NOT NULL,
  `summary` varchar(500) DEFAULT NULL,
  `body` mediumtext NOT NULL,
  `effective_at` date DEFAULT NULL,
  `author_uuid` bigint(20) NOT NULL,
  `author_name` varchar(128) NOT NULL,
  `author_position` varchar(128) DEFAULT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'draft',
  `current_version` int(11) NOT NULL DEFAULT 1,
  `pdf_object_key` varchar(512) DEFAULT NULL,
  `pdf_url` varchar(1024) DEFAULT NULL,
  `pdf_checksum` char(64) DEFAULT NULL,
  `pdf_size` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_government_decree_number` (`document_number`),
  KEY `idx_government_decrees_status` (`status`,`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `government_material_orders` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `request_id` varchar(96) NOT NULL,
  `target_fraction_id` int(11) NOT NULL,
  `amount` int(11) NOT NULL,
  `unit_price` int(11) NOT NULL,
  `total_price` bigint(20) NOT NULL,
  `actor_uuid` bigint(20) NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'fulfilled',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_government_order_request` (`request_id`),
  KEY `idx_government_orders_created` (`created_at`),
  KEY `idx_government_orders_target` (`target_fraction_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `houses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `number` int(11) NOT NULL DEFAULT 1,
  `address` varchar(256) NOT NULL DEFAULT '',
  `street` varchar(256) NOT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL DEFAULT 0,
  `user_name` varchar(256) NOT NULL DEFAULT '',
  `pin` int(11) NOT NULL DEFAULT 0,
  `is_safe` int(11) NOT NULL DEFAULT 0,
  `is_sec` tinyint(1) NOT NULL DEFAULT 0,
  `is_lock` tinyint(1) NOT NULL DEFAULT 0,
  `interior` int(11) NOT NULL DEFAULT 0,
  `x` float NOT NULL DEFAULT 0,
  `y` float NOT NULL DEFAULT 0,
  `z` float NOT NULL DEFAULT 0,
  `rot` float NOT NULL DEFAULT 0,
  `ginterior1` int(11) NOT NULL DEFAULT -1,
  `gx1` float NOT NULL DEFAULT 0,
  `gy1` float NOT NULL DEFAULT 0,
  `gz1` float NOT NULL DEFAULT 0,
  `grot1` float NOT NULL DEFAULT 0,
  `ginterior2` int(11) NOT NULL DEFAULT -1,
  `gx2` float NOT NULL DEFAULT 0,
  `gy2` float NOT NULL DEFAULT 0,
  `gz2` float NOT NULL DEFAULT 0,
  `grot2` float NOT NULL DEFAULT 0,
  `ginterior3` int(11) NOT NULL DEFAULT -1,
  `gx3` float NOT NULL DEFAULT 0,
  `gy3` float NOT NULL DEFAULT 0,
  `gz3` float NOT NULL DEFAULT 0,
  `grot3` float NOT NULL DEFAULT 0,
  `max_roommate` int(11) NOT NULL DEFAULT 0,
  `tax_score` int(11) NOT NULL DEFAULT 0,
  `tax_money` float NOT NULL DEFAULT 0,
  `dimension` varchar(255) DEFAULT NULL,
  `owner` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=926 DEFAULT CHARSET=utf8;


CREATE TABLE `hunting_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `static_id` int(11) NOT NULL DEFAULT 0,
  `profile` longtext NOT NULL,
  `updated_at` datetime DEFAULT NULL,
  `Column_name` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_hunting_profiles_static_id` (`static_id`)
) ENGINE=InnoDB AUTO_INCREMENT=191 DEFAULT CHARSET=utf8mb4;


CREATE TABLE `hwid_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL DEFAULT 0,
  `old_hwid` int(11) NOT NULL DEFAULT 0,
  `new_hwid` int(11) NOT NULL DEFAULT 0,
  `ip` varchar(100) DEFAULT NULL,
  `date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `mutes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` int(11) NOT NULL DEFAULT 0,
  `admin_uuid` int(11) NOT NULL DEFAULT 0,
  `reason` varchar(255) DEFAULT NULL,
  `remaining_seconds` varchar(255) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `isMuted` tinyint(1) NOT NULL DEFAULT 0,
  `muteData` tinyint(1) NOT NULL DEFAULT 0,
  `remainingSeconds` varchar(255) DEFAULT NULL,
  `lastTick` varchar(255) DEFAULT NULL,
  `checkMuteOnJo` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `promo_codes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(100) DEFAULT NULL,
  `type` varchar(64) DEFAULT NULL,
  `owner_character_uuid` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `used_count` int(11) NOT NULL DEFAULT 0,
  `rewarded_count` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `property_furniture` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `property_type` varchar(24) NOT NULL,
  `property_id` int(11) NOT NULL,
  `active` tinyint(4) NOT NULL DEFAULT 1,
  `x` double NOT NULL DEFAULT 0,
  `y` double NOT NULL DEFAULT 0,
  `z` double NOT NULL DEFAULT 0,
  `rot_x` double NOT NULL DEFAULT 0,
  `rot_y` double NOT NULL DEFAULT 0,
  `rot_z` double NOT NULL DEFAULT 0,
  `dimension` int(11) NOT NULL DEFAULT 0,
  `owner_uuid` varchar(64) NOT NULL,
  `catalog_id` varchar(64) NOT NULL,
  `model` varchar(96) NOT NULL,
  `name` varchar(128) NOT NULL,
  `category` varchar(64) NOT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `Str` varchar(255) DEFAULT NULL,
  `spawnerStarted` varchar(255) DEFAULT NULL,
  `propertyK` varchar(255) DEFAULT NULL,
  `selectedId` int(11) NOT NULL DEFAULT 0,
  `catalogItem` varchar(255) DEFAULT NULL,
  `condoRows` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_property_furniture_property` (`property_type`,`property_id`,`active`),
  KEY `idx_property_furniture_owner` (`owner_uuid`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4;


CREATE TABLE `report_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) NOT NULL DEFAULT 0,
  `author_id` int(11) NOT NULL DEFAULT 0,
  `admin_id` int(11) NOT NULL DEFAULT 0,
  `author_name` varchar(64) DEFAULT NULL,
  `role` varchar(255) DEFAULT NULL,
  `action_type` varchar(64) DEFAULT NULL,
  `text` varchar(255) DEFAULT NULL,
  `answer_seconds` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `player_id` int(11) NOT NULL DEFAULT 0,
  `player_name` varchar(64) DEFAULT NULL,
  `question` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `admin_id` int(11) NOT NULL DEFAULT 0,
  `admin_name` int(11) NOT NULL DEFAULT 0,
  `answer_seconds` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `closed_at` varchar(255) DEFAULT NULL,
  `adm` varchar(255) DEFAULT NULL,
  `answerSeconds` varchar(255) DEFAULT NULL,
  `undef` varchar(255) DEFAULT NULL,
  `Str` varchar(255) DEFAULT NULL,
  `function` varchar(255) DEFAULT NULL,
  `INSERT` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `server_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(64) DEFAULT NULL,
  `level` int(11) NOT NULL DEFAULT 0,
  `player_uuid` int(11) NOT NULL DEFAULT 0,
  `player_name` varchar(64) DEFAULT NULL,
  `message` int(11) NOT NULL DEFAULT 18,
  `data` longtext DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `system_runtime_settings` (
  `setting_key` varchar(96) NOT NULL,
  `setting_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `twinkle_business_employees` (
  `business_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint(20) NOT NULL,
  `character_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `permissions_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `hired_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`business_id`,`character_uuid`),
  KEY `idx_twinkle_business_employees_character` (`character_uuid`),
  CONSTRAINT `fk_twinkle_business_employee_business` FOREIGN KEY (`business_id`) REFERENCES `twinkle_businesses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `twinkle_business_ledger` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `business_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_uuid` bigint(20) DEFAULT NULL,
  `action` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` bigint(20) NOT NULL DEFAULT 0,
  `balance_after` bigint(20) NOT NULL DEFAULT 0,
  `details_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_twinkle_business_ledger_business_created` (`business_id`,`created_at`),
  CONSTRAINT `fk_twinkle_business_ledger_business` FOREIGN KEY (`business_id`) REFERENCES `twinkle_businesses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `twinkle_business_sales` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `business_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `buyer_uuid` bigint(20) DEFAULT NULL,
  `actor_uuid` bigint(20) DEFAULT NULL,
  `sale_kind` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `items_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_price` bigint(20) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_twinkle_business_sales_business_created` (`business_id`,`created_at`),
  KEY `idx_twinkle_business_sales_buyer` (`buyer_uuid`),
  CONSTRAINT `fk_twinkle_business_sale_business` FOREIGN KEY (`business_id`) REFERENCES `twinkle_businesses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `twinkle_business_supplies` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `business_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_uuid` bigint(20) NOT NULL,
  `stock_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` int(11) NOT NULL,
  `total_price` bigint(20) NOT NULL,
  `status` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fulfilled',
  `available_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_twinkle_business_supplies_business_created` (`business_id`,`created_at`),
  KEY `idx_twinkle_business_supplies_due` (`status`,`available_at`,`id`),
  CONSTRAINT `fk_twinkle_business_supply_business` FOREIGN KEY (`business_id`) REFERENCES `twinkle_businesses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `twinkle_businesses` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_uuid` bigint(20) DEFAULT NULL,
  `owner_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `cash_balance` bigint(20) NOT NULL DEFAULT 0,
  `bank_balance` bigint(20) NOT NULL DEFAULT 0,
  `stock_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `catalog_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_open` tinyint(1) NOT NULL DEFAULT 1,
  `position_x` double NOT NULL,
  `position_y` double NOT NULL,
  `position_z` double NOT NULL,
  `dimension` int(11) NOT NULL DEFAULT 0,
  `purchase_price` bigint(20) NOT NULL DEFAULT 0,
  `sale_price` bigint(20) DEFAULT NULL,
  `tax_paid_until` datetime DEFAULT NULL,
  `revision` bigint(20) unsigned NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_twinkle_businesses_owner` (`owner_uuid`),
  KEY `idx_twinkle_businesses_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `vehicle_catalog` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `real_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `class_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gov_price` int(11) DEFAULT 0,
  `fuel_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'petrol',
  `fuel_max` double DEFAULT 100,
  `fuel_consumption` double DEFAULT 1,
  `trunk_slots` int(11) DEFAULT 0,
  `trunk_max_weight` int(11) DEFAULT 0,
  `max_mileage` int(11) DEFAULT 0,
  `enabled` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vehicle_catalog_model` (`model`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `vehicle_scrapyard_money_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `character_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `vehicle_model` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_plate` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `government_price` int(11) NOT NULL DEFAULT 0,
  `payout_percent` decimal(5,2) NOT NULL DEFAULT 75.00,
  `amount` int(11) NOT NULL DEFAULT 0,
  `action` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'vehicle_scrapyard',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_scrapyard_character` (`character_id`),
  KEY `idx_scrapyard_vehicle` (`vehicle_id`),
  KEY `idx_scrapyard_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `vehicles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `owner` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pos_x` decimal(10,4) DEFAULT NULL,
  `pos_y` decimal(10,4) DEFAULT NULL,
  `pos_z` decimal(10,4) DEFAULT NULL,
  `heading` decimal(10,4) DEFAULT NULL,
  `dimension` int(11) DEFAULT 0,
  `fuel` double DEFAULT 100,
  `mileage` double DEFAULT 0,
  `locked` tinyint(1) DEFAULT 0,
  `engine` tinyint(1) DEFAULT 0,
  `health` int(11) DEFAULT 1000,
  `plate` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color1` int(11) DEFAULT 0,
  `color2` int(11) DEFAULT 0,
  `created_at` datetime DEFAULT NULL,
  `garage_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'outside',
  `garage_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `garage_slot` int(11) DEFAULT NULL,
  `purchase_source` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_uuid` int(11) NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL DEFAULT 0,
  `character_uuid` int(11) NOT NULL DEFAULT 0,
  `tuning_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vehicles_garage_status` (`owner`,`garage_status`,`garage_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_documents` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `static_id` bigint unsigned NOT NULL,
  `document_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_number` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issuer_static_id` bigint unsigned DEFAULT NULL,
  `issuer_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_at` datetime NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_character_documents_active_slot` (`static_id`,`document_type`),
  KEY `idx_character_documents_number` (`document_number`),
  KEY `idx_character_documents_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `character_licenses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `static_id` bigint unsigned NOT NULL,
  `license_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `license_label` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issued_at` datetime NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `document_number` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_character_licenses_static_license` (`static_id`,`license_id`),
  KEY `idx_character_licenses_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `trucker_profiles` (
  `character_uuid` bigint unsigned NOT NULL,
  `xp` int unsigned NOT NULL DEFAULT 0,
  `rank_level` tinyint unsigned NOT NULL DEFAULT 1,
  `skill_points` int unsigned NOT NULL DEFAULT 0,
  `skill_progress` int unsigned NOT NULL DEFAULT 0,
  `completed_orders` int unsigned NOT NULL DEFAULT 0,
  `failed_orders` int unsigned NOT NULL DEFAULT 0,
  `cancellation_debt` int unsigned NOT NULL DEFAULT 0,
  `on_time_orders` int unsigned NOT NULL DEFAULT 0,
  `late_orders` int unsigned NOT NULL DEFAULT 0,
  `total_earned` bigint unsigned NOT NULL DEFAULT 0,
  `total_distance_m` bigint unsigned NOT NULL DEFAULT 0,
  `total_fuel_used` decimal(12,3) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `trucker_skill_unlocks` (
  `character_uuid` bigint unsigned NOT NULL,
  `skill_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `spent_points` int unsigned NOT NULL,
  `unlocked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`,`skill_id`),
  KEY `idx_trucker_skill_id` (`skill_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `trucker_rentals` (
  `lease_id` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint unsigned NOT NULL,
  `vehicle_config_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_model` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_type` enum('pickup','van','truck') COLLATE utf8mb4_unicode_ci NOT NULL,
  `trailer_model` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rent_price` int unsigned NOT NULL,
  `orders_remaining` tinyint unsigned NOT NULL,
  `last_consumed_order_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','ended','expired','destroyed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `claimed_at` datetime DEFAULT NULL,
  `active_character_uuid` bigint unsigned GENERATED ALWAYS AS (CASE WHEN `status` = 'active' THEN `character_uuid` ELSE NULL END) STORED,
  `end_reason` varchar(96) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lease_id`),
  UNIQUE KEY `uq_trucker_rentals_one_active` (`active_character_uuid`),
  KEY `idx_trucker_rentals_character` (`character_uuid`,`status`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `trucker_orders` (
  `order_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `refresh_bucket` bigint unsigned NOT NULL,
  `slot_index` tinyint unsigned NOT NULL,
  `template_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('available','accepted','delivered','expired','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
  `cargo` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cargo_kind` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_type` enum('pickup','van','truck') COLLATE utf8mb4_unicode_ci NOT NULL,
  `required_license` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `required_rank` tinyint unsigned NOT NULL,
  `required_skill` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trailer_model` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trailer_livery` int DEFAULT NULL,
  `trailer_color1` int DEFAULT NULL,
  `trailer_color2` int DEFAULT NULL,
  `weight_kg` int unsigned NOT NULL,
  `origin_x` double NOT NULL,
  `origin_y` double NOT NULL,
  `origin_z` double NOT NULL,
  `origin_heading` float NOT NULL DEFAULT 0,
  `destination_x` double NOT NULL,
  `destination_y` double NOT NULL,
  `destination_z` double NOT NULL,
  `destination_heading` float NOT NULL DEFAULT 0,
  `route_distance_m` int unsigned NOT NULL,
  `time_limit_seconds` int unsigned NOT NULL,
  `base_pay` int unsigned NOT NULL,
  `accepted_by` bigint unsigned DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `uq_trucker_rotation_slot` (`refresh_bucket`,`slot_index`),
  KEY `idx_trucker_orders_pool` (`refresh_bucket`,`status`,`expires_at`),
  KEY `idx_trucker_orders_acceptor` (`accepted_by`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `trucker_active_deliveries` (
  `character_uuid` bigint unsigned NOT NULL,
  `order_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lease_id` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_runtime_id` int DEFAULT NULL,
  `vehicle_config_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_model` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_type` enum('pickup','van','truck') COLLATE utf8mb4_unicode_ci NOT NULL,
  `trailer_model` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stage` enum('to_pickup','loading','to_dropoff','unloading') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'to_pickup',
  `cargo_validity` decimal(5,2) unsigned NOT NULL DEFAULT 100,
  `accepted_at` datetime NOT NULL,
  `loaded_at` datetime DEFAULT NULL,
  `deadline_at` datetime NOT NULL,
  `fuel_start` decimal(12,3) unsigned NOT NULL DEFAULT 0,
  `fuel_used` decimal(12,3) unsigned NOT NULL DEFAULT 0,
  `actual_distance_m` bigint unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`),
  UNIQUE KEY `uq_trucker_active_order` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `trucker_delivery_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `character_uuid` bigint unsigned NOT NULL,
  `order_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lease_id` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cargo` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cargo_kind` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_model` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `weight_kg` int unsigned NOT NULL,
  `planned_distance_m` int unsigned NOT NULL,
  `actual_distance_m` bigint unsigned NOT NULL DEFAULT 0,
  `accepted_at` datetime NOT NULL,
  `loaded_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `deadline_at` datetime NOT NULL,
  `early_seconds` int unsigned NOT NULL DEFAULT 0,
  `late_seconds` int unsigned NOT NULL DEFAULT 0,
  `cargo_validity` decimal(5,2) unsigned NOT NULL DEFAULT 100,
  `fuel_used` decimal(12,3) unsigned NOT NULL DEFAULT 0,
  `base_pay` int unsigned NOT NULL DEFAULT 0,
  `early_bonus` int unsigned NOT NULL DEFAULT 0,
  `skill_bonus` int unsigned NOT NULL DEFAULT 0,
  `damage_penalty` int unsigned NOT NULL DEFAULT 0,
  `late_penalty` int unsigned NOT NULL DEFAULT 0,
  `final_payout` int unsigned NOT NULL DEFAULT 0,
  `cancellation_penalty` int unsigned NOT NULL DEFAULT 0,
  `xp_earned` int unsigned NOT NULL DEFAULT 0,
  `skill_progress_earned` int unsigned NOT NULL DEFAULT 0,
  `skill_points_earned` int unsigned NOT NULL DEFAULT 0,
  `result_status` enum('delivered','failed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `failure_reason` varchar(96) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trucker_history_order` (`order_id`),
  KEY `idx_trucker_history_character` (`character_uuid`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `mining_profiles` (
  `character_uuid` bigint unsigned NOT NULL,
  `xp` int unsigned NOT NULL DEFAULT 0,
  `level` tinyint unsigned NOT NULL DEFAULT 1,
  `stones_mined` int unsigned NOT NULL DEFAULT 0,
  `kg_sold` decimal(14,2) unsigned NOT NULL DEFAULT 0,
  `kg_spilled` decimal(14,2) unsigned NOT NULL DEFAULT 0,
  `haul_trips` int unsigned NOT NULL DEFAULT 0,
  `total_earned` bigint unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `mining_entitlements` (
  `character_uuid` bigint unsigned NOT NULL,
  `entitlement_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remaining_ms` int unsigned NOT NULL DEFAULT 0,
  `item_uid` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`,`entitlement_type`),
  KEY `idx_mining_entitlements_active` (`entitlement_type`,`remaining_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `mining_cargo` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cargo_key` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint unsigned NOT NULL,
  `kind` enum('ore','haul','settlement') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_name` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_stone_id` varchar(96) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kg` decimal(12,2) unsigned NOT NULL DEFAULT 0,
  `unit_price` int unsigned NOT NULL DEFAULT 0,
  `payout` int unsigned NOT NULL DEFAULT 0,
  `xp_reward` int unsigned NOT NULL DEFAULT 0,
  `status` enum('settled','carried','sold','spilled','loaded','delivered','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `destination` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `metrics` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `active_character_uuid` bigint unsigned GENERATED ALWAYS AS (CASE WHEN `status` IN ('carried','loaded') THEN `character_uuid` ELSE NULL END) STORED,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `settled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mining_cargo_key` (`cargo_key`),
  UNIQUE KEY `uq_mining_one_active_cargo` (`active_character_uuid`),
  KEY `idx_mining_cargo_character` (`character_uuid`,`status`,`created_at`),
  KEY `idx_mining_cargo_stone` (`source_stone_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `forestry_profiles` (
  `character_uuid` bigint unsigned NOT NULL,
  `xp` int unsigned NOT NULL DEFAULT 0,
  `level` tinyint unsigned NOT NULL DEFAULT 1,
  `trees_cut` int unsigned NOT NULL DEFAULT 0,
  `logs_delivered` decimal(14,2) unsigned NOT NULL DEFAULT 0,
  `logs_lost` decimal(14,2) unsigned NOT NULL DEFAULT 0,
  `haul_trips` int unsigned NOT NULL DEFAULT 0,
  `fast_deliveries` int unsigned NOT NULL DEFAULT 0,
  `total_earned` bigint unsigned NOT NULL DEFAULT 0,
  `secret_saw_claimed` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `forestry_entitlements` (
  `character_uuid` bigint unsigned NOT NULL,
  `entitlement_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `remaining_ms` int unsigned NOT NULL DEFAULT 0,
  `item_uid` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`,`entitlement_type`),
  KEY `idx_forestry_entitlements_active` (`entitlement_type`,`remaining_ms`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `forestry_cargo` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cargo_key` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint unsigned NOT NULL,
  `kind` enum('logs','haul','settlement') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_name` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_tree_id` varchar(96) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kg` decimal(12,2) unsigned NOT NULL DEFAULT 0,
  `unit_price` int unsigned NOT NULL DEFAULT 0,
  `payout` int unsigned NOT NULL DEFAULT 0,
  `xp_reward` int unsigned NOT NULL DEFAULT 0,
  `status` enum('settled','carried','delivered','lost','loaded','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL,
  `destination` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `metrics` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `active_character_uuid` bigint unsigned GENERATED ALWAYS AS (CASE WHEN `status` IN ('carried','loaded') THEN `character_uuid` ELSE NULL END) STORED,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `settled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_forestry_cargo_key` (`cargo_key`),
  UNIQUE KEY `uq_forestry_one_active_cargo` (`active_character_uuid`),
  KEY `idx_forestry_cargo_character` (`character_uuid`,`status`,`created_at`),
  KEY `idx_forestry_cargo_tree` (`source_tree_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `delivery_stop_settlements` (
  `settlement_key` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint unsigned NOT NULL,
  `route_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stop_index` int unsigned NOT NULL,
  `payout` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`settlement_key`),
  KEY `idx_delivery_stop_character` (`character_uuid`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `armored_collector_profiles` (
  `character_uuid` bigint unsigned NOT NULL,
  `xp` int unsigned NOT NULL DEFAULT 0,
  `level` tinyint unsigned NOT NULL DEFAULT 1,
  `completed_routes` int unsigned NOT NULL DEFAULT 0,
  `fast_routes` int unsigned NOT NULL DEFAULT 0,
  `total_earned` bigint unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`character_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `armored_collector_history` (
  `run_id` varchar(48) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_uuid` bigint unsigned NOT NULL,
  `route_id` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rotation_bucket` bigint unsigned NOT NULL,
  `bags` tinyint unsigned NOT NULL,
  `distance_m` int unsigned NOT NULL,
  `elapsed_seconds` int unsigned NOT NULL,
  `target_seconds` int unsigned NOT NULL,
  `base_pay` int unsigned NOT NULL,
  `level_bonus` int unsigned NOT NULL,
  `veteran_bonus` int unsigned NOT NULL,
  `fast_bonus` int unsigned NOT NULL,
  `final_payout` int unsigned NOT NULL,
  `xp_earned` int unsigned NOT NULL,
  `suspicious` tinyint(1) unsigned NOT NULL DEFAULT 0,
  `result_status` enum('completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed',
  `cancellation_fee` int unsigned NOT NULL DEFAULT 0,
  `started_at` datetime NOT NULL,
  `completed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`run_id`),
  UNIQUE KEY `uq_armored_character_rotation_route` (`character_uuid`,`rotation_bucket`,`route_id`),
  KEY `idx_armored_history_character` (`character_uuid`,`completed_at`),
  KEY `idx_armored_history_rotation` (`rotation_bucket`,`route_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



CREATE TABLE `admin_appointment_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `profile_id` int(11) DEFAULT NULL,
  `actor_profile_id` int(11) DEFAULT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_position` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_position` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `effective_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `actor_profile_id` int(11) DEFAULT NULL,
  `actor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `summary` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_departments` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discord_role_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_title_css` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_duty_outfits` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `gender` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_admin_level` int(11) DEFAULT NULL,
  `outfit_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `recipient_profile_id` int(11) DEFAULT NULL,
  `actor_profile_id` int(11) DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_npc_dialogs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profession` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scenario` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `position_x` decimal(10,4) DEFAULT NULL,
  `position_y` decimal(10,4) DEFAULT NULL,
  `position_z` decimal(10,4) DEFAULT NULL,
  `heading` decimal(10,4) DEFAULT NULL,
  `start_node` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blip` int(11) DEFAULT NULL,
  `nodes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_enabled` tinyint(1) DEFAULT 1,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_penalty_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `profile_id` int(11) DEFAULT NULL,
  `actor_profile_id` int(11) DEFAULT NULL,
  `change_amount` int(11) DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_penalty_points` (
  `profile_id` int(11) NOT NULL,
  `points` int(11) DEFAULT 0,
  `last_penalty_at` datetime DEFAULT NULL,
  `next_decay_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_profile_meta` (
  `admin_profile_id` int(11) NOT NULL,
  `discord_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `profile_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_title_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_title_css` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`admin_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) DEFAULT NULL,
  `character_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admin_level` int(11) DEFAULT 0,
  `admsite_access` tinyint(1) DEFAULT 0,
  `role_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `two_factor_enabled` tinyint(1) DEFAULT 0,
  `two_factor_secret` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `discord_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `last_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_role` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discord_role_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_title_css` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `is_system` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_role_permissions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `role_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `permission_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_allowed` tinyint(1) DEFAULT 1,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_server_commands` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `command` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `arguments` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `required_level` int(11) DEFAULT 0,
  `sort_order` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_system_modules` (
  `module_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_enabled` tinyint(1) DEFAULT 0,
  `settings` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`module_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_vacations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_id` int(11) DEFAULT NULL,
  `admin_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admin_level` int(11) DEFAULT NULL,
  `department_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `reviewed_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewer_profile_id` int(11) DEFAULT NULL,
  `review_comment` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_whitelist_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `login` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hwid` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `added_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_admin_wl_login` (`login`),
  KEY `idx_admin_wl_hwid` (`hwid`),
  KEY `idx_admin_wl_type` (`type`),
  KEY `idx_admin_wl_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_whitelist_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `enabled` tinyint(1) DEFAULT 0,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admsite_changelog_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `discord_webhook_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delivery_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bot_token` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guild_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `channel_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `webhook_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `webhook_avatar_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `bans` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `account_id` bigint(20) unsigned DEFAULT NULL,
  `character_uuid` bigint(20) unsigned DEFAULT NULL,
  `social_club` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `social_club_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hwid` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ban_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'character',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admin` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date` timestamp NOT NULL DEFAULT current_timestamp(),
  `unban_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bans_account` (`account_id`),
  KEY `idx_bans_character` (`character_uuid`),
  KEY `idx_bans_hwid` (`hwid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `mutes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admin_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `remaining_seconds` int(11) DEFAULT 0,
  `updated_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `report_messages` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `report_id` int(11) DEFAULT NULL,
  `author_id` int(11) DEFAULT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `author_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `text` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `answer_seconds` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `player_id` int(11) DEFAULT NULL,
  `player_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `question` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `admin_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `answer_seconds` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `admin_action_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `admin_account_id` int(11) DEFAULT NULL,
  `admin_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_id` int(11) DEFAULT NULL,
  `details` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `character_f2_case_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `character_uuid` bigint(20) NOT NULL,
  `case_id` varchar(64) NOT NULL,
  `reward_id` varchar(64) NOT NULL,
  `reward_type` varchar(32) NOT NULL,
  `reward_name` varchar(128) NOT NULL,
  `reward_rarity` varchar(32) NOT NULL,
  `reward_amount` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_f2_case_logs_character` (`character_uuid`),
  KEY `idx_f2_case_logs_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `donate_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',
  `action` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'change',
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `balance_before` decimal(15,2) DEFAULT NULL,
  `balance_after` decimal(15,2) DEFAULT NULL,
  `actor_uuid` bigint(20) DEFAULT NULL,
  `actor_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_uuid` bigint(20) DEFAULT NULL,
  `target_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_id` bigint(20) DEFAULT NULL,
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_donate_logs_created` (`created_at`),
  KEY `idx_donate_logs_target` (`target_uuid`,`created_at`),
  KEY `idx_donate_logs_actor` (`actor_uuid`,`created_at`),
  KEY `idx_donate_logs_account` (`account_id`,`created_at`),
  KEY `idx_donate_logs_source` (`source`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fraction_balance_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) NOT NULL,
  `actor_uuid` bigint(20) DEFAULT NULL,
  `actor_rank` int(11) DEFAULT NULL,
  `transaction_type` varchar(64) NOT NULL,
  `comment` varchar(255) DEFAULT NULL,
  `amount` decimal(15,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fraction_balance_created` (`fraction_id`,`created_at`),
  KEY `idx_fraction_balance_actor` (`fraction_id`,`actor_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `fraction_member_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) DEFAULT NULL,
  `character_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_rank` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_fraction_member` (`fraction_id`,`character_uuid`),
  KEY `idx_fraction_history_created` (`fraction_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `fraction_storage_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `fraction_id` int(11) NOT NULL,
  `actor_uuid` bigint(20) DEFAULT NULL,
  `actor_rank` int(11) DEFAULT NULL,
  `action` varchar(64) NOT NULL,
  `item_key` varchar(64) DEFAULT NULL,
  `item_name` varchar(128) NOT NULL,
  `amount` int(11) NOT NULL DEFAULT 0,
  `comment` varchar(255) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_fraction_storage_logs_created` (`fraction_id`,`created_at`),
  KEY `idx_fraction_storage_logs_actor` (`fraction_id`,`actor_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `ghetto_capture_kills` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `capture_id` bigint(20) NOT NULL,
  `killer_uuid` bigint(20) DEFAULT NULL,
  `victim_uuid` bigint(20) DEFAULT NULL,
  `killer_fraction_id` int(11) NOT NULL,
  `victim_fraction_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_ghetto_kills_capture` (`capture_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `hwid_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `account_id` int(11) NOT NULL,
  `old_hwid` varchar(128) DEFAULT NULL,
  `new_hwid` varchar(128) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `date` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_hwid_logs_account` (`account_id`),
  KEY `idx_hwid_logs_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `money_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'system',
  `action` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'change',
  `currency` enum('cash','bank','fraction_balance','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cash',
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `balance_before` decimal(15,2) DEFAULT NULL,
  `balance_after` decimal(15,2) DEFAULT NULL,
  `actor_uuid` bigint(20) DEFAULT NULL,
  `actor_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_uuid` bigint(20) DEFAULT NULL,
  `target_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_id` bigint(20) DEFAULT NULL,
  `fraction_id` int(11) DEFAULT NULL,
  `comment` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_money_logs_created` (`created_at`),
  KEY `idx_money_logs_target` (`target_uuid`,`created_at`),
  KEY `idx_money_logs_actor` (`actor_uuid`,`created_at`),
  KEY `idx_money_logs_source` (`source`,`created_at`),
  KEY `idx_money_logs_currency` (`currency`,`created_at`),
  KEY `idx_money_logs_fraction` (`fraction_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `player_session_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `account_id` int(11) DEFAULT NULL,
  `character_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `player_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `social_club` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hwid` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_admin` tinyint(1) DEFAULT 0,
  `reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_uuid` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_player_session_created` (`created_at`),
  KEY `idx_player_session_character` (`character_uuid`,`created_at`),
  KEY `idx_player_session_event` (`event_type`,`created_at`),
  KEY `idx_player_session_admin` (`is_admin`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE `schema_migrations` (
  `migration_key` varchar(128) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`migration_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `server_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `type` varchar(64) NOT NULL DEFAULT 'system',
  `level` varchar(32) NOT NULL DEFAULT 'info',
  `player_uuid` bigint(20) DEFAULT NULL,
  `player_name` varchar(128) DEFAULT NULL,
  `message` text NOT NULL,
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_level` (`level`),
  KEY `idx_player_uuid` (`player_uuid`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4;
