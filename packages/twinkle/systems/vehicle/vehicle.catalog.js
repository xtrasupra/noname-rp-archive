"use strict";

const db = require("../../database/query.js");

let schemaPromise = null;
let mutationTail = Promise.resolve();

function normalizeModel(value) {
    return String(value || "").trim().toLowerCase();
}

async function ensureSchema() {
    if (!schemaPromise) {
        schemaPromise = (async () => {
            await db.query(`
                CREATE TABLE IF NOT EXISTS vehicle_catalog (
                    id INT NOT NULL AUTO_INCREMENT,
                    model VARCHAR(100) NOT NULL,
                    display_name VARCHAR(128) NOT NULL,
                    real_name VARCHAR(128) NULL DEFAULT NULL,
                    class_name VARCHAR(64) NULL DEFAULT NULL,
                    gov_price INT NOT NULL DEFAULT 0,
                    fuel_type VARCHAR(32) NOT NULL DEFAULT 'petrol_95',
                    fuel_max INT NOT NULL DEFAULT 60,
                    fuel_consumption FLOAT NOT NULL DEFAULT 1,
                    trunk_slots INT NOT NULL DEFAULT 20,
                    trunk_max_weight INT NOT NULL DEFAULT 50,
                    max_mileage INT NOT NULL DEFAULT 500000,
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    PRIMARY KEY (id),
                    UNIQUE KEY uq_vehicle_catalog_model (model)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await db.withConn(async (connection) => {
                await connection.beginTransaction();
                try {
                    const [rows] = await connection.query(`
                        SELECT id, model, display_name, real_name, class_name, gov_price, enabled
                        FROM vehicle_catalog
                        ORDER BY id ASC
                        FOR UPDATE
                    `);
                    const groupedRows = new Map();
                    for (const row of Array.isArray(rows) ? rows : []) {
                        const model = normalizeModel(row?.model) || `legacy_unknown_${Number(row?.id || 0)}`;
                        if (!groupedRows.has(model)) groupedRows.set(model, []);
                        groupedRows.get(model).push(row);
                    }

                    for (const [model, duplicates] of groupedRows) {
                        const ranked = duplicates.sort((left, right) => (
                            Number(right.gov_price || 0) - Number(left.gov_price || 0) ||
                            Number(right.enabled || 0) - Number(left.enabled || 0) ||
                            Number(left.id || 0) - Number(right.id || 0)
                        ));
                        const canonical = ranked[0];
                        const redundantIds = ranked.slice(1).map((row) => Number(row.id)).filter(Boolean);
                        if (redundantIds.length > 0) {
                            await connection.query(
                                `DELETE FROM vehicle_catalog WHERE id IN (${redundantIds.map(() => "?").join(", ")})`,
                                redundantIds
                            );
                        }

                        const firstText = (field, fallback = null) => {
                            const value = ranked
                                .map((row) => String(row?.[field] || "").trim())
                                .find(Boolean);
                            return value || fallback;
                        };
                        await connection.query(
                            `UPDATE vehicle_catalog
                             SET model = ?, display_name = ?, real_name = ?, class_name = ?, gov_price = ?, enabled = ?
                             WHERE id = ?`,
                            [
                                model,
                                firstText("display_name", model.toUpperCase()),
                                firstText("real_name"),
                                firstText("class_name"),
                                ranked.reduce(
                                    (price, row) => Math.max(price, Math.max(0, Number(row.gov_price || 0))),
                                    0
                                ),
                                Number(canonical.enabled) ? 1 : 0,
                                canonical.id,
                            ]
                        );
                    }
                    await connection.commit();
                } catch (error) {
                    try { await connection.rollback(); } catch {}
                    throw error;
                }
            });

            await db.query(`
                ALTER TABLE vehicle_catalog
                MODIFY model VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
            `);

            const indexes = await db.query("SHOW INDEX FROM vehicle_catalog");
            const indexesByName = new Map();
            for (const index of Array.isArray(indexes) ? indexes : []) {
                const name = String(index?.Key_name || "");
                if (!indexesByName.has(name)) indexesByName.set(name, []);
                indexesByName.get(name).push(index);
            }
            const hasUniqueModelIndex = Array.from(indexesByName.values()).some((parts) => {
                const ordered = parts.sort((left, right) => Number(left.Seq_in_index) - Number(right.Seq_in_index));
                return ordered.length === 1 &&
                    Number(ordered[0].Non_unique) === 0 &&
                    String(ordered[0].Column_name || "").toLowerCase() === "model";
            });
            if (!hasUniqueModelIndex) {
                if (indexesByName.has("uq_vehicle_catalog_model")) {
                    await db.query("ALTER TABLE vehicle_catalog DROP INDEX uq_vehicle_catalog_model");
                }
                await db.query(`
                    ALTER TABLE vehicle_catalog
                    ADD UNIQUE KEY uq_vehicle_catalog_model (model)
                `);
            }
        })().catch((error) => {
            schemaPromise = null;
            throw error;
        });
    }

    return schemaPromise;
}

function queueMutation(operation) {
    const queued = mutationTail.catch(() => undefined).then(operation);
    mutationTail = queued;
    return queued;
}

function syncPersistedModels() {
    return queueMutation(async () => {
        await ensureSchema();
        await db.query(`
            INSERT INTO vehicle_catalog (model, display_name, real_name, class_name, gov_price, enabled)
            SELECT DISTINCT LOWER(TRIM(v.model)), UPPER(TRIM(v.model)), NULL, NULL, 0, 1
            FROM vehicles v
            WHERE v.model IS NOT NULL AND TRIM(v.model) <> ''
            ON DUPLICATE KEY UPDATE model = VALUES(model)
        `);
    });
}

function syncEntries(entries) {
    return queueMutation(async () => {
        await ensureSchema();
        const normalizedEntries = Array.from(new Map(
            (Array.isArray(entries) ? entries : [])
                .map((entry) => [normalizeModel(entry?.model), entry])
                .filter(([model]) => Boolean(model))
        ).entries());
        if (normalizedEntries.length === 0) return;

        const placeholders = normalizedEntries.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const params = normalizedEntries.flatMap(([model, entry]) => [
            model,
            String(entry.displayName || entry.name || model.toUpperCase()),
            String(entry.className || "") || null,
            Math.max(0, Math.floor(Number(entry.governmentPrice ?? entry.price ?? 0) || 0)),
            entry.enabled === false ? 0 : 1,
        ]);
        await db.query(
            `INSERT INTO vehicle_catalog (model, display_name, class_name, gov_price, enabled)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE
               display_name = VALUES(display_name),
               class_name = VALUES(class_name),
               gov_price = VALUES(gov_price),
               enabled = VALUES(enabled)`,
            params
        );
    });
}

function ensureModel(model) {
    const normalizedModel = normalizeModel(model);
    if (!normalizedModel) return Promise.reject(new Error("Vehicle model is required."));
    return queueMutation(async () => {
        await ensureSchema();
        await db.query(
            `INSERT INTO vehicle_catalog (model, display_name, gov_price, enabled)
             VALUES (?, ?, 0, 1)
             ON DUPLICATE KEY UPDATE model = VALUES(model)`,
            [normalizedModel, normalizedModel.toUpperCase()]
        );
    });
}

module.exports = {
    ensureSchema,
    ensureModel,
    syncPersistedModels,
    syncEntries,
};
