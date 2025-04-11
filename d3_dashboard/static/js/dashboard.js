// Theme colors
const THEME = {
    background: '#1a1a1a',
    text: '#ffffff',
    accent: '#00ff9d',
    secondary: '#00b8ff',
    card: '#2d2d2d',
    border: '#404040',
    warning: '#ff4d4d'
};

// Global variables
let factoryData = null;
let selectedTimePeriod = 'day'; // Default to day view
let selectedStations = new Set([1, 2, 3, 4, 5, 6]);

// Time period definitions in seconds (matching simulation time scale)
const TIME_PERIODS = {
    day: 24 * 3600,
    week: 7 * 24 * 3600,
    month: 30 * 24 * 3600,
    quarter: 90 * 24 * 3600,
    year: 365 * 24 * 3600
};

// Time format functions based on selected period
const TIME_FORMATTERS = {
    day: d3.timeFormat("%H:%M"),
    week: d3.timeFormat("%a %H:%M"),
    month: d3.timeFormat("%d %b"),
    quarter: d3.timeFormat("%b %d"),
    year: d3.timeFormat("%b")
};

// Filter data based on time period
function filterDataByTime(data) {
    if (!data || !data.production_trend || data.production_trend.length === 0) {
        console.warn('No production trend data available');
        return data;
    }

    // Get the latest timestamp in the data
    const latestTime = Math.max(...data.production_trend.map(d => d.timestamp));
    const periodDuration = TIME_PERIODS[selectedTimePeriod];
    const startTime = latestTime - periodDuration;
    
    // Filter production trend
    const filteredTrend = data.production_trend.filter(d => d.timestamp >= startTime);
    
    // Recalculate cumulative production for the filtered period
    let cumulative = 0;
    filteredTrend.forEach(d => {
        cumulative += d.production;
        d.cumulative_production = cumulative;
    });
    
    // Calculate occupancy rates and waiting times for the filtered period
    const filteredOccupancyRates = {};
    const filteredWaitingTimes = {};
    const filteredStatusPartitions = {};
    
    // Group events by station for the filtered period
    const stationEvents = {};
    
    filteredTrend.forEach(event => {
        const stationId = event.station_id;
        if (!stationEvents[stationId]) {
            stationEvents[stationId] = [];
        }
        stationEvents[stationId].push(event);
    });
    
    // Calculate metrics for each station
    data.stations.forEach(station => {
        const stationId = station.station_id;
        const events = stationEvents[stationId] || [];
        
        // Calculate occupancy rate
        const busyTime = events.length * 3600; // Assuming each event takes 1 hour
        filteredOccupancyRates[stationId] = busyTime / periodDuration;
        
        // Use the original waiting times and status partitions
        filteredWaitingTimes[stationId] = data.waiting_times[stationId] || 0;
        filteredStatusPartitions[stationId] = data.status_partitions[stationId] || {
            'Operational': 0,
            'Down': 0,
            'Waiting for restock': 0
        };
    });
    
    return {
        ...data,
        production_trend: filteredTrend,
        total_production: cumulative,
        faulty_products: Math.round(data.faulty_products * (filteredTrend.length / data.production_trend.length)),
        occupancy_rates: filteredOccupancyRates,
        waiting_times: filteredWaitingTimes,
        status_partitions: filteredStatusPartitions
    };
}

// Initialize the dashboard
async function initDashboard() {
    try {
        // Fetch data from the server
        const response = await fetch('/api/factory-data');
        factoryData = await response.json();
        
        // Initialize station toggles
        initStationToggles();
        
        // Set up time period selector
        const timePeriodSelect = document.getElementById('time-period');
        timePeriodSelect.value = selectedTimePeriod;
        timePeriodSelect.addEventListener('change', (e) => {
            selectedTimePeriod = e.target.value;
            updateDashboard();
        });
        
        // Initial render
        updateDashboard();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
    }
}

// Initialize station toggle checkboxes
function initStationToggles() {
    const container = document.getElementById('station-toggles');
    for (let i = 1; i <= 6; i++) {
        const div = document.createElement('div');
        div.className = 'station-toggle';
        div.innerHTML = `
            <input type="checkbox" id="station-${i}" checked>
            <label for="station-${i}">Station ${i}</label>
        `;
        div.querySelector('input').addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedStations.add(i);
            } else {
                selectedStations.delete(i);
            }
            updateDashboard();
        });
        container.appendChild(div);
    }
}

// Update all visualizations
function updateDashboard() {
    const filteredData = filterDataByTime(factoryData);
    updateMetrics(filteredData);
    updateProductionTrend(filteredData);
    updateOccupancyChart(filteredData);
    updateWaitingTimeChart(filteredData);
    updateStatusChart(filteredData);
}

// Update metrics display
function updateMetrics(data) {
    const totalProduction = data.total_production;
    const faultyRate = (data.faulty_products / (data.faulty_products + totalProduction)) * 100;
    
    document.getElementById('total-production').textContent = totalProduction;
    document.getElementById('faulty-rate').textContent = `${faultyRate.toFixed(2)}%`;
}

