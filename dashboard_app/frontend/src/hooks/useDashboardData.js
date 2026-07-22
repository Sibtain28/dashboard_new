
import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  normalizeDashboardRows,
  parseDateString,
  truncateString,
  createChartOptions
} from '../utils/dashboardUtils';

const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useDashboardData(filters = {}) {
  const { plant: filterPlant = 'All', city: filterCity = 'All', dateRange: filterDateRange = 'All' } = filters;
  
  const [rawData, setRawData] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [filterOptions, setFilterOptions] = useState({ plants: [], cities: [] });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    axios.get(`${apiBaseUrl}/api/filter-options`)
      .then(res => {
        setFilterOptions({
          plants: Array.isArray(res.data?.plants) ? res.data.plants.filter(Boolean).sort() : [],
          cities: Array.isArray(res.data?.cities) ? res.data.cities.filter(Boolean).sort() : [],
        });
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('dateRange', filterDateRange);
    if (filterPlant !== 'All') params.set('plant', filterPlant);
    if (filterCity !== 'All') params.set('city', filterCity);

    setLoading(true);
    axios.get(`${apiBaseUrl}/api/data?${params.toString()}`)
      .then(res => {
        setRawData(normalizeDashboardRows(res.data));
        setLoading(false);
        setLastUpdated(new Date().toLocaleString());
      })
      .catch(err => {
        console.error('Error fetching data', err);
        setLoading(false);
      });
  }, [filterPlant, filterCity, filterDateRange]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('dateRange', filterDateRange);
    if (filterPlant !== 'All') params.set('plant', filterPlant);
    if (filterCity !== 'All') params.set('city', filterCity);

    axios.get(`${apiBaseUrl}/api/trend?${params.toString()}`)
      .then((res) => {
        const normalizedRows = Array.isArray(res.data)
          ? res.data.map((row) => ({
              date: String(row.date || ''),
              generation: Number(row.generation || 0),
              consumption: Number(row.consumption || 0),
            })).sort((a, b) => String(a.date).localeCompare(String(b.date)))
          : [];
        setTrendRows(normalizedRows);
      })
      .catch(console.error);
  }, [filterPlant, filterCity, filterDateRange]);

  const latestDateStr = useMemo(() => {
    if (rawData.length === 0) return null;
    const dates = rawData.map(d => d.date).sort();
    return dates[dates.length - 1];
  }, [rawData]);

  const filteredData = useMemo(() => {
    return rawData.filter(d => {
      const pName = d.plantName || d.plantKey;
      const matchPlant = filterPlant === 'All' || pName === filterPlant;
      const matchCity = filterCity === 'All' || d.city === filterCity;

      let matchDate = true;
      if (filterDateRange !== 'All' && latestDateStr) {
        const latestY = parseInt(latestDateStr.slice(0, 4));
        const latestM = parseInt(latestDateStr.slice(4, 6)) - 1;
        const latestD = parseInt(latestDateStr.slice(6, 8));
        const latestDateObj = new Date(latestY, latestM, latestD);

        const curY = parseInt(d.date.slice(0, 4));
        const curM = parseInt(d.date.slice(4, 6)) - 1;
        const curD = parseInt(d.date.slice(6, 8));
        const curDateObj = new Date(curY, curM, curD);

        if (filterDateRange === '7D') {
          const sevenDaysAgo = new Date(latestDateObj);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          matchDate = curDateObj >= sevenDaysAgo && curDateObj <= latestDateObj;
        } else if (filterDateRange === '30D') {
          const thirtyDaysAgo = new Date(latestDateObj);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          matchDate = curDateObj >= thirtyDaysAgo && curDateObj <= latestDateObj;
        } else if (filterDateRange === 'Month') {
          matchDate = curY === latestY && curM === latestM;
        } else if (filterDateRange === 'Year') {
          matchDate = curY === latestY;
        }
      }

      return matchPlant && matchCity && matchDate;
    });
  }, [rawData, filterPlant, filterCity, filterDateRange, latestDateStr]);

  const uniquePlants = useMemo(() => {
    const plants = filterOptions.plants.length ? filterOptions.plants : rawData.map(d => d.plantName || d.plantKey);
    return [...new Set(plants)].filter(Boolean).sort();
  }, [filterOptions.plants, rawData]);

  const uniqueCities = useMemo(() => {
    const cities = filterOptions.cities.length ? filterOptions.cities : rawData.map(d => d.city);
    return [...new Set(cities)].filter(Boolean).sort();
  }, [filterOptions.cities, rawData]);

  const genData = useMemo(() => filteredData.filter(d => ['101', '102'].includes(d.movementType)), [filteredData]);
  const conData = useMemo(() => filteredData.filter(d => ['261', '262'].includes(d.movementType)), [filteredData]);

  const totalGen = useMemo(() => genData.reduce((sum, d) => sum + d.quantity, 0), [genData]);
  const totalCon = useMemo(() => conData.reduce((sum, d) => sum + d.quantity, 0), [conData]);
  const netDiff = totalGen - totalCon;
  const uniqueGenPlants = useMemo(() => new Set(genData.map(d => d.plantName || d.plantKey)).size, [genData]);
  const uniqueConPlants = useMemo(() => new Set(conData.map(d => d.plantName || d.plantKey)).size, [conData]);

  const calculateTrend = (dataset) => {
    const groupedByDate = dataset.reduce((acc, curr) => {
      acc[curr.date] = (acc[curr.date] || 0) + curr.quantity;
      return acc;
    }, {});
    const dates = Object.keys(groupedByDate).sort();
    if (dates.length < 2) return { diff: 0, pct: 0, up: true };
    const current = groupedByDate[dates[dates.length - 1]];
    const previous = groupedByDate[dates[dates.length - 2]];
    const pct = previous === 0 ? 100 : ((current - previous) / previous) * 100;
    return { pct: pct.toFixed(1), up: pct >= 0 };
  };

  const genKpiTrend = useMemo(() => calculateTrend(genData), [genData]);
  const conKpiTrend = useMemo(() => calculateTrend(conData), [conData]);
  const netKpiTrend = { pct: (Math.abs((totalGen - totalCon) / (totalGen || 1)) * 100).toFixed(1), up: netDiff >= 0 };

  const plantTableConfig = useMemo(() => {
    switch (filterDateRange) {
      case '7D': return { generationLabel: 'Generation (7D)', consumptionLabel: 'Consumption (7D)' };
      case '30D': return { generationLabel: 'Generation (30D)', consumptionLabel: 'Consumption (30D)' };
      case 'Month': return { generationLabel: 'Generation MTD', consumptionLabel: 'Consumption MTD' };
      case 'Year': return { generationLabel: 'Generation YTD', consumptionLabel: 'Consumption YTD' };
      default: return { generationLabel: 'Total Generation', consumptionLabel: 'Total Consumption' };
    }
  }, [filterDateRange]);

  const plantStats = useMemo(() => {
    if (!filteredData.length) return [];
    const statsMap = {};
    filteredData.forEach(d => {
      const pName = d.plantName || d.plantKey || 'Unknown';
      if (!statsMap[pName]) statsMap[pName] = { name: pName, generation: 0, consumption: 0 };
      if (['101', '102'].includes(d.movementType)) statsMap[pName].generation += d.quantity;
      if (['261', '262'].includes(d.movementType)) statsMap[pName].consumption += d.quantity;
    });
    return Object.values(statsMap).sort((a, b) => (b.generation + b.consumption) - (a.generation + a.consumption));
  }, [filteredData]);

  const dualTrendChart = useMemo(() => {
    const sortedRows = [...trendRows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return {
      labels: sortedRows.map(row => parseDateString(row.date)),
      datasets: [
        { label: 'Generation', data: sortedRows.map(r => r.generation), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 6 },
        { label: 'Consumption', data: sortedRows.map(r => r.consumption), borderColor: '#f43f5e', backgroundColor: 'rgba(244, 63, 94, 0.1)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0, pointHoverRadius: 6 }
      ]
    };
  }, [trendRows]);

  const processTopPlants = (dataset, color) => {
    const grouped = dataset.reduce((acc, curr) => {
      const name = curr.plantName || curr.plantKey || 'Unknown';
      acc[name] = (acc[name] || 0) + curr.quantity;
      return acc;
    }, {});
    const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 7);
    return {
      labels: sorted.map(s => truncateString(s[0], 12)),
      datasets: [{
        label: 'Volume',
        data: sorted.map(s => s[1]),
        fullLabels: sorted.map(s => s[0]),
        backgroundColor: `rgba(${color}, 0.8)`,
        hoverBackgroundColor: `rgb(${color})`,
        borderRadius: 6
      }]
    };
  };

  const genTopChart = useMemo(() => processTopPlants(genData, '16, 185, 129'), [genData]);
  const conTopChart = useMemo(() => processTopPlants(conData, '244, 63, 94'), [conData]);

  const regionalChart = useMemo(() => {
    const grouped = {};
    filteredData.forEach(d => {
      const city = d.city || 'Unknown';
      if (!grouped[city]) grouped[city] = { gen: 0, con: 0 };
      if (['101', '102'].includes(d.movementType)) grouped[city].gen += d.quantity;
      if (['261', '262'].includes(d.movementType)) grouped[city].con += d.quantity;
    });
    const sortedCities = Object.entries(grouped)
      .sort((a, b) => (b[1].gen + b[1].con) - (a[1].gen + a[1].con))
      .slice(0, 8);
    return {
      labels: sortedCities.map(c => c[0]),
      datasets: [
        { label: 'Generation', data: sortedCities.map(c => c[1].gen), backgroundColor: '#10b981', borderRadius: 4, barPercentage: 0.7 },
        { label: 'Consumption', data: sortedCities.map(c => c[1].con), backgroundColor: '#f43f5e', borderRadius: 4, barPercentage: 0.7 }
      ]
    };
  }, [filteredData]);

  const mTypeData = useMemo(() => {
    const totals = { '101': 0, '102': 0, '261': 0, '262': 0 };
    filteredData.forEach(d => {
      if (totals.hasOwnProperty(d.movementType)) totals[d.movementType] += d.quantity;
    });
    const mTypeTotal = Object.values(totals).reduce((sum, val) => sum + val, 0);
    const mTypeRows = [
      { type: '101', category: 'Generation', qty: totals['101'], color: '#10b981' },
      { type: '102', category: 'Generation', qty: totals['102'], color: '#10b981' },
      { type: '261', category: 'Consumption', qty: totals['261'], color: '#f43f5e' },
      { type: '262', category: 'Consumption', qty: totals['262'], color: '#f43f5e' },
    ];
    return { mTypeTotal, mTypeRows };
  }, [filteredData]);

  return {
    loading, lastUpdated, uniquePlants, uniqueCities,
    totalGen, genKpiTrend, totalCon, conKpiTrend, netDiff, netKpiTrend, uniqueGenPlants, uniqueConPlants,
    plantTableConfig, plantStats,
    dualTrendChart, genTopChart, conTopChart, regionalChart,
    mTypeTotal: mTypeData.mTypeTotal, mTypeRows: mTypeData.mTypeRows
  };
}
