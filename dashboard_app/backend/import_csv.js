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

const rows = [];

fs.createReadStream("./FACT_QUALITY_MATERIAL_MOVEMENT_202606301725.csv")
    .pipe(csv())
    .on("data", (row) => rows.push(row))
    .on("end", async () => {
        console.log(`Loaded ${rows.length} rows`);

        for (const r of rows) {
            await pool.query(
                `
        INSERT INTO FACT_QUALITY_MATERIAL_MOVEMENT(
          MOVEMENT_TYPE,
          MATERIAL_KEY,
          MATERIAL_DOC_NO,
          MATERIAL_DOC_YEAR,
          BATCH_ID_KEY,
          QUANTITY,
          UNIT_OF_ENTRY,
          AMOUNT_IN_LC,
          SENDER_STORAGE_LOCATION_KEY,
          SENDER_PLANT_KEY,
          RECEIVING_STORAGE_LOCATION_KEY,
          RECEIVING_PLANT_KEY,
          POSTING_DATE_KEY,
          ENTRY_DATE_KEY,
          ENTRY_TIME,
          USERNAME,
          SALES_ORDER_KEY,
          SALES_ORDER_ITEM,
          QTY_TRANSACTION,
          PRODUCTION_ORDER_NO,
          NET_WEIGHT,
          UNIT_OF_MEASUREMENT,
          BASE_UNIT_OF_MEASURE,
          QTY_IN_UNIT_OF_ENTRY,
          PURCHASE_ORDER,
          PURCHASE_ORDER_ITEM
        )
        VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26
        )
        `,
                [
                    r.MOVEMENT_TYPE,
                    r.MATERIAL_KEY,
                    r.MATERIAL_DOC_NO,
                    r.MATERIAL_DOC_YEAR,
                    r.BATCH_ID_KEY,
                    r.QUANTITY,
                    r.UNIT_OF_ENTRY,
                    r.AMOUNT_IN_LC,
                    r.SENDER_STORAGE_LOCATION_KEY,
                    r.SENDER_PLANT_KEY,
                    r.RECEIVING_STORAGE_LOCATION_KEY,
                    r.RECEIVING_PLANT_KEY,
                    r.POSTING_DATE_KEY,
                    r.ENTRY_DATE_KEY,
                    r.ENTRY_TIME,
                    r.USERNAME,
                    r.SALES_ORDER_KEY,
                    r.SALES_ORDER_ITEM,
                    r.QTY_TRANSACTION,
                    r.PRODUCTION_ORDER_NO,
                    r.NET_WEIGHT,
                    r.UNIT_OF_MEASUREMENT,
                    r.BASE_UNIT_OF_MEASURE,
                    r.QTY_IN_UNIT_OF_ENTRY,
                    r.PURCHASE_ORDER,
                    r.PURCHASE_ORDER_ITEM,
                ]
            );
        }

        console.log("Import Complete!");
        await pool.end();
    });