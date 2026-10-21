-- Safe bootstrap for the current TWinkleRP build.
-- The application creates and migrates tables itself via smartSync.
-- This file only ensures the databases exist before the server starts.

CREATE DATABASE IF NOT EXISTS `twinklerp`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `twinklelogs`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `twinkle_admin`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
