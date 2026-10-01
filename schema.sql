-- ============================================================
-- Skema Database MySQL untuk Whusnet OLT Pro / Web Aktivasi
-- Nama Database : web_aktivasi
-- User          : whusnet_web_aktivasi
-- Password      : Strategi*1
-- Host          : localhost
-- ============================================================

CREATE DATABASE IF NOT EXISTS `web_aktivasi` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `web_aktivasi`;

-- 1. Tabel OLT Configs
CREATE TABLE IF NOT EXISTS `olt_configs` (
  `id` VARCHAR(100) NOT NULL,
  `code` TEXT NOT NULL,
  `username` VARCHAR(100) DEFAULT '',
  `password` VARCHAR(100) DEFAULT '',
  `subtabs` JSON,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tabel Templates
CREATE TABLE IF NOT EXISTS `templates` (
  `name` VARCHAR(100) NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tabel Shortcuts
CREATE TABLE IF NOT EXISTS `shortcuts` (
  `name` VARCHAR(100) NOT NULL,
  `body` MEDIUMTEXT NOT NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'ZTE C320',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Tabel Speed Profiles
CREATE TABLE IF NOT EXISTS `speed_profiles` (
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Tabel Users
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(100) NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `password` VARCHAR(100) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'operator',
  `createdAt` VARCHAR(50),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Data Akun Admin Bawaan
INSERT IGNORE INTO `users` (`id`, `username`, `name`, `password`, `role`, `createdAt`)
VALUES ('1', 'admin', 'Administrator', 'admin', 'admin', '2026-09-30T00:00:00.000Z');
