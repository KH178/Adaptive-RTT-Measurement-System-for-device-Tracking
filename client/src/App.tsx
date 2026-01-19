import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Dashboard } from './components/Dashboard';

import { Login } from './components/Login';


// Create socket with autoConnect disabled so we can add listeners before connecting
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
export const socket: Socket = io(API_URL, { autoConnect: false });

export interface ConnectionState {
    whatsapp: boolean;
    signal: boolean;
    signalNumber: string | null;
    signalApiAvailable: boolean;
    signalQrImage: string | null;
    whatsappQr: string | null;
}

function App() {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [connectionState, setConnectionState] = useState<ConnectionState>({
        whatsapp: false,
        signal: false,
        signalNumber: null,
        signalApiAvailable: false,
        signalQrImage: null,
        whatsappQr: null
    });

    useEffect(() => {
        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
            setConnectionState({
                whatsapp: false,
                signal: false,
                signalNumber: null,
                signalApiAvailable: false,
                signalQrImage: null,
                whatsappQr: null
            });
        }

        function onWhatsAppConnectionOpen() {
            setConnectionState(prev => ({ ...prev, whatsapp: true, whatsappQr: null }));
        }

        function onWhatsAppQr(qr: string) {
            console.log('[WHATSAPP] Received QR code');
            setConnectionState(prev => ({ ...prev, whatsappQr: qr }));
        }

        function onSignalConnectionOpen(data: { number: string }) {
            setConnectionState(prev => ({
                ...prev,
                signal: true,
                signalNumber: data.number
            }));
        }

        function onSignalDisconnected() {
            setConnectionState(prev => ({
                ...prev,
                signal: false,
                signalNumber: null
            }));
        }

        function onSignalApiStatus(data: { available: boolean }) {
            setConnectionState(prev => ({ ...prev, signalApiAvailable: data.available }));
        }

        function onSignalQrImage(url: string) {
            console.log('[SIGNAL] Received QR image URL:', url);
            setConnectionState(prev => ({ ...prev, signalQrImage: url }));
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('qr', onWhatsAppQr);
        socket.on('connection-open', onWhatsAppConnectionOpen);
        socket.on('signal-connection-open', onSignalConnectionOpen);
        socket.on('signal-disconnected', onSignalDisconnected);
        socket.on('signal-api-status', onSignalApiStatus);
        socket.on('signal-qr-image', onSignalQrImage);

        // Now connect after listeners are set up
        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('qr', onWhatsAppQr);
            socket.off('connection-open', onWhatsAppConnectionOpen);
            socket.off('signal-connection-open', onSignalConnectionOpen);
            socket.off('signal-disconnected', onSignalDisconnected);
            socket.off('signal-api-status', onSignalApiStatus);
            socket.off('signal-qr-image', onSignalQrImage);
        };
    }, []);

    const isAnyPlatformReady = connectionState.whatsapp || connectionState.signal;

    return (
        <div className="min-h-screen bg-zinc-950 p-8 text-zinc-200 transition-colors duration-200">
            <div className="max-w-6xl mx-auto">
                <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center">
                    <h1 className="text-3xl font-bold text-zinc-100">Activity Tracker</h1>
                    <div className="flex items-center gap-2 mt-4 sm:mt-0">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-sm text-zinc-400">{isConnected ? 'Server Connected' : 'Disconnected'}</span>
                        {isConnected && (
                            <>
                                <div className="w-px h-4 bg-zinc-800 mx-2" />
                                <div className={`w-3 h-3 rounded-full ${connectionState.whatsapp ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                <span className="text-sm text-zinc-400">WhatsApp</span>
                                <div className="w-px h-4 bg-zinc-800 mx-2" />
                                <div className={`w-3 h-3 rounded-full ${connectionState.signal ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                <span className="text-sm text-zinc-400">Signal</span>
                            </>
                        )}
                    </div>
                </header>

                <main className="h-[calc(100vh-140px)]">
                    {isAnyPlatformReady ? (
                        <Dashboard connectionState={connectionState} />
                    ) : (
                        <Login connectionState={connectionState} />
                    )}
                </main>
            </div>
        </div>
    );
}

export default App;
