import React, { useState } from 'react';

interface StatusHistoryProps {
    history: { timestamp: number; status: number; rtt: number }[];
}

const StatusHistory: React.FC<StatusHistoryProps> = ({ history }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const getStatusLabel = (status: number) => {
        if (status === 2) return 'Online';
        if (status === 1) return 'Standby';
        return 'Offline';
    };

    const getStatusColor = (status: number) => {
        if (status === 2) return 'text-green-600 bg-green-50';
        if (status === 1) return 'text-yellow-600 bg-yellow-50';
        return 'text-red-600 bg-red-50';
    };

    // Show only last 5 items in the widget
    const previewHistory = [...history].reverse().slice(0, 5);
    const fullHistory = [...history].reverse();

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-gray-700 font-medium">Status History</h3>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                    View All
                </button>
            </div>

            <div className="space-y-2">
                {previewHistory.map((entry, i) => (
                    <div key={i} className="flex justify-between items-center text-sm p-2 rounded hover:bg-gray-50 transition-colors">
                        <span className="text-gray-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(entry.status)}`}>
                            {getStatusLabel(entry.status)}
                        </span>
                        <span className="text-gray-400 w-16 text-right font-mono">{entry.rtt}ms</span>
                    </div>
                ))}
                {history.length === 0 && (
                    <div className="text-center text-gray-400 py-4">No history available</div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
                        <div className="p-4 border-b flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-gray-800">Full Status History</h3>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto p-4 flex-1">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                                    <tr>
                                        <th className="p-3 rounded-tl-lg">Time</th>
                                        <th className="p-3">Status</th>
                                        <th className="p-3 text-right rounded-tr-lg">RTT</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {fullHistory.map((entry, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-3 text-gray-600">{new Date(entry.timestamp).toLocaleString()}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(entry.status)}`}>
                                                    {getStatusLabel(entry.status)}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right font-mono text-gray-500">{entry.rtt}ms</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StatusHistory;
