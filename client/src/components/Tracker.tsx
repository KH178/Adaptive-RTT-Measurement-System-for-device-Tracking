import React, { useState, useEffect, useRef } from 'react';
import AvailabilityGraph from './AvailabilityGraph';
import StatusHistory from './StatusHistory';

const Tracker: React.FC = () => {
    const [target, setTarget] = useState('');
    const [platform, setPlatform] = useState<'whatsapp' | 'signal'>('whatsapp');
    const [isTracking, setIsTracking] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [currentStatus, setCurrentStatus] = useState<any>(null);
    const [error, setError] = useState('');

    // Reset history when platform or target changes
    useEffect(() => {
        setHistory([]);
        setCurrentStatus(null);
        setIsTracking(false);
        setError('');
    }, [platform, target]);

    useEffect(() => {
        if (!isTracking || !target) return;

        const fetchData = async () => {
            try {
                // Assuming your backend API structure matches this pattern
                const response = await fetch(`http://localhost:3001/api/${platform}/status?target=${target}`);
                if (!response.ok) {
                    throw new Error(await response.text() || 'Failed to fetch status');
                }
                const data = await response.json();
                
                setCurrentStatus(data);
                setHistory(prev => {
                    const MAX_TRACKER_HISTORY_POINTS = 1000; // Limit history size for performance
                    
                                    const newEntry = data; // Pass the whole data object
                    
                                    // Avoid duplicates based on timestamp
                                    if (prev.length > 0 && prev[prev.length - 1].timestamp === newEntry.timestamp) {
                                        return prev;
                                    }
                                    
                                    const updatedHistory = [...prev, newEntry];
                                    // Keep only the latest MAX_TRACKER_HISTORY_POINTS
                                    return updatedHistory.slice(-MAX_TRACKER_HISTORY_POINTS);                });
                setError('');
            } catch (err: any) {
                console.error("Fetch error:", err);
                // Don't stop tracking on transient errors, but maybe show a warning
                if (err.message.includes("Signal API not available")) {
                     setError("Signal API is not available. Please ensure the Signal container is running.");
                     setIsTracking(false);
                }
            }
        };

        // Initial fetch
        fetchData();
        
        // Poll every 2 seconds
        const interval = setInterval(fetchData, 2000);
        return () => clearInterval(interval);
    }, [isTracking, target, platform]); // <--- CRITICAL FIX: Added platform dependency

    const handleStart = () => {
        if (target) setIsTracking(true);
    };

    const handleStop = () => {
        setIsTracking(false);
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Track Contacts</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                        <select 
                            value={platform} 
                            onChange={(e) => setPlatform(e.target.value as 'whatsapp' | 'signal')}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="whatsapp">WhatsApp</option>
                            <option value="signal">Signal</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Number</label>
                        <input 
                            type="text" 
                            value={target}
                            onChange={(e) => setTarget(e.target.value)}
                            placeholder="e.g., 491701234567"
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="flex gap-3">
                    {!isTracking ? (
                        <button 
                            onClick={handleStart}
                            disabled={!target}
                            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Start Tracking
                        </button>
                    ) : (
                        <button 
                            onClick={handleStop}
                            className="flex-1 bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition-colors"
                        >
                            Stop Tracking
                        </button>
                    )}
                </div>
            </div>

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Graph - Spans 2 columns */}
                <div className="lg:col-span-2">
                    <AvailabilityGraph data={history} />
                </div>

                {/* Status History - Spans 1 column */}
                <div className="lg:col-span-1">
                    <StatusHistory history={history} />
                </div>
            </div>
        </div>
    );
};

export default Tracker;
