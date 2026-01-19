import React, { useEffect, useState, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window'; // Switch to FixedSizeList for uniform rows
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { Eye, EyeOff, Plus, Settings, MessageCircle } from 'lucide-react';
import { socket, ConnectionState } from '../App';
import { TrackerData, TrackerUpdate, DeviceInfo, Platform } from '../types';
import { ContactCard } from './ContactCard';
import { Login } from './Login';
import { Modal } from './Modal';
import { AvailabilityView } from './AvailabilityView';

type ProbeMethod = 'delete' | 'reaction';

interface DashboardProps {
    connectionState: ConnectionState;
}

export type ViewMode = 'rtt' | 'availability';

interface ContactInfo {
    jid: string;
    displayNumber: string;
    contactName: string;
    data: TrackerData[];
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    profilePic: string | null;
    platform: Platform;
}

export function Dashboard({ connectionState }: DashboardProps) {
    const [inputNumber, setInputNumber] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>(
        connectionState.whatsapp ? 'whatsapp' : 'signal'
    );
    const [contacts, setContacts] = useState<Map<string, ContactInfo>>(new Map());
    const [error, setError] = useState<string | null>(null);
    const [privacyMode, setPrivacyMode] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('rtt');
    const [showConnections, setShowConnections] = useState(false);
    const [historyModalContact, setHistoryModalContact] = useState<ContactInfo | null>(null);

    // Filter contacts based on search/platform if needed (future)
    const contactList = Array.from(contacts.values());
    
    // Sort contacts by latest activity (timestamp of last data point)
    const sortedContacts = useMemo(() => {
        return contactList.sort((a, b) => {
            const aTime = a.data.length > 0 ? a.data[a.data.length - 1].timestamp : 0;
            const bTime = b.data.length > 0 ? b.data[b.data.length - 1].timestamp : 0;
            return bTime - aTime;
        });
    }, [contacts]);

    useEffect(() => {
        function onTrackerUpdate(update: TrackerUpdate) {
            const { jid, ...data } = update;
            if (!jid) return;

            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(jid);

                if (contact) {
                    // Update existing contact
                    const updatedContact = { ...contact };

                    if (data.presence !== undefined) {
                        updatedContact.presence = data.presence;
                    }
                    if (data.deviceCount !== undefined) {
                        updatedContact.deviceCount = data.deviceCount;
                    }
                    if (data.devices !== undefined) {
                        updatedContact.devices = data.devices;
                    }

                    // Add to chart data - STRICT WINDOWING (Max 100 points for sparkline)
                    if (data.median !== undefined && data.devices && data.devices.length > 0) {
                        const newDataPoint: TrackerData = {
                            rtt: data.devices[0].rtt,
                            avg: data.devices[0].avg,
                            median: data.median,
                            threshold: data.threshold,
                            // Use derived state from backend analysis
                            state: data.devices[0].state || 'Unknown',
                            timestamp: Date.now(),
                            confidence: data.confidence,
                            noise: data.noise,
                            responsiveness: data.responsiveness
                        };
                        
                        // Keep only recent history for sparkline
                        const MAX_SPARKLINE_POINTS = 100;
                        const newData = [...updatedContact.data, newDataPoint];
                        if (newData.length > MAX_SPARKLINE_POINTS) {
                            updatedContact.data = newData.slice(newData.length - MAX_SPARKLINE_POINTS);
                        } else {
                            updatedContact.data = newData;
                        }
                    }

                    next.set(jid, updatedContact);
                }

                return next;
            });
        }

        function onProfilePic(data: { jid: string, url: string | null }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, profilePic: data.url });
                }
                return next;
            });
        }

        function onContactName(data: { jid: string, name: string }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, contactName: data.name });
                }
                return next;
            });
        }

        function onContactAdded(data: { jid: string, number: string, platform?: Platform }) {
            setContacts(prev => {
                const next = new Map(prev);
                next.set(data.jid, {
                    jid: data.jid,
                    displayNumber: data.number,
                    contactName: data.number,
                    data: [],
                    devices: [],
                    deviceCount: 0,
                    presence: null,
                    profilePic: null,
                    platform: data.platform || 'whatsapp'
                });
                return next;
            });
            setInputNumber('');
        }

        function onContactRemoved(jid: string) {
            setContacts(prev => {
                const next = new Map(prev);
                next.delete(jid);
                return next;
            });
        }

        function onError(data: { jid?: string, message: string }) {
            setError(data.message);
            setTimeout(() => setError(null), 3000);
        }

        function onTrackedContacts(trackedContactsResponse: { id: string, platform: Platform }[]) {
            setContacts(prev => {
                const next = new Map(prev);
                trackedContactsResponse.forEach(({ id, platform }) => {
                    if (!next.has(id)) {
                        let displayNumber = id;
                        if (platform === 'signal') {
                            displayNumber = id.replace('signal:', '');
                        } else {
                            displayNumber = id.split('@')[0];
                        }
                        next.set(id, {
                            jid: id,
                            displayNumber,
                            contactName: displayNumber,
                            data: [],
                            devices: [],
                            deviceCount: 0,
                            presence: null,
                            profilePic: null,
                            platform
                        });
                        socket.emit('get-historical-data', { jid: id, platform: platform });
                    }
                });
                return next;
            });
        }

        function onHistoricalData(data: { jid: string; platform: Platform; records: TrackerData[] }) {
            setContacts(prev => {
                const next = new Map(prev);
                const contact = next.get(data.jid);
                if (contact) {
                    next.set(data.jid, { ...contact, data: data.records });
                }
                return next;
            });
        }

        socket.on('tracker-update', onTrackerUpdate);
        socket.on('profile-pic', onProfilePic);
        socket.on('contact-name', onContactName);
        socket.on('contact-added', onContactAdded);
        socket.on('contact-removed', onContactRemoved);
        socket.on('error', onError);
        socket.on('tracked-contacts', onTrackedContacts);
        socket.on('historical-data', onHistoricalData);

        socket.emit('get-tracked-contacts');

        return () => {
            socket.off('tracker-update', onTrackerUpdate);
            socket.off('profile-pic', onProfilePic);
            socket.off('contact-name', onContactName);
            socket.off('contact-added', onContactAdded);
            socket.off('contact-removed', onContactRemoved);
            socket.off('error', onError);
            socket.off('tracked-contacts', onTrackedContacts);
            socket.off('historical-data', onHistoricalData);
        };
    }, []);

    const handleAdd = () => {
        if (!inputNumber) return;
        socket.emit('add-contact', { number: inputNumber, platform: selectedPlatform });
    };

    const handleRemove = (jid: string) => {
        socket.emit('remove-contact', jid);
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header / Config Bar */}
            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between shrink-0">
                
                {/* Add Contact */}
                <div className="flex flex-1 w-full gap-2">
                    <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-700">
                         <button
                            onClick={() => setSelectedPlatform('whatsapp')}
                            className={`p-2 rounded-md transition-all ${selectedPlatform === 'whatsapp' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                            title="WhatsApp"
                        >
                            <MessageCircle size={18} />
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder="Add number..."
                        className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700 font-mono text-sm"
                        value={inputNumber}
                        onChange={(e) => setInputNumber(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        onClick={handleAdd}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 font-medium transition-colors text-sm"
                    >
                        <Plus size={16} /> <span className="hidden sm:inline">Track</span>
                    </button>
                </div>

                {/* Toggles */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setPrivacyMode(!privacyMode)}
                        className={`p-2 rounded-lg transition-colors border ${privacyMode ? 'bg-emerald-900/20 border-emerald-900/50 text-emerald-500' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                        title={privacyMode ? "Privacy Mode On" : "Privacy Mode Off"}
                    >
                        {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                    
                    <button
                        onClick={() => setShowConnections(!showConnections)}
                         className={`p-2 rounded-lg transition-colors border ${showConnections ? 'bg-zinc-800 border-zinc-700 text-zinc-200' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                         title="Connection Settings"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </div>
            
            {error && (
                <div className="mb-4 px-4 py-2 bg-red-900/20 border border-red-900/50 text-red-400 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {showConnections && (
                <div className="mb-6 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
                    <Login connectionState={connectionState} />
                </div>
            )}

            {/* Main Content Area - Grid Layout */}
            <div className="flex-1 bg-zinc-950 p-6 overflow-y-auto">
                {sortedContacts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                         <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 border border-zinc-800">
                            <MessageCircle size={24} className="opacity-20" />
                         </div>
                        <p>No active targets.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
                        {sortedContacts.map((contact) => (
                            <ContactCard
                                key={contact.jid}
                                jid={contact.jid}
                                displayNumber={contact.contactName}
                                data={contact.data}
                                devices={contact.devices}
                                deviceCount={contact.deviceCount}
                                presence={contact.presence}
                                profilePic={contact.profilePic}
                                onRemove={() => handleRemove(contact.jid)}
                                onHistoryExpand={() => setHistoryModalContact(contact)}
                                privacyMode={privacyMode}
                                platform={contact.platform}
                                viewMode={viewMode}
                                socket={socket}
                            />
                        ))}
                    </div>
                )}
            </div>

            {historyModalContact && (
                <Modal
                    isOpen={!!historyModalContact}
                    onClose={() => setHistoryModalContact(null)}
                    title={`${historyModalContact.platform === 'whatsapp' ? 'WhatsApp' : 'Signal'} Analysis: ${historyModalContact.contactName}`}
                >
                    <div className="w-full h-full bg-zinc-950 text-zinc-200 p-4">
                        <AvailabilityView
                            data={historyModalContact.data}
                            presence={historyModalContact.presence}
                            isExpanded={true}
                            socket={socket}
                            jid={historyModalContact.jid}
                            platform={historyModalContact.platform}
                        />
                    </div>
                </Modal>
            )}
        </div>
    );
}

