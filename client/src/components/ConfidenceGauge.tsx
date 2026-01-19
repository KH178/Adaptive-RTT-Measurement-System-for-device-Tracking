import React from 'react';

interface ConfidenceGaugeProps {
    score: number; // 0.0 to 1.0
    noise: number; // 0.0 to 1.0
}

export function ConfidenceGauge({ score, noise }: ConfidenceGaugeProps) {
    // Determine color based on score
    // High Confidence (>0.8) = Green
    // Medium (>0.5) = Yellow
    // Low (<0.5) = Red/Gray
    
    let color = 'bg-gray-400';
    let label = 'Unknown';
    
    if (score >= 0.8) {
        color = 'bg-green-500';
        label = 'High Certainty';
    } else if (score >= 0.5) {
        color = 'bg-yellow-500';
        label = 'Uncertain';
    } else {
        color = 'bg-red-400';
        label = 'Low Confidence';
    }

    const percentage = Math.round(score * 100);

    return (
        <div className="flex flex-col gap-1 w-full max-w-[120px]">
            <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                <span>Confidence</span>
                <span>{percentage}%</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${color} transition-all duration-500 ease-out`} 
                    style={{ width: `${percentage}%` }}
                />
            </div>
            {noise > 0.2 && (
                <div className="text-[10px] text-red-500 flex items-center gap-1 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>
                    High Network Noise
                </div>
            )}
        </div>
    );
}
