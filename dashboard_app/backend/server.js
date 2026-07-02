const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'https://your-vercel-app.vercel.app' }));


const csvFilePath = path.join(__dirname, '../../merged_dashboard_data.csv');

app.get('/api/data', (req, res) => {
  const results = [];

  fs.createReadStream(csvFilePath)
    .pipe(csv())
    .on('data', (data) => {
      // Clean up fields if needed
      results.push({
        date: data.POSTING_DATE_KEY,
        movementType: data.MOVEMENT_TYPE,
        quantity: parseFloat(data.QUANTITY) || 0,
        plantName: data.SENDER_PLANT_NAME,
        city: data.SENDER_PLANT_CITY,
        material: data.MATERIAL_KEY
      });
    })
    .on('end', () => {
      // Send the raw data, frontend will aggregate it for interactive charts
      res.json(results);
    })
    .on('error', (error) => {
      res.status(500).json({ error: 'Failed to read data' });
    });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
