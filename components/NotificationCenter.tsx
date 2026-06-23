import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export interface Notification {
    id: string;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
}

interface NotificationCenterProps {
    notifications: Notification[];
    onDismiss: (id: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onDismiss }) => {
    return (
        <>
            <style>{`
                @keyframes slideUp {
                    from {
                        transform: translateY(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s ease-out;
                }
            `}</style>
            <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-xs">
                {notifications.map(notif => (
                    <div
                        key={notif.id}
                        className={`p-3 rounded-lg shadow-lg flex items-start gap-2 animate-slide-up ${notif.type === 'success' ? 'bg-green-50 border border-green-200' :
                            notif.type === 'error' ? 'bg-red-50 border border-red-200' :
                                'bg-blue-50 border border-blue-200'
                            }`}
                    >
                        {notif.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                        {notif.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
                        {notif.type === 'info' && <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />}

                        <div className="flex-1">
                            <h4 className={`font-semibold text-xs ${notif.type === 'success' ? 'text-green-800' :
                                notif.type === 'error' ? 'text-red-800' :
                                    'text-blue-800'
                                }`}>
                                {notif.title}
                            </h4>
                            <p className={`text-[11px] mt-0.5 ${notif.type === 'success' ? 'text-green-700' :
                                notif.type === 'error' ? 'text-red-700' :
                                    'text-blue-700'
                                }`}>
                                {notif.message}
                            </p>
                        </div>

                        <button
                            onClick={() => onDismiss(notif.id)}
                            className={`p-1 rounded hover:bg-white/50 transition-colors ${notif.type === 'success' ? 'text-green-600' :
                                notif.type === 'error' ? 'text-red-600' :
                                    'text-blue-600'
                                }`}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
};
