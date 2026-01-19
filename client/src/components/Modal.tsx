import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

/**
 * A generic modal component for displaying content in a full-screen overlay.
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
    // Handle key press for closing the modal with the Escape key
    React.useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        // Cleanup function to remove the event listener
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={onClose} // Close modal on backdrop click
        >
            <div
                className="bg-zinc-950 rounded-2xl shadow-2xl border border-zinc-800 w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/10"
                onClick={(e) => e.stopPropagation()} // Prevent modal from closing when clicking inside
            >
                {/* Modal Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
                    <h2 className="text-xl font-bold text-zinc-100 tracking-tight font-mono">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-all"
                        aria-label="Close modal"
                    >
                        <X size={20} />
                    </button>
                </div>
                {/* Modal Body */}
                <div className="p-0 flex-1 overflow-y-auto bg-zinc-950">
                    {children}
                </div>
            </div>
        </div>
    );
}