// Update production trend chart
function updateProductionTrend(data) {
    const container = d3.select('#production-trend');
    container.selectAll('*').remove();
    
    const margin = {top: 20, right: 20, bottom: 30, left: 50};
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Filter data based on selected stations
    const filteredData = data.production_trend.filter(d => 
        selectedStations.has(d.station_id)
    );
    
    if (filteredData.length === 0) return;
    
    // Create scales
    const x = d3.scaleTime()
        .domain(d3.extent(filteredData, d => new Date(d.timestamp * 1000)))
        .range([0, width]);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(filteredData, d => d.cumulative_production)])
        .range([height, 0]);
    
    // Add axes with time format based on selected period
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
            .tickFormat(TIME_FORMATTERS[selectedTimePeriod])
        )
        .style('color', THEME.text);
    
    svg.append('g')
        .call(d3.axisLeft(y))
        .style('color', THEME.text);
    
    // Add line
    svg.append('path')
        .datum(filteredData)
        .attr('fill', 'none')
        .attr('stroke', THEME.accent)
        .attr('stroke-width', 2)
        .attr('d', d3.line()
            .x(d => x(new Date(d.timestamp * 1000)))
            .y(d => y(d.cumulative_production))
        );
    
    // Add dots for each data point
    svg.selectAll('circle')
        .data(filteredData)
        .enter()
        .append('circle')
        .attr('cx', d => x(new Date(d.timestamp * 1000)))
        .attr('cy', d => y(d.cumulative_production))
        .attr('r', 3)
        .attr('fill', THEME.accent);
}

// Update occupancy chart
function updateOccupancyChart(data) {
    const container = d3.select('#occupancy-chart');
    container.selectAll('*').remove();
    
    const margin = {top: 20, right: 20, bottom: 30, left: 50};
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Filter data based on selected stations
    const filteredData = Object.entries(data.occupancy_rates)
        .filter(([station]) => selectedStations.has(parseInt(station)))
        .map(([station, rate]) => ({
            station: parseInt(station),
            rate: rate * 100
        }));
    
    if (filteredData.length === 0) return;
    
    // Create scales
    const x = d3.scaleBand()
        .domain(filteredData.map(d => d.station))
        .range([0, width])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, 100])
        .range([height, 0]);
    
    // Add axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .style('color', THEME.text);
    
    svg.append('g')
        .call(d3.axisLeft(y))
        .style('color', THEME.text);
    
    // Add bars
    svg.selectAll('rect')
        .data(filteredData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.station))
        .attr('y', d => y(d.rate))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.rate))
        .attr('fill', THEME.secondary);
    
    // Add value labels
    svg.selectAll('text')
        .data(filteredData)
        .enter()
        .append('text')
        .attr('x', d => x(d.station) + x.bandwidth() / 2)
        .attr('y', d => y(d.rate) - 5)
        .attr('text-anchor', 'middle')
        .style('fill', THEME.text)
        .text(d => `${d.rate.toFixed(1)}%`);
}

// Update waiting time chart
function updateWaitingTimeChart(data) {
    const container = d3.select('#waiting-time-chart');
    container.selectAll('*').remove();
    
    const margin = {top: 20, right: 20, bottom: 30, left: 50};
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Filter data based on selected stations
    const filteredData = Object.entries(data.waiting_times)
        .filter(([station]) => selectedStations.has(parseInt(station)))
        .map(([station, time]) => ({
            station: parseInt(station),
            time: time || 0
        }));
    
    if (filteredData.length === 0) return;
    
    // Create scales
    const x = d3.scaleBand()
        .domain(filteredData.map(d => d.station))
        .range([0, width])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(filteredData, d => d.time)])
        .range([height, 0]);
    
    // Add axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .style('color', THEME.text);
    
    svg.append('g')
        .call(d3.axisLeft(y))
        .style('color', THEME.text);
    
    // Add bars
    svg.selectAll('rect')
        .data(filteredData)
        .enter()
        .append('rect')
        .attr('x', d => x(d.station))
        .attr('y', d => y(d.time))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.time))
        .attr('fill', d => d.station === 3 ? THEME.warning : THEME.secondary);
    
    // Add value labels
    svg.selectAll('text')
        .data(filteredData)
        .enter()
        .append('text')
        .attr('x', d => x(d.station) + x.bandwidth() / 2)
        .attr('y', d => y(d.time) - 5)
        .attr('text-anchor', 'middle')
        .style('fill', THEME.text)
        .text(d => `${d.time.toFixed(1)}h`);
}

// Update status chart
function updateStatusChart(data) {
    const container = d3.select('#status-chart');
    container.selectAll('*').remove();
    
    const margin = {top: 20, right: 20, bottom: 30, left: 50};
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Filter data based on selected stations
    const filteredData = Object.entries(data.status_partitions)
        .filter(([station]) => selectedStations.has(parseInt(station)))
        .map(([station, statuses]) => ({
            station: parseInt(station),
            statuses: statuses
        }));
    
    if (filteredData.length === 0) return;
    
    // Create scales
    const x = d3.scaleBand()
        .domain(filteredData.map(d => d.station))
        .range([0, width])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, 1])
        .range([height, 0]);
    
    // Add axes
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .style('color', THEME.text);
    
    svg.append('g')
        .call(d3.axisLeft(y))
        .style('color', THEME.text);
    
    // Create color scale for statuses
    const colorScale = d3.scaleOrdinal()
        .domain(['Operational', 'Down', 'Waiting for restock'])
        .range([THEME.accent, THEME.warning, THEME.secondary]);
    
    // Create stacked bars
    const stack = d3.stack()
        .keys(['Operational', 'Down', 'Waiting for restock']);
    
    const stackedData = stack(filteredData.map(d => d.statuses));
    
    svg.selectAll('g')
        .data(stackedData)
        .enter()
        .append('g')
        .attr('fill', d => colorScale(d.key))
        .selectAll('rect')
        .data(d => d)
        .enter()
        .append('rect')
        .attr('x', (d, i) => x(filteredData[i].station))
        .attr('y', d => y(d[1]))
        .attr('height', d => y(d[0]) - y(d[1]))
        .attr('width', x.bandwidth());
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', initDashboard); 