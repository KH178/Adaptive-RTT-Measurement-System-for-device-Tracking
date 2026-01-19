import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrackerData } from '../types';

type AvailabilityStatus = 'Online' | 'Offline' | 'Standby' | 'Calibrating...';

const getStatusFillColor = (status: AvailabilityStatus | string) => {
    switch (status) {
        case 'Online': return '#22c55e';
        case 'Standby': return '#f59e0b';
        case 'OFFLINE': return '#ef4444'; // Note: The state is often 'OFFLINE'
        case 'Offline': return '#ef4444';
        default: return '#6b7280';
    }
};

interface AvailabilityGraphProps {
  // This component can now accept the richer TrackerData[]
  data: TrackerData[];
}

const AvailabilityGraph: React.FC<AvailabilityGraphProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="w-full min-h-48 h-64 sm:h-80 md:h-96 bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-center">
        <p className="text-gray-400">No availability data yet.</p>
      </div>
    );
  }

  const yValue = 1; // Plot all points on a single horizontal line

  const dayStart = new Date(data[0].timestamp);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(data[0].timestamp);
  dayEnd.setHours(23, 59, 59, 999);

  return (
    <div className="w-full min-h-48 h-64 sm:h-80 md:h-96 bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <h3 className="text-gray-700 font-medium mb-4">Daily Availability</h3>
        <ResponsiveContainer width="100%" height="90%">
            <ScatterChart
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            >
                <CartesianGrid stroke="#f0f0f0" />
                <XAxis 
                    type="number" 
                    dataKey="timestamp" 
                    name="Time"
                    domain={[dayStart.getTime(), dayEnd.getTime()]}
                    tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                    stroke="#a0a0a0"
                />
                <YAxis 
                    type="number" 
                    dataKey={() => yValue} 
                    name="Status" 
                    domain={[0, 2]} 
                    tick={false} 
                    axisLine={false} 
                />
                <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                            const dataPoint = payload[0].payload as TrackerData;
                            return (
                                <div className="p-2 bg-white rounded-lg shadow-lg border">
                                    <p className="font-semibold" style={{ color: getStatusFillColor(dataPoint.state) }}>
                                        {`State: ${dataPoint.state}`}
                                    </p>
                                    <p className="text-sm text-gray-600">{`Time: ${new Date(dataPoint.timestamp).toLocaleString()}`}</p>
                                    {dataPoint.rtt && <p className="text-sm text-gray-600">{`RTT: ${dataPoint.rtt}ms`}</p>}
                                </div>
                            );
                        }
                        return null;
                    }}
                />
                <Scatter name="Status Points" data={data}>
                    {data.map((entry, index) => (
                        <Cell 
                            key={`cell-${index}`} 
                            fill={getStatusFillColor(entry.state)} 
                        />
                    ))}
                </Scatter>
            </ScatterChart>
        </ResponsiveContainer>
    </div>
  );
};

export default AvailabilityGraph;