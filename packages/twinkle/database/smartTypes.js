function resolveColumnType(column) {
  const name = String(column || "").toLowerCase().trim();

  if (name === "id") return "INT NOT NULL AUTO_INCREMENT PRIMARY KEY";

  if (name === "uuid") return "INT NOT NULL DEFAULT 0";

  if (name.endsWith("_id")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("character")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("uuid")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("id")) return "INT NOT NULL DEFAULT 0";

  if (name.includes("age")) return "INT NOT NULL DEFAULT 18";
  if (name.includes("level")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("rank")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("admin")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("money")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("cash")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("bank")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("price")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("count")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("amount")) return "INT NOT NULL DEFAULT 0";
  if (name.includes("reward")) return "INT NOT NULL DEFAULT 0";

  if (name.includes("weight")) return "FLOAT NOT NULL DEFAULT 0";
  if (name.includes("health")) return "FLOAT NOT NULL DEFAULT 100";
  if (name.includes("armor")) return "FLOAT NOT NULL DEFAULT 0";

  if (name.startsWith("is_")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.startsWith("has_")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("enabled")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("locked")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("muted")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("banned")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("remember")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("whitelist")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("used")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("active")) return "TINYINT(1) NOT NULL DEFAULT 0";
  if (name.includes("dirty")) return "TINYINT(1) NOT NULL DEFAULT 0";

  if (name.includes("date")) return "DATETIME NULL";
  if (name.includes("time")) return "DATETIME NULL";
  if (name.includes("created")) return "DATETIME NULL";
  if (name.includes("updated")) return "DATETIME NULL";
  if (name.includes("expires")) return "DATETIME NULL";
  if (name.includes("last_play")) return "DATETIME NULL";
  if (name.includes("lastlogin")) return "DATETIME NULL";

  if (name.includes("json")) return "LONGTEXT NULL";
  if (name.includes("data")) return "LONGTEXT NULL";
  if (name.includes("logs")) return "LONGTEXT NULL";
  if (name.includes("inventory")) return "LONGTEXT NULL";
  if (name.includes("items")) return "LONGTEXT NULL";
  if (name.includes("appearance")) return "LONGTEXT NULL";
  if (name.includes("customization")) return "LONGTEXT NULL";
  if (name.includes("clothes")) return "LONGTEXT NULL";
  if (name.includes("roommates")) return "LONGTEXT NULL";
  if (name.includes("metadata")) return "LONGTEXT NULL";

  if (name.includes("password")) return "VARCHAR(255) DEFAULT NULL";
  if (name.includes("email")) return "VARCHAR(255) DEFAULT NULL";
  if (name.includes("login")) return "VARCHAR(64) DEFAULT NULL";
  if (name.includes("username")) return "VARCHAR(32) DEFAULT NULL";
  if (name.includes("lastname")) return "VARCHAR(32) DEFAULT NULL";
  if (name.includes("firstname")) return "VARCHAR(32) DEFAULT NULL";
  if (name.includes("gender")) return "VARCHAR(16) NOT NULL DEFAULT 'male'";
  if (name.includes("name")) return "VARCHAR(64) DEFAULT NULL";
  if (name.includes("reason")) return "VARCHAR(255) DEFAULT NULL";
  if (name.includes("promo")) return "VARCHAR(50) DEFAULT NULL";
  if (name.includes("social")) return "VARCHAR(128) DEFAULT NULL";
  if (name.includes("hwid")) return "VARCHAR(255) DEFAULT NULL";
  if (name.includes("serial")) return "VARCHAR(255) DEFAULT NULL";
  if (name.includes("ip")) return "VARCHAR(100) DEFAULT NULL";
  if (name.includes("url")) return "VARCHAR(255) DEFAULT NULL";
  if (name.includes("model")) return "VARCHAR(100) DEFAULT NULL";
  if (name.includes("avatar")) return "VARCHAR(255) DEFAULT NULL";
  if (name.includes("code")) return "VARCHAR(100) DEFAULT NULL";
  if (name.includes("type")) return "VARCHAR(64) DEFAULT NULL";

  if (name === "x") return "FLOAT NOT NULL DEFAULT 0";
  if (name === "y") return "FLOAT NOT NULL DEFAULT 0";
  if (name === "z") return "FLOAT NOT NULL DEFAULT 0";
  if (name.includes("pos")) return "FLOAT NOT NULL DEFAULT 0";
  if (name.includes("rotation")) return "FLOAT NOT NULL DEFAULT 0";
  if (name.includes("heading")) return "FLOAT NOT NULL DEFAULT 0";

  return "VARCHAR(255) DEFAULT NULL";
}

module.exports = {
  resolveColumnType,
};