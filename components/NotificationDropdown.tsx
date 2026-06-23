import React from 'react';
import { Bell, Check, Info, AlertTriangle, XCircle, Trash2 } from 'lucide-react';
import { Notification } from '../types';

interface Props {
    notifications: Notification[];
    onMarkAsRead: (id: string) => void;
    onClearAll: () => void;
    onClose: () => void;
}

export const NotificationDropdown: React.FC<Props> = ({ notifications, onMarkAsRead, onClearAll, onClose }) => {
    if (notifications.length === 0) {
        return (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
                <div className="p-4 text-center text-gray-500">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No tienes notificaciones</p>
                </div>
            </div>
        );
    }

    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <Check className="w-4 h-4 text-green-500" />;
            case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'warning': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
            default: return <Info className="w-4 h-4 text-blue-500" />;
        }
    };

    const getBgColor = (type: string) => {
        switch (type) {
            case 'success': return 'bg-green-50';
            case 'error': return 'bg-red-50';
            case 'warning': return 'bg-orange-50';
            default: return 'bg-blue-50';
        }
    };

    return (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 overflow-hidden">
            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-semibold text-gray-700 text-sm">Notificaciones</h3>
                <button
                    onClick={onClearAll}
                    className="text-xs text-gray-500 hover:text-red-600 flex items-center gap-1 transition-colors"
                >
                    <Trash2 className="w-3 h-3" />
                    Limpiar todo
                </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
                {notifications.map((notification) => (
                    <div
                        key={notification.id}
                        onClick={() => onMarkAsRead(notification.id)}
                        className={`p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.read ? 'bg-white' : 'bg-gray-50/50'}`}
                    >
                        <div className="flex gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${getBgColor(notification.type)}`}>
                                {getIcon(notification.type)}
                            </div>
                            <div className="flex-1">
                                <p className={`text-sm ${!notification.read ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                                    {notification.message}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    {new Date(notification.timestamp).toLocaleTimeString()}
                                </p>
                            </div>
                            {!notification.read && (
                                <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2"></div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
