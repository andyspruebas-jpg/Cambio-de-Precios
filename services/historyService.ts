import { MergedItem } from '../types';

export interface HistoryEvent {
    id?: string;
    action: 'IMPORT' | 'PRICE_CHANGE' | 'COST_CHANGE' | 'PRICE_APPROVAL' | 'COST_APPROVAL' | 'PRICE_KEPT' | 'PROVIDER_UPDATE' | 'STORE_EXECUTION' | 'LIST_CLEAR' | 'ITEM_DELETE' | 'RETURNED' | 'RETURNED_TO_INBOX' | 'OTHER';
    productId?: string;
    productCode?: string;
    productName?: string;
    provider?: string;
    oldPrice?: number;
    newPrice?: number;
    oldCost?: number;
    newCost?: number;
    user?: string;
    userId?: string;
    userName?: string;
    timestamp?: string;
    details?: string;
    systemUpdatedAt?: string; // When the item was updated in the system
}

const API_URL = '/api';
const DEDUPE_WINDOW_MS = 15000;
const recentEventFingerprints = new Map<string, number>();

const buildEventFingerprint = (event: HistoryEvent, userId?: string | null): string => {
    const normalize = (v: any) => String(v ?? '').trim().toLowerCase();
    return [
        normalize(event.action),
        normalize(event.productId || event.productCode),
        normalize(event.productName),
        normalize(event.provider),
        normalize(event.user || event.userName || userId || 'guest'),
        normalize(event.details),
        normalize(event.oldPrice),
        normalize(event.newPrice),
        normalize(event.oldCost),
        normalize(event.newCost),
    ].join('|');
};

const shouldSkipDuplicate = (event: HistoryEvent, userId?: string | null): boolean => {
    const now = Date.now();
    const key = buildEventFingerprint(event, userId);

    // Lightweight cleanup
    for (const [k, ts] of recentEventFingerprints.entries()) {
        if (now - ts > DEDUPE_WINDOW_MS) {
            recentEventFingerprints.delete(k);
        }
    }

    const prev = recentEventFingerprints.get(key);
    if (prev && now - prev <= DEDUPE_WINDOW_MS) return true;
    recentEventFingerprints.set(key, now);
    return false;
};

export const HistoryService = {
    logAction: async (event: HistoryEvent, userId: string | null = null, userRole?: string) => {
        try {
            if (shouldSkipDuplicate(event, userId)) {
                console.warn('History dedupe: skipped duplicated event', event.action, event.productId || event.productCode);
                return;
            }
            await fetch(`${API_URL}/history/append`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...event,
                    timestamp: event.timestamp || new Date().toISOString(),
                    user: event.user || 'User',
                    userId: userId || 'guest' // Include userId for backend filtering
                })
            });
        } catch (error) {
            console.error('Failed to log action:', error);
        }
    },

    getHistory: async (userId: string | null = null, userRole?: string, opts: { limit?: number, search?: string, date?: string, provider?: string } = {}): Promise<HistoryEvent[]> => {
        try {
            const params = new URLSearchParams();
            if (userId) params.append('userId', userId);
            if (userRole) params.append('userRole', userRole);
            
            // Default limit high enough for normal views, but capped server-side
            params.append('limit', String(opts.limit || 2000));
            
            if (opts.search) params.append('search', opts.search);
            
            if (opts.date && opts.date !== 'all') {
                if (opts.date === 'today') {
                    params.append('dateFrom', new Date().toISOString().slice(0, 10));
                } else if (opts.date === 'yesterday') {
                    const yd = new Date(); yd.setDate(yd.getDate() - 1);
                    const yds = yd.toISOString().slice(0, 10);
                    params.append('dateFrom', yds);
                    params.append('dateTo', yds);
                } else if (opts.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    params.append('dateFrom', opts.date);
                    params.append('dateTo', opts.date);
                }
            }

            const response = await fetch(`${API_URL}/history?${params.toString()}`);
            if (!response.ok) {
                throw new Error('Failed to fetch history');
            }
            let data = await response.json();
            
            // Client-side provider filtering since server doesn't support provider parameter directly yet
            if (opts.provider && opts.provider !== 'all') {
                data = data.filter((h: any) => h.provider === opts.provider);
            }
            
            return data;
        } catch (error) {
            console.error('Failed to get history:', error);
            return [];
        }
    },

    clearHistory: async (userId: string | null = null, userRole?: string): Promise<boolean> => {
        try {
            const params = new URLSearchParams();
            if (userId) params.append('userId', userId);
            if (userRole) params.append('userRole', userRole);

            const response = await fetch(`${API_URL}/history?${params.toString()}`, {
                method: 'DELETE'
            });
            return response.ok;
        } catch (error) {
            console.error('Failed to clear history:', error);
            return false;
        }
    },

    addEvent: async (event: HistoryEvent) => {
        try {
            if (shouldSkipDuplicate(event, event.userId || null)) {
                console.warn('History dedupe: skipped duplicated event', event.action, event.productId || event.productCode);
                return;
            }
            await fetch(`${API_URL}/history/append`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...event,
                    timestamp: event.timestamp || new Date().toISOString(),
                    user: event.userName || event.user || 'User',
                    userId: event.userId || 'guest'
                })
            });
        } catch (error) {
            console.error('Error adding history event:', error);
        }
    }
};
