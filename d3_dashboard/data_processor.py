import pandas as pd
from typing import Dict, List, Tuple
from datetime import datetime, timedelta

# Time scaling constants (in seconds)
HOUR = 3600
DAY = 24 * HOUR
WEEK = 7 * DAY
MONTH = 30 * DAY
QUARTER = 90 * DAY
YEAR = 365 * DAY

def get_time_period_range(time_period: str, current_time: float) -> Tuple[float, float]:
    """Get the time range for the specified period."""
    if time_period == 'day':
        return (current_time - DAY, current_time)
    elif time_period == 'week':
        return (current_time - WEEK, current_time)
    elif time_period == 'month':
        return (current_time - MONTH, current_time)
    elif time_period == 'quarter':
        return (current_time - QUARTER, current_time)
    elif time_period == 'year':
        return (current_time - YEAR, current_time)
    else:
        return (0, current_time)

def filter_station_history(station, start_time: float, end_time: float) -> List[Dict]:
    """Filter station history for the given time range."""
    return [event for event in station.status_history 
            if start_time <= event['timestamp'] <= end_time]

def calculate_overall_production(factory, simulation_time: float, time_period: str = None) -> Tuple[int, float]:
    if time_period:
        start_time, end_time = get_time_period_range(time_period, simulation_time)
        # Filter production data based on time period
        # This is a simplified version - in a real implementation, you would track production timestamps
        total_production = factory.total_produced
        production_rate = total_production / ((end_time - start_time) / HOUR)  # Convert to per hour
    else:
        total_production = factory.total_produced
        production_rate = total_production / (simulation_time / HOUR)  # Convert to per hour
    return total_production, production_rate

def calculate_workstation_occupancy(factory, simulation_time: float, time_period: str = None) -> Dict[int, float]:
    occupancy_rates = {}
    if time_period:
        start_time, end_time = get_time_period_range(time_period, simulation_time)
        time_range = end_time - start_time
    else:
        time_range = simulation_time
    
    for station in factory.stations:
        if time_period:
            # Filter station history for the time period
            filtered_history = filter_station_history(station, start_time, end_time)
            # Calculate occupancy based on filtered history
            operational_time = sum(event['timestamp'] - filtered_history[i-1]['timestamp'] 
                                 for i, event in enumerate(filtered_history[1:], 1) 
                                 if event['status'] == 'Operational')
            occupancy_rate = operational_time / time_range
        else:
            occupancy_rate = station.busy_time / time_range
        occupancy_rates[station.station_id] = occupancy_rate
    return occupancy_rates

def calculate_average_waiting_time(factory, time_period: str = None) -> Dict[int, float]:
    avg_waiting_times = {}
    
    for station in factory.stations:
        if station.station_id == 1:  # Skip first station as per requirements
            continue
            
        if time_period:
            # For time period filtering, we need to look at the status history
            start_time, end_time = get_time_period_range(time_period, factory._env.now)
            filtered_history = filter_station_history(station, start_time, end_time)
            
            # Calculate waiting time from status changes
            total_wait_time = 0
            wait_start = None
            
            for event in filtered_history:
                if event['status'] == 'Waiting' and wait_start is None:
                    wait_start = event['timestamp']
                elif event['status'] != 'Waiting' and wait_start is not None:
                    total_wait_time += event['timestamp'] - wait_start
                    wait_start = None
            
            # Handle case where station is still waiting at end of period
            if wait_start is not None:
                total_wait_time += end_time - wait_start
                
            # Convert to hours
            avg_wait = total_wait_time / HOUR
        else:
            # For overall average, use the accumulated waiting time
            if factory.num_waits > 0:
                avg_wait = station.total_waiting_time / factory.num_waits / HOUR
            else:
                avg_wait = 0.0
                
        avg_waiting_times[station.station_id] = avg_wait
        
    return avg_waiting_times

def get_workstation_status_partition(factory, time_intervals: List[Tuple[float, float]], time_period: str = None) -> Dict[int, Dict[str, float]]:
    status_partitions = {}
    
    if time_period:
        start_time, end_time = get_time_period_range(time_period, factory._env.now)
        time_range = end_time - start_time
    else:
        time_range = sum(end - start for start, end in time_intervals)
    
    for station in factory.stations:
        station_status = {
            'Operational': 0.0,
            'Down': 0.0,
            'Waiting for restock': 0.0
        }
        
        if time_period:
            # Filter station history for the time period
            filtered_history = filter_station_history(station, start_time, end_time)
            
            # Calculate time spent in each state
            for i, event in enumerate(filtered_history[1:], 1):
                duration = event['timestamp'] - filtered_history[i-1]['timestamp']
                status = filtered_history[i-1]['status']
                station_status[status] += duration
            
            # Normalize by total time
            for status in station_status:
                station_status[status] /= time_range
        else:
            # Calculate operational time (busy time)
            station_status['Operational'] = station.busy_time / time_range
            
            # Calculate downtime
            station_status['Down'] = station.total_downtime / time_range
            
            # Calculate waiting for restock time
            station_status['Waiting for restock'] = station.restocking_time / time_range
        
        status_partitions[station.station_id] = station_status
    
    return status_partitions
