from flask import Flask, render_template, jsonify
from main import Factory, YEAR
import simpy
import json
from datetime import datetime

app = Flask(__name__)

# Store simulation data globally
factory_data = None

def run_simulation():
    env = simpy.Environment()
    factory = Factory(env)
    env.run(until=YEAR)
    return factory

def process_factory_data(factory):
    # Get actual metrics from simulation
    total_production = factory.total_produced
    faulty_products = factory.faulty_products
    
    # Process production trend data from actual status history
    production_events = []
    for station in factory.stations:
        for event in station.status_history:
            if event['status'] == 'Operational':
                production_events.append({
                    'timestamp': event['timestamp'],
                    'station_id': station.station_id,
                    'production': 1
                })
    
    # Sort events by timestamp
    production_events.sort(key=lambda x: x['timestamp'])
    
    # Calculate cumulative production
    production_trend = []
    cumulative_production = 0
    for event in production_events:
        cumulative_production += 1
        production_trend.append({
            'timestamp': event['timestamp'],
            'production': 1,
            'cumulative_production': cumulative_production,
            'station_id': event['station_id']
        })
    
    # Calculate actual occupancy rates from simulation data
    occupancy_rates = {}
    for station in factory.stations:
        # Use actual busy time from simulation
        occupancy_rates[station.station_id] = station.busy_time / YEAR
    
    # Calculate actual waiting times from simulation data
    waiting_times = {}
    for station in factory.stations:
        if station.num_breakdowns > 0:
            # Use actual waiting time from simulation
            waiting_times[station.station_id] = station.total_waiting_time / station.num_breakdowns / 3600  # Convert to hours
        else:
            waiting_times[station.station_id] = 0
    
    # Calculate actual status partitions from simulation data
    status_partitions = {}
    for station in factory.stations:
        status_counts = {'Operational': 0, 'Down': 0, 'Waiting for restock': 0}
        for event in station.status_history:
            status_counts[event['status']] += 1
        
        total_events = sum(status_counts.values())
        if total_events > 0:
            status_partitions[station.station_id] = {
                status: count / total_events for status, count in status_counts.items()
            }
        else:
            status_partitions[station.station_id] = {
                'Operational': 0,
                'Down': 0,
                'Waiting for restock': 0
            }
    
    return {
        'total_production': total_production,
        'faulty_products': faulty_products,
        'production_trend': production_trend,
        'occupancy_rates': occupancy_rates,
        'waiting_times': waiting_times,
        'status_partitions': status_partitions,
        'stations': [{'station_id': s.station_id} for s in factory.stations]
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/factory-data')
def get_factory_data():
    global factory_data
    if factory_data is None:
        factory = run_simulation()
        factory_data = process_factory_data(factory)
    return jsonify(factory_data)

if __name__ == '__main__':
    # Run simulation once when server starts
    factory = run_simulation()
    factory_data = process_factory_data(factory)
    app.run(debug=True) 