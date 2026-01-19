import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ConnectionState } from '../App';
import { CheckCircle } from 'lucide-react';

interface LoginProps {
    connectionState: ConnectionState;
}

export function Login({ connectionState }: LoginProps) {

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WhatsApp Connection */}
            <div className="flex flex-col items-center justify-center bg-zinc-900 p-8 rounded-xl shadow-lg border border-zinc-800">
                <div className="flex items-center gap-2 mb-6">
                    <h2 className="text-2xl font-semibold text-zinc-100">Connect WhatsApp</h2>
                    {connectionState.whatsapp && (
                        <CheckCircle className="text-emerald-500" size={24} />
                    )}
                </div>
                {connectionState.whatsapp ? (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-emerald-500 bg-emerald-950/20 rounded-lg border border-emerald-900/50">
                        <CheckCircle size={64} className="mb-4" />
                        <span className="text-lg font-medium">Connected!</span>
                    </div>
                ) : (
                    <>
                        <div className="bg-white p-4 rounded-lg mb-6 shadow-inner">
                            {connectionState.whatsappQr ? (
                                <QRCodeSVG value={connectionState.whatsappQr} size={256} />
                            ) : (
                                <div className="w-64 h-64 flex items-center justify-center text-zinc-400 bg-zinc-100 rounded">
                                    Waiting for QR Code...
                                </div>
                            )}
                        </div>
                        <p className="text-zinc-400 text-center max-w-md">
                            Open WhatsApp on your phone, go to Settings {'>'} Linked Devices, and scan the QR code to connect.
                        </p>
                    </>
                )}
            </div>

            {/* Signal Connection */}
            <div className="flex flex-col items-center justify-center bg-zinc-900 p-8 rounded-xl shadow-lg border border-zinc-800">
                <div className="flex items-center gap-2 mb-6">
                    <h2 className="text-2xl font-semibold text-zinc-100">Connect Signal</h2>
                    {connectionState.signal && (
                        <CheckCircle className="text-blue-500" size={24} />
                    )}
                </div>
                {connectionState.signal ? (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-blue-400 bg-blue-950/20 rounded-lg border border-blue-900/50">
                        <CheckCircle size={64} className="mb-4" />
                        <span className="text-lg font-medium">Connected!</span>
                        <span className="text-sm text-blue-300 mt-2">{connectionState.signalNumber}</span>
                    </div>
                ) : connectionState.signalApiAvailable ? (
                    <>
                        <div className="bg-white p-4 rounded-lg mb-6 shadow-inner">
                            {connectionState.signalQrImage ? (
                                <img
                                    src={connectionState.signalQrImage}
                                    alt="Signal QR Code"
                                    width={256}
                                    height={256}
                                    className="bg-white"
                                />
                            ) : (
                                <div className="w-64 h-64 flex items-center justify-center text-zinc-400 bg-zinc-100 rounded">
                                    Waiting for QR Code...
                                </div>
                            )}
                        </div>
                        <p className="text-zinc-400 text-center max-w-md">
                            Open Signal on your phone, go to Settings {'>'} Linked Devices, and scan the QR code to connect.
                        </p>
                    </>
                ) : (
                    <div className="w-64 h-64 flex flex-col items-center justify-center text-zinc-400 bg-zinc-900/50 rounded-lg border border-zinc-800">
                        <p className="text-center px-4">Signal API not available</p>
                        <p className="text-xs text-center px-4 mt-2 text-zinc-600">Run the signal-cli-rest-api Docker container to enable</p>
                    </div>
                )}
            </div>
        </div>
    );
}
