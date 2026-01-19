import React, { useMemo } from 'react';
import { Trash2, MessageCircle, BarChart2, BellOff, Bell, Lock } from 'lucide-react'; 
import { TrackerData, DeviceInfo, Platform } from '../types';
import { Socket } from 'socket.io-client';
import { SignalQualityBar } from './SignalQualityBar';

interface ContactCardProps {
    jid: string;
    displayNumber: string;
    data: TrackerData[];
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    profilePic: string | null;
    onRemove: () => void;
    onHistoryExpand: () => void;
    privacyMode: boolean;
    platform: Platform;
    viewMode: 'rtt' | 'availability';
    socket: Socket;
}

export function ContactCard({
    jid,
    displayNumber,
    data,
    devices,
    onRemove,
    onHistoryExpand,
    privacyMode,
    platform,
    profilePic
}: ContactCardProps) {
    
    // Get latest data point
    const latest = useMemo(() => {
        if (!data || data.length === 0) return null;
        return data[data.length - 1];
    }, [data]);

    const responsiveness = latest?.responsiveness || 0;
    const confidence = latest?.confidence || 0;
    const noise = latest?.noise || 0;
    const rtt = latest?.rtt || 0;
    const state = latest?.state || 'Unknown';

    // Status Colors
    const isOnline = state === 'Online' || state === 'Typing' || state === 'Recording';
    const statusColor = isOnline ? 'text-emerald-400' : 
                       state === 'Offline' ? 'text-zinc-500' : 'text-amber-400';
    const bgStatus = isOnline ? 'bg-emerald-500/10 border-emerald-500/20' : 
                     state === 'Offline' ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-amber-500/10 border-amber-500/20';

    return (
        <div className={`relative group flex flex-col p-5 rounded-2xl border transition-all duration-300 ${bgStatus} hover:bg-zinc-900/80 hover:border-zinc-700`}>
            
            {/* Header: Identity & Actions */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="relative">
                         <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-lg border border-zinc-700/50 shadow-inner overflow-hidden">
                            {privacyMode ? (
                                <Lock size={20} />
                            ) : profilePic ? (
                                <img src={profilePic} alt={displayNumber} className="w-full h-full object-cover" />
                            ) : (
                                <span className="font-mono">{displayNumber.slice(-2)}</span>
                            )}
                        </div>
                        {/* Platform Badge */}
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-900 ${platform === 'whatsapp' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                             <MessageCircle size={10} className="text-white" />
                        </div>
                    </div>
                    <div>
                        <h3 className="text-zinc-200 font-semibold font-mono tracking-tight">
                            {privacyMode ? 'Protected' : displayNumber}
                        </h3>
                         <span className={`text-xs font-bold uppercase tracking-wider ${statusColor}`}>
                            {state}
                        </span>
                    </div>
                </div>

                {/* Actions (visible on hover) */}
                <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={onHistoryExpand} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg">
                        <BarChart2 size={18} />
                    </button>
                    <button onClick={onRemove} className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg">
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Metrics */}
            <div className="space-y-4">
                {/* Latency Big Number */}
                <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-500 uppercase font-medium">Latency</span>
                     <span className={`text-2xl font-mono font-bold ${rtt < 300 ? 'text-zinc-200' : rtt < 1000 ? 'text-amber-400' : 'text-red-400'}`}>
                        {rtt > 0 ? `${Math.round(rtt)}ms` : '--'}
                    </span>
                </div>

                {/* Signal Bar */}
                <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Signal Quality</span>
                        <span className="text-[10px] text-zinc-500">{Math.round(confidence * 100)}% Conf</span>
                    </div>
                    <SignalQualityBar 
                        responsiveness={responsiveness} 
                        confidence={confidence} 
                        noise={noise} 
                    />
                </div>
            </div>
        </div>
    );
}
