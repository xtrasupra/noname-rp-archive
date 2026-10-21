"use strict";

const mysql = require("mysql2/promise");
const config = require("./config.js");

const ADMIN_DATABASE_NAME = "twinkle_admin";
const DATABASE_NAME_PATTERN = /^[a-zA-Z0-9_]+$/;

let bootstrapPromise = null;

function normalizeDatabaseName(value, label) {
  const name = String(value || "").trim();
  if (!name || !DATABASE_NAME_PATTERN.test(name)) {
    throw new Error(`[DATABASE BOOTSTRAP] ${label} must contain only letters, numbers, and underscores.`);
  }
  return name;
}

function getRequiredDatabaseNames(databaseConfig = config) {
  return Array.from(new Set([
    normalizeDatabaseName(databaseConfig?.database?.database || "twinklerp", "DB_NAME"),
    normalizeDatabaseName(databaseConfig?.logsDatabase?.database || "twinklelogs", "LOGS_DB_NAME"),
    ADMIN_DATABASE_NAME,
  ]));
}

async function createRequiredDatabases(databaseConfig = config, createConnection = mysql.createConnection) {
  const connectionConfig = databaseConfig?.bootstrapAdmin || databaseConfig?.database || {};
  const applicationConfig = databaseConfig?.database || {};
  const connection = await createConnection({
    host: connectionConfig.host || "127.0.0.1",
    port: Number(connectionConfig.port || 3306),
    user: connectionConfig.user || "root",
    password: connectionConfig.password || "",
    charset: "utf8mb4",
    connectTimeout: 15_000,
  });
  const databaseNames = getRequiredDatabaseNames(databaseConfig);

  try {
    for (const databaseName of databaseNames) {
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    }
    if (String(connectionConfig.user || "") !== String(applicationConfig.user || "")) {
      const applicationUser = String(applicationConfig.user || "");
      const applicationHost = String(process.env.DB_USER_HOST || "%");
      if (!/^[a-zA-Z0-9_.@-]+$/.test(applicationUser) || !/^[a-zA-Z0-9_.:%-]+$/.test(applicationHost)) {
        throw new Error("[DATABASE BOOTSTRAP] DB_USER or DB_USER_HOST contains unsupported characters.");
      }
      await connection.query(
        `CREATE USER IF NOT EXISTS '${applicationUser}'@'${applicationHost}' IDENTIFIED BY ${mysql.escape(String(applicationConfig.password || ""))}`
      );
      for (const databaseName of databaseNames) {
        await connection.query(`GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO '${applicationUser}'@'${applicationHost}'`);
      }
    }
  } finally {
    await connection.end();
  }

  return databaseNames;
}

async function runDatabaseBootstrap() {
  const databaseNames = await createRequiredDatabases();

  // These modules create their pools with a selected database, so require
  // them only after all database names exist.
  const mainDatabase = require("./index.js");
  const logsDatabase = require("./logs.js");
  const queries = require("./query.js");

  await mainDatabase.initDatabase();
  await logsDatabase.initLogsDatabase();
  await mainDatabase.withConn(async (connection) => {
    await queries.ensureBansSchema(connection);
    await queries.ensureWhitelistSchema(connection);
    await connection.query(
      "INSERT INTO twinkle_admin.admin_whitelist_settings (id, enabled) VALUES (1, 0) ON DUPLICATE KEY UPDATE id = id"
    );
  });
  await require("../systems/business/business.repository.js").ensureSchema();

  console.log(`[DATABASE BOOTSTRAP] Ready: ${databaseNames.join(", ")}`);
  return databaseNames;
}

function initializeDatabases() {
  if (!bootstrapPromise) {
    bootstrapPromise = runDatabaseBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

module.exports = {
  ADMIN_DATABASE_NAME,
  createRequiredDatabases,
  getRequiredDatabaseNames,
  initializeDatabases,
  normalizeDatabaseName,
};
