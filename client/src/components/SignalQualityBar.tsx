import React from 'react';
import { Zap } from 'lucide-react';

interface SignalQualityBarProps {
    responsiveness: number; // 0.0 - 1.0
    confidence: number;     // 0.0 - 1.0
    noise: number;          // 0.0 - 1.0
    className?: string;
}

export function SignalQualityBar({ responsiveness, confidence, noise, className = '' }: SignalQualityBarProps) {
    // Height is determined by responsiveness
    // Opacity/Color is determined by confidence
    // Noise is a visual texture overlay

    const getBarColor = () => {
        if (confidence < 0.3) return 'bg-zinc-600'; // Low confidence = grey
        if (responsiveness > 0.8) return 'bg-emerald-400'; // High resp = green
        if (responsiveness > 0.4) return 'bg-amber-400'; // Med resp = amber
        return 'bg-red-400'; // Low resp = red
    };

    const widthPercent = Math.max(5, responsiveness * 100); 

    return (
        <div className={`flex flex-col gap-1 w-full max-w-[120px] ${className}`}>
            <div className="flex justify-between items-end text-[10px] text-zinc-400 font-mono">
                <span>SIG</span>
                <span>{Math.round(responsiveness * 100)}%</span>
            </div>
            
            <div className="relative h-2 w-full bg-zinc-800 rounded-sm overflow-hidden border border-zinc-700">
                {/* Background Noise Pattern */}
                {noise > 0.3 && (
                     <div 
                        className="absolute inset-0 opacity-30" 
                        style={{ 
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, #000 2px, #000 4px)' 
                        }} 
                    />
                )}
                
                {/* Active Signal Bar */}
                <div 
                    className={`h-full transition-all duration-500 ease-out ${getBarColor()}`}
                    style={{ 
                        width: `${widthPercent}%`,
                        opacity: 0.3 + (confidence * 0.7) // Scale opacity from 0.3 to 1.0 based on confidence
                    }}
                />
            </div>

            {/* Confidence Indicator underneath */}
            <div className="flex items-center gap-1 text-[10px] text-zinc-500">
                <div className={`w-1 h-1 rounded-full ${confidence > 0.7 ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                <span>CONF: {Math.round(confidence * 100)}%</span>
            </div>
        </div>
    );
}
