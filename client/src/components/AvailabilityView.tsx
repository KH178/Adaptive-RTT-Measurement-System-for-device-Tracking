import React, { useState, useEffect, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
  LineChart,
  Line
} from "recharts";
import { Expand } from "lucide-react";
import { TrackerData, TrackerState } from "../types";
import { Platform } from "../types";
import { Socket } from "socket.io-client";

interface AvailabilityViewProps {
  data?: TrackerData[]; // Live data, optional now
  presence?: string | null;
  onExpand?: () => void;
  onHistoryExpand?: () => void;
  isExpanded?: boolean;
  // New props for historical mode
  socket?: Socket;
  jid?: string;
  platform?: Platform;
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
  if (seconds > 0 && hours === 0 && days === 0) parts.push(`${seconds}s`);

  return parts.join(" ") || "0s";
}

const getStatusColor = (status: TrackerState | string) => {
  switch (status) {
    case "Online":
      return "text-green-500";
    case "Standby":
      return "text-yellow-500";
    case "OFFLINE":
    case "Offline":
      return "text-red-500";
    case "Calibrating...":
      return "text-blue-500";
    default:
      return "text-gray-500";
  }
};

const getStatusFillColor = (status: TrackerState | string) => {
  switch (status) {
    case "Online":
      return "#22c55e";
    case "Standby":
      return "#f59e0b";
    case "OFFLINE":
    case "Offline":
      return "#ef4444";
    case "Calibrating...":
      return "#3b82f6";
    default:
      return "#6b7280";
  }
};

