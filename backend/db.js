import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = process.env.DB_PATH || './voiceshield.db';

// Ensure the directory for the database exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Enable verbose mode for easier debugging
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath, (err) => {
    if (err) {
        console.error("Failed to connect to SQLite database:", err.message);
    } else {
        console.log("Connected to SQLite database at:", dbPath);
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Create incidents table
        db.run(`
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                filename TEXT NOT NULL,
                result TEXT NOT NULL,
                synthetic_probability REAL NOT NULL,
                real_probability REAL NOT NULL,
                confidence REAL NOT NULL,
                risk_level TEXT NOT NULL,
                model_name TEXT NOT NULL,
                model_version TEXT NOT NULL,
                processing_time_ms INTEGER NOT NULL,
                notes TEXT,
                is_demo INTEGER NOT NULL DEFAULT 0,
                explanation TEXT,
                recommended_action TEXT
            )
        `);

        // Create voice references table (for verification reference voice registration)
        db.run(`
            CREATE TABLE IF NOT EXISTS voice_references (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                filepath TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);
    });
}

// Wrapper utility functions for database promises
export const dbRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve({ lastID: this.lastID, changes: this.changes });
            }
        });
    });
};

export const dbGet = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

export const dbAll = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

// Repository service layer functions
export const IncidentRepository = {
    async create(incident) {
        const query = `
            INSERT INTO incidents (
                id, timestamp, filename, result, synthetic_probability, 
                real_probability, confidence, risk_level, model_name, 
                model_version, processing_time_ms, notes, is_demo, explanation, recommended_action
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await dbRun(query, [
            incident.id,
            incident.timestamp,
            incident.filename,
            incident.result,
            incident.synthetic_probability,
            incident.real_probability,
            incident.confidence,
            incident.risk_level,
            incident.model_name,
            incident.model_version,
            incident.processing_time_ms,
            incident.notes || null,
            incident.is_demo ? 1 : 0,
            incident.explanation || null,
            incident.recommended_action || null
        ]);
        return incident;
    },

    async list({ includeDemo = true } = {}) {
        const query = includeDemo 
            ? `SELECT * FROM incidents ORDER BY timestamp DESC`
            : `SELECT * FROM incidents WHERE is_demo = 0 ORDER BY timestamp DESC`;
        const rows = await dbAll(query);
        return rows.map(row => ({
            ...row,
            is_demo: !!row.is_demo
        }));
    },

    async getById(id) {
        const row = await dbGet(`SELECT * FROM incidents WHERE id = ?`, [id]);
        if (!row) return null;
        return {
            ...row,
            is_demo: !!row.is_demo
        };
    },

    async delete(id) {
        const result = await dbRun(`DELETE FROM incidents WHERE id = ?`, [id]);
        return result.changes > 0;
    },

    async updateExplanation(id, explanation) {
        await dbRun(`UPDATE incidents SET explanation = ? WHERE id = ?`, [explanation, id]);
    },

    async getStats({ includeDemo = true } = {}) {
        const condition = includeDemo ? "" : "WHERE is_demo = 0";
        
        const countQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
                SUM(CASE WHEN risk_level = 'medium' THEN 1 ELSE 0 END) as medium_risk,
                SUM(CASE WHEN risk_level = 'low' THEN 1 ELSE 0 END) as low_risk,
                AVG(synthetic_probability) as avg_synth_prob,
                AVG(processing_time_ms) as avg_processing_time
            FROM incidents
            ${condition}
        `;
        const stats = await dbGet(countQuery);
        
        return {
            total: stats.total || 0,
            highRisk: stats.high_risk || 0,
            mediumRisk: stats.medium_risk || 0,
            lowRisk: stats.low_risk || 0,
            averageSyntheticProbability: Math.round((stats.avg_synth_prob || 0) * 100) / 100,
            averageProcessingTimeMs: Math.round(stats.avg_processing_time || 0)
        };
    }
};

export const VoiceReferenceRepository = {
    async register(id, name, filepath) {
        const query = `
            INSERT INTO voice_references (id, name, filepath, created_at)
            VALUES (?, ?, ?, ?)
        `;
        const timestamp = Date.now();
        await dbRun(query, [id, name, filepath, timestamp]);
        return { id, name, filepath, created_at: timestamp };
    },

    async list() {
        return await dbAll(`SELECT * FROM voice_references ORDER BY created_at DESC`);
    },

    async getById(id) {
        return await dbGet(`SELECT * FROM voice_references WHERE id = ?`, [id]);
    }
};
