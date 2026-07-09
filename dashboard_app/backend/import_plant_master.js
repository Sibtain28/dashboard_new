const fs = require("fs");
const csv = require("csv-parser");
const { Pool } = require("pg");

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "power_dashboard",
    password: "sibtain@2006",
    port: 5433,
});

const plantMasterCsvPath = "/Users/sibtainahmedqureshi/Downloads/Plant Master in SAP.XLSX - Sheet1.csv";

const rows = [];

async function run() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS plant_master (
            werks VARCHAR(50) PRIMARY KEY,
            name1 VARCHAR(255),
            ort01 VARCHAR(255)
        );
    `);
    
    await pool.query('TRUNCATE TABLE plant_master;');

    fs.createReadStream(plantMasterCsvPath)
        .pipe(csv())
        .on("data", (row) => rows.push(row))
        .on("end", async () => {
            console.log(`Loaded ${rows.length} plant master rows`);

            for (const r of rows) {
                const werks = (r.WERKS || '').trim();
                const name1 = (r.NAME1 || '').trim();
                const ort01 = (r.ORT01 || '').trim();
                
                if (werks) {
                    await pool.query(
                        `INSERT INTO plant_master(werks, name1, ort01) VALUES($1, $2, $3) ON CONFLICT (werks) DO NOTHING;`,
                        [werks, name1, ort01]
                    );
                }
            }

            console.log("Plant Master Import Complete!");
            await pool.end();
        });
}

run().catch(console.error);