export function AvailabilityView({
  data: liveData = [],
  presence,
  onExpand,
  onHistoryExpand,
  isExpanded = false,
  socket,
  jid,
  platform,
}: AvailabilityViewProps) {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [historicalData, setHistoricalData] = useState<TrackerData[]>([]);

  // Fetch available dates when in expanded mode
  useEffect(() => {
    if (isExpanded && socket && jid && platform) {
      socket.emit("get-available-dates", { jid, platform });

      const handleAvailableDates = (response: {
        jid: string;
        dates: string[];
      }) => {
        if (response.jid === jid) {
          setAvailableDates(response.dates);
          // Automatically select the most recent date
          if (response.dates.length > 0 && !selectedDate) {
            setSelectedDate(response.dates[0]);
          }
        }
      };

      socket.on("available-dates", handleAvailableDates);
      return () => {
        socket.off("available-dates", handleAvailableDates);
      };
    }
  }, [isExpanded, socket, jid, platform, selectedDate]);

  // Fetch data for the selected date
  useEffect(() => {
    if (isExpanded && socket && jid && platform && selectedDate) {
      setHistoricalData([]); // Clear old data
      socket.emit("get-historical-data", { jid, platform, date: selectedDate });

      const handleHistoricalData = (response: {
        jid: string;
        date: string;
        records: TrackerData[];
      }) => {
        if (response.jid === jid && response.date === selectedDate) {
          setHistoricalData(response.records);
        }
      };

      socket.on("historical-data", handleHistoricalData);
      return () => {
        socket.off("historical-data", handleHistoricalData);
      };
    }
  }, [isExpanded, socket, jid, platform, selectedDate]);

  const displayData = isExpanded ? historicalData : liveData;

  const { segments, currentStatusInfo, allSegments } = useMemo(() => {
    if (displayData.length === 0) {
      return { segments: [], currentStatusInfo: null, allSegments: [] };
    }

    const statusSegments: Array<{
      status: TrackerState | string;
      startTime: number;
      endTime: number;
      duration: number;
    }> = [];

    if (displayData.length > 0) {
      let lastStatus = displayData[0].state as TrackerState;
      let lastTimestamp = displayData[0].timestamp;

      for (let i = 1; i < displayData.length; i++) {
        const pointStatus = displayData[i].state as TrackerState;
        if (pointStatus !== lastStatus) {
          statusSegments.push({
            status: lastStatus,
            startTime: lastTimestamp,
            endTime: displayData[i].timestamp,
            duration: displayData[i].timestamp - lastTimestamp,
          });
          lastStatus = pointStatus;
          lastTimestamp = displayData[i].timestamp;
        }
      }
      // The last segment in a historical view should be based on the last data point, not Date.now()
      const finalTimestamp = isExpanded
        ? displayData[displayData.length - 1].timestamp
        : Date.now();
      statusSegments.push({
        status: lastStatus,
        startTime: lastTimestamp,
        endTime: finalTimestamp,
        duration: finalTimestamp - lastTimestamp,
      });
    }

    const latestSegment =
      statusSegments.length > 0
        ? statusSegments[statusSegments.length - 1]
        : null;

    return {
      segments: statusSegments.slice(0, -1).reverse(),
      currentStatusInfo: latestSegment,
      allSegments: [...statusSegments].reverse(),
    };
  }, [displayData, isExpanded]);

  if (!currentStatusInfo && !isExpanded) {
    return (
      <div className="text-center py-4">
        <p className="text-zinc-500">No live data.</p>
      </div>
    );
  }

  if (isExpanded && availableDates.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-zinc-500">
          No historical archives available for this contact.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-zinc-200">
          {isExpanded ? "Daily Availability" : "Live Availability"}
        </h3>
        {isExpanded && availableDates.length > 0 && (
          <select
            value={selectedDate || ""}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm border-zinc-700 bg-zinc-900 text-zinc-200 rounded-md shadow-sm focus:border-zinc-500 focus:ring-zinc-500"
          >
            {availableDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        )}
        {onExpand && !isExpanded && (
          <button
            onClick={onExpand}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-full transition-colors"
          >
            <Expand size={16} />
          </button>
        )}
      </div>

      <div className="w-full h-40 mb-4 bg-zinc-900/30 rounded-lg p-2 border border-zinc-800/50">
        <AvailabilityGraph data={displayData} />
      </div>

      <div className="w-full h-40 mb-4 bg-zinc-900/30 rounded-lg p-2 border border-zinc-800/50 relative">
        <h4 className="absolute top-2 left-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider z-10">RTT Latency</h4>
        <RTTGraph data={displayData} />
      </div>

      {/* Current Status Section */}
      {!isExpanded && currentStatusInfo && (
        <div className="mb-4 pt-4 border-t border-zinc-800">
          <p className="text-lg">
            <span className="font-semibold text-zinc-300">
              Current Status:{" "}
            </span>
            <span
              className={`font-bold ${getStatusColor(currentStatusInfo.status)}`}
            >
              {currentStatusInfo.status}
            </span>
            <span className="text-zinc-500">
              {" "}
              for {formatDuration(currentStatusInfo.duration)}
            </span>
          </p>
          <p className="text-sm text-zinc-600">
            Since {new Date(currentStatusInfo.startTime).toLocaleString()}
          </p>
        </div>
      )}

      {/* History Section */}
      <div className="border-t border-zinc-800 pt-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-zinc-200">
            Status History{" "}
            {isExpanded && selectedDate ? `for ${selectedDate}` : ""}
          </h3>
          {onHistoryExpand && !isExpanded && (
            <button
              onClick={onHistoryExpand}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-full transition-colors"
            >
              <Expand size={16} />
            </button>
          )}
        </div>
        {allSegments.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
            {allSegments.slice(0, isExpanded ? 50 : 5).map((segment, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <div>
                  <span
                    className={`font-medium ${getStatusColor(segment.status)}`}
                  >
                    {segment.status}
                  </span>
                  <span className="text-sm text-zinc-500 ml-2">
                    for {formatDuration(segment.duration)}
                  </span>
                </div>
                <div className="text-xs text-zinc-600 font-mono">
                  {new Date(segment.startTime).toLocaleTimeString()} -{" "}
                  {new Date(segment.endTime).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-600 text-center py-4">
            No status changes recorded for this period.
          </p>
        )}
      </div>
    </>
  );
}

function AvailabilityGraph({ data }: { data: TrackerData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-center py-8 text-zinc-500">
        No data to display.
      </div>
    );
  }

  const yValue = 1;

  const dayStart = new Date(data[0].timestamp);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(data[0].timestamp);
  dayEnd.setHours(23, 59, 59, 999);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
        <XAxis
          type="number"
          dataKey="timestamp"
          name="time"
          domain={[dayStart.getTime(), dayEnd.getTime()]}
          tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          stroke="#52525b"
          tick={{ fill: '#71717a', fontSize: 10 }}
        />
        <YAxis
          type="number"
          dataKey={() => yValue}
          name="status"
          domain={[0, 2]}
          tick={false}
          axisLine={false}
        />
        <ZAxis dataKey="state" name="state" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3", stroke: "#52525b" }}
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              const dataPoint = payload[0].payload as TrackerData;
              return (
                <div className="p-3 bg-zinc-900 rounded-lg shadow-xl border border-zinc-700">
                  <p
                    className="font-semibold mb-1"
                    style={{ color: getStatusFillColor(dataPoint.state) }}
                  >
                    {`State: ${dataPoint.state}`}
                  </p>
                  <p className="text-xs text-zinc-400 font-mono">{`Time: ${new Date(dataPoint.timestamp).toLocaleTimeString()}`}</p>
                </div>
              );
            }
            return null;
          }}
        />
        <Scatter name="Status" data={data} fill="#8884d8">
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getStatusFillColor(entry.state)}
            />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function RTTGraph({ data }: { data: TrackerData[] }) {
    if (data.length === 0) return null;

    const dayStart = new Date(data[0].timestamp);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(data[0].timestamp);
    dayEnd.setHours(23, 59, 59, 999);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                <XAxis 
                    dataKey="timestamp" 
                    type="number" 
                    domain={[dayStart.getTime(), dayEnd.getTime()]}
                    tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    stroke="#52525b"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                />
                <YAxis 
                    stroke="#52525b"
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    width={40}
                />
                <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', color: '#e4e4e7' }}
                    labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                    formatter={(value: any) => [`${value}ms`, 'RTT']}
                />
                <Line 
                    type="monotone" 
                    dataKey="rtt" 
                    stroke="#10b981" 
                    strokeWidth={1.5} 
                    dot={false}
                    connectNulls={true}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
