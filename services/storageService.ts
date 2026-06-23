// Local storage service for persisting product data
// Using IndexedDB for large datasets (products) and localStorage for metadata
// Each user has their own independent data space

import { getBoliviaISOString, getBoliviaFilenameTimestamp } from '../utils/boliviaTime';

const DB_NAME = 'PriceFlowDB';
const DB_VERSION = 1;
const STORE_NAME = 'products';
const PENDING_ODOO_UPDATES_KEY = 'priceflow_odoo_pending_updates';

const safeLoadArray = (key: string): any[] => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error(`❌ Error parsing localStorage key ${key}:`, error);
        return [];
    }
};

const getLatestItemTimestamp = (items: any[]): number => {
    if (!Array.isArray(items) || items.length === 0) return 0;

    return items.reduce((latest, item) => {
        const candidates = [
            item?.updatedAt,
            item?.systemUpdatedAt,
            item?.priceApprovedAt,
            item?.costApprovedAt,
            item?.storeExecutedAt,
            item?.createdAt
        ];

        const itemLatest = candidates.reduce((max: number, value: string | undefined) => {
            if (!value) return max;
            const time = new Date(value).getTime();
            return Number.isFinite(time) ? Math.max(max, time) : max;
        }, 0);

        return Math.max(latest, itemLatest);
    }, 0);
};

const persistWorkflowItemsLocally = (items: any[], userId: string | null = null, userRole?: string) => {
    const workflowKey = getUserStorageKey(userId, userRole, 'workflow_items');
    const workflowMetaKey = getUserStorageKey(userId, userRole, 'workflow_items_updated_at');
    localStorage.setItem(workflowKey, JSON.stringify(items));
    localStorage.setItem(workflowMetaKey, String(Math.max(Date.now(), getLatestItemTimestamp(items))));
};

const loadLocalPendingOdooUpdates = (): any[] => safeLoadArray(PENDING_ODOO_UPDATES_KEY);

const saveLocalPendingOdooUpdates = (changes: any[]) => {
    localStorage.setItem(PENDING_ODOO_UPDATES_KEY, JSON.stringify(changes));
};

// Helper to get user-specific storage keys
// Each user has their own independent data space
const getUserStorageKey = (userId: string | null, userRole?: string, baseKey: string = 'priceflow'): string => {
    if (!userId) return `${baseKey}_guest`; // Fallback for no user

    // All users are independent, including "sala" users
    return `${baseKey}_${userId}`;
};

// Legacy keys (for migration)
const LEGACY_STORAGE_KEY = 'priceflow_products';
const LEGACY_HISTORY_KEY = 'priceflow_history';
const LEGACY_LAST_SYNC_KEY = 'priceflow_last_sync';
const LEGACY_WORKFLOW_KEY = 'priceflow_workflow_items';

// Helper for IndexedDB
const dbPromise = (() => {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => {
            console.error('❌ Error opening IndexedDB:', request.error);
            reject(request.error);
        };
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
})();

export const StorageService = {
    saveProducts: async (products: any[], userId: string | null = null, userRole?: string) => {
        try {
            const storageKey = getUserStorageKey(userId, userRole, 'products');
            const db = await dbPromise;
            return new Promise<void>((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(products, storageKey);

                request.onsuccess = () => {
                    const syncKey = getUserStorageKey(userId, userRole, 'last_sync');
                    localStorage.setItem(syncKey, getBoliviaISOString());
                    console.log(`✅ Guardados ${products.length} productos para usuario ${userId || 'guest'}`);
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Error guardando productos en IDB:', error);
        }
    },

    loadProducts: async (userId: string | null = null, userRole?: string): Promise<any[] | null> => {
        try {
            const storageKey = getUserStorageKey(userId, userRole, 'products');

            // Check localStorage first for migration from legacy keys
            const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyData && !userId) {
                console.log('📦 Migrating products from legacy localStorage to IndexedDB...');
                try {
                    const products = JSON.parse(legacyData);
                    await StorageService.saveProducts(products, userId, userRole);
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                    console.log('✅ Migration complete.');
                    return products;
                } catch (e) {
                    console.error('Migration failed:', e);
                }
            }

            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(storageKey);

                request.onsuccess = () => {
                    const products = request.result;
                    if (products) {
                        console.log(`📦 Cargados ${products.length} productos para usuario ${userId || 'guest'}`);
                        resolve(products);
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('❌ Error cargando productos de IDB:', error);
            return null;
        }
    },

    saveHistory: (items: any[], userId: string | null = null, userRole?: string) => {
        try {
            const historyKey = getUserStorageKey(userId, userRole, 'history');
            localStorage.setItem(historyKey, JSON.stringify(items));
            console.log(`✅ Historial guardado para usuario ${userId || 'guest'}`);
        } catch (error) {
            console.error('❌ Error guardando historial:', error);
        }
    },

    loadHistory: (userId: string | null = null, userRole?: string) => {
        try {
            const historyKey = getUserStorageKey(userId, userRole, 'history');
            const data = localStorage.getItem(historyKey);
            if (data) {
                return JSON.parse(data);
            }

            // Try legacy key for migration
            if (!userId) {
                const legacyData = localStorage.getItem(LEGACY_HISTORY_KEY);
                if (legacyData) {
                    const items = JSON.parse(legacyData);
                    StorageService.saveHistory(items, userId, userRole);
                    localStorage.removeItem(LEGACY_HISTORY_KEY);
                    return items;
                }
            }
        } catch (error) {
            console.error('❌ Error cargando historial:', error);
        }
        return [];
    },

    saveWorkflowItems: async (items: any[], userId: string | null = null, userRole?: string) => {
        try {
            persistWorkflowItemsLocally(items, userId, userRole);
            await fetch('/api/progress/workflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: items, userId })
            });
            console.log(`✅ Items de trabajo guardados en servidor para usuario ${userId || 'guest'}`);
        } catch (error) {
            console.error('❌ Error guardando items de trabajo en servidor:', error);
        }
    },

    loadWorkflowItems: async (userId: string | null = null, userRole?: string): Promise<any[]> => {
        const workflowKey = getUserStorageKey(userId, userRole, 'workflow_items');
        const workflowMetaKey = getUserStorageKey(userId, userRole, 'workflow_items_updated_at');
        const localItems = safeLoadArray(workflowKey);
        const localTimestamp = Number(localStorage.getItem(workflowMetaKey) || 0);

        try {
            const response = await fetch(`/api/progress/workflow?userId=${userId || ''}`);
            if (response.ok) {
                const serverItems = await response.json();
                const serverTimestamp = getLatestItemTimestamp(serverItems);

                if (localItems.length > 0 || localTimestamp > 0) {
                    if (localTimestamp > serverTimestamp) {
                        console.log(`📦 Using newer local workflow snapshot for usuario ${userId || 'guest'}`);
                        void StorageService.saveWorkflowItems(localItems, userId, userRole);
                        return localItems;
                    }

                    if (serverTimestamp >= localTimestamp) {
                        persistWorkflowItemsLocally(serverItems, userId, userRole);
                    }
                }

                console.log(`✅ Loaded ${serverItems.length} workflow items from server`);
                return serverItems;
            }
        } catch (error) {
            console.error('❌ Error loading workflow items from server:', error);
        }

        return localItems;
    },

    getLastSync: (userId: string | null = null, userRole?: string): Date | null => {
        try {
            const syncKey = getUserStorageKey(userId, userRole, 'last_sync');
            const lastSync = localStorage.getItem(syncKey);

            if (!lastSync && !userId) {
                // Try legacy key
                const legacySync = localStorage.getItem(LEGACY_LAST_SYNC_KEY);
                if (legacySync) {
                    localStorage.setItem(syncKey, legacySync);
                    localStorage.removeItem(LEGACY_LAST_SYNC_KEY);
                    return new Date(legacySync);
                }
            }

            return lastSync ? new Date(lastSync) : null;
        } catch (error) {
            return null;
        }
    },

    updateLastSync: (date: Date, userId: string | null = null, userRole?: string) => {
        try {
            const syncKey = getUserStorageKey(userId, userRole, 'last_sync');
            localStorage.setItem(syncKey, date.toISOString());
        } catch (error) {
            console.error('Error updating last sync:', error);
        }
    },

    clearProducts: async (userId: string | null = null, userRole?: string) => {
        try {
            const storageKey = getUserStorageKey(userId, userRole, 'products');
            const syncKey = getUserStorageKey(userId, userRole, 'last_sync');

            const db = await dbPromise;
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(storageKey);
            localStorage.removeItem(syncKey);
            console.log(`🗑️ Productos eliminados para usuario ${userId || 'guest'}`);
        } catch (error) {
            console.error('Error clearing products:', error);
        }
    },

    /**
     * Save products as CSV file to datos folder via backend API
     * Returns the filename if successful
     */
    saveProductsAsCSV: async (products: any[], userId: string | null = null, userRole?: string): Promise<string | null> => {
        try {
            if (products.length === 0) {
                console.warn('⚠️ No hay productos para exportar');
                return null;
            }

            // Create timestamp for filename
            const timestamp = getBoliviaFilenameTimestamp();

            const filename = `odoo_sync_${timestamp}.csv`;

            // Define CSV headers
            const headers = [
                'Barcode',
                'Código Proveedor',
                'Descripción',
                'Costo',
                'Precio',
                'Proveedor Odoo',
                'Categoría',
                'Provider',
                'Stock'
            ];

            // Convert products to CSV rows
            const rows = products.map(p => [
                `"${p.barcode || ''}"`,
                `"${p.supplierCode || ''}"`,
                `"${(p.description || '').replace(/"/g, '""')}"`, // Escape quotes
                p.cost || 0,
                p.price || 0,
                `"${(p.supplierName || '').replace(/"/g, '""')}"`,
                `"${(p.category || '').replace(/"/g, '""')}"`,
                `"${(p.provider || 'N/A').replace(/"/g, '""')}"`,
                p.stock || 0
            ].join(','));

            // Combine headers and rows
            const csvContent = [headers.join(','), ...rows].join('\n');

            // Send to backend API to save in datos folder
            const response = await fetch('/api/save-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, content: csvContent })
            });

            if (!response.ok) {
                throw new Error('Failed to save CSV to server');
            }

            const result = await response.json();
            console.log(`✅ CSV guardado en proyecto: ${result.path}`);

            // Store the filename in user-specific localStorage
            const csvKey = getUserStorageKey(userId, userRole, 'last_csv');
            const csvPathKey = getUserStorageKey(userId, userRole, 'last_csv_path');

            localStorage.setItem(csvKey, filename);
            localStorage.setItem(csvPathKey, result.path);

            return filename;
        } catch (error) {
            console.error('❌ Error guardando CSV:', error);
            console.warn('⚠️ Asegúrate de que el servidor backend esté corriendo (npm run server)');
            return null;
        }
    },

    getLastCSVFilename: (userId: string | null = null, userRole?: string): string | null => {
        const csvKey = getUserStorageKey(userId, userRole, 'last_csv');
        return localStorage.getItem(csvKey);
    },

    getLastCSVPath: (userId: string | null = null, userRole?: string): string | null => {
        const csvPathKey = getUserStorageKey(userId, userRole, 'last_csv_path');
        return localStorage.getItem(csvPathKey);
    },

    /**
     * Load products from the latest CSV file in datos folder
     */
    loadProductsFromLatestCSV: async (userId: string | null = null, userRole?: string, forceFull: boolean = false): Promise<{ products: any[], modified: Date, filename: string } | null | 'NOT_MODIFIED'> => {
        try {
            const lastSync = StorageService.getLastSync(userId, userRole);
            const modifiedSince = (!forceFull && lastSync) ? lastSync.toISOString() : '';

            // Only load official Odoo sync files to avoid picking up partial provider exports
            const response = await fetch(`/api/latest-csv?prefix=odoo_sync&modifiedSince=${encodeURIComponent(modifiedSince)}`);

            if (response.status === 304) {
                console.log('🔄 Server data is not modified - skipping full download');
                return 'NOT_MODIFIED';
            }

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('📭 No CSV files found in datos folder');
                    return null;
                }
                throw new Error('Failed to fetch latest CSV');
            }

            const data = await response.json();
            const { products, modified, filename } = data;

            console.log(`✅ Cargados ${products.length} productos desde CSV: ${filename}`);

            return { products, modified: new Date(modified), filename };
        } catch (error) {
            console.error('❌ Error loading from CSV:', error);
            console.warn('⚠️ Asegúrate de que el servidor backend esté corriendo (npm run server)');
            return null;
        }
    },

    /**
     * Save pending changes for Store Execution (shared across all users)
     * These are changes that have been confirmed but not yet executed in store
     */
    savePendingStoreChanges: async (changes: any[]) => {
        try {
            await fetch('/api/progress/store_change', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: changes })
            });
            console.log(`💾 Guardados ${changes.length} cambios pendientes en servidor`);
        } catch (error) {
            console.error('Error saving pending store changes to server:', error);
            try {
                const key = 'priceflow_store_pending_changes';
                localStorage.setItem(key, JSON.stringify(changes));
            } catch (e) { }
        }
    },

    /**
     * Load pending changes for Store Execution (shared across all users)
     * Includes automatic migration from localStorage to server
     */
    loadPendingStoreChanges: async (): Promise<any[]> => {
        try {
            const response = await fetch(`/api/progress/store_change?_t=${Date.now()}`);
            if (response.ok) {
                const serverData = await response.json();

                // Check if we have legacy data in localStorage that needs migration
                const key = 'priceflow_store_pending_changes';
                const localData = localStorage.getItem(key);

                if (localData) {
                    try {
                        const localChanges = JSON.parse(localData);

                        // If we have local data and it's different from server, merge and migrate
                        if (localChanges.length > serverData.length) {
                            console.log(`🔄 Migrating ${localChanges.length} store changes from localStorage to server...`);
                            await StorageService.savePendingStoreChanges(localChanges);
                            localStorage.removeItem(key); // Clean up after migration
                            console.log('✅ Migration complete');
                            return localChanges;
                        }
                    } catch (e) {
                        console.error('Error during migration:', e);
                    }
                }

                return serverData;
            }
        } catch (error) {
            console.error('Error loading pending store changes from server:', error);
        }

        // Fallback to localStorage if server unavailable
        try {
            const key = 'priceflow_store_pending_changes';
            const data = localStorage.getItem(key);
            if (data) {
                console.log('⚠️ Using localStorage fallback for store changes');
                return JSON.parse(data);
            }
        } catch (e) { }
        return [];
    },

    /**
     * Add a change to the shared pending store changes
     * Uses atomic server endpoint to prevent race conditions
     */
    addPendingStoreChange: async (change: any) => {
        try {
            console.log('🔵 Agregando cambio a lista compartida:', change.description);

            // Ensure executedBy is initialized
            const changeWithTracking = {
                ...change,
                executedBy: change.executedBy || []
            };

            // Use atomic add endpoint to prevent race conditions
            const response = await fetch('/api/progress/store_change/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item: changeWithTracking })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.added) {
                    console.log(`✅ Cambio agregado. Total en lista compartida: ${result.total}`);
                } else {
                    console.log('⚠️ Cambio ya existía en lista compartida');
                }
            } else {
                throw new Error('Server returned error');
            }
        } catch (error) {
            console.error('Error adding pending store change:', error);
            // Fallback to old method if server fails
            try {
                const existing = await StorageService.loadPendingStoreChanges();
                // Ensure executedBy is initialized in fallback too
                const changeWithTracking = {
                    ...change,
                    executedBy: change.executedBy || []
                };
                const updated = [...existing, changeWithTracking];
                await StorageService.savePendingStoreChanges(updated);
                console.log('✅ Cambio agregado (fallback). Total:', updated.length);
            } catch (e) {
                console.error('Fallback also failed:', e);
            }
        }
    },

    /**
     * Mark a change as executed for a specific sala/user
     * This allows independent execution tracking per branch
     */
    markChangeAsExecuted: async (changeId: string, salaId: string) => {
        try {
            const existing = await StorageService.loadPendingStoreChanges();
            const updated = existing.map((c: any) => {
                if (c.id === changeId) {
                    const executedBy = c.executedBy || [];
                    if (!executedBy.includes(salaId)) {
                        return { ...c, executedBy: [...executedBy, salaId] };
                    }
                }
                return c;
            });
            await StorageService.savePendingStoreChanges(updated);
            console.log(`✅ Marked change ${changeId} as executed by ${salaId}`);
        } catch (error) {
            console.error('Error marking store change as executed:', error);
        }
    },

    /**
     * Remove a change from the shared pending store changes (Global delete)
     */
    removePendingStoreChange: async (changeId: string) => {
        try {
            const existing = await StorageService.loadPendingStoreChanges();
            const updated = existing.filter((c: any) => c.id !== changeId);
            await StorageService.savePendingStoreChanges(updated);
        } catch (error) {
            console.error('Error removing pending store change:', error);
        }
    },

    /**
     * Add a notification that will be picked up by users with the target role
     * For 'sala' role, notifications are batched and sent in bulk after 30 seconds
     */
    addSharedNotification: async (notification: { title: string, message: string, type: 'success' | 'error' | 'info' }, targetRole: string, targetUserId?: string | null) => {
        try {
            // For 'sala' role, use batched notifications to avoid spam
            if (targetRole === 'sala') {
                await fetch('/api/notifications/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        notification,
                        targetRole,
                        targetUserId,
                        productName: notification.message // Extract product name for batching
                    })
                });
                console.log(`📢 Notificación agregada al lote para sala`);
            } else {
                // For other roles, send immediately
                await fetch('/api/notifications', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...notification, targetRole, targetUserId })
                });
                console.log(`📢 Notificación enviada al servidor para rol: ${targetRole} ${targetUserId ? `(User: ${targetUserId})` : ''}`);
            }
        } catch (error) {
            console.error('Error adding shared notification:', error);
        }
    },

    /**
     * Load notifications for a specific role and mark them as read/consumed
     */
    consumeSharedNotifications: async (userRole: string, userId?: string): Promise<any[]> => {
        try {
            const response = await fetch(`/api/notifications?role=${userRole}&userId=${userId || ''}&consume=true`);
            if (response.ok) {
                const notifications = await response.json();
                return notifications;
            }
            return [];
        } catch (error) {
            console.error('Error consuming shared notifications:', error);
            return [];
        }
    },

    /**
     * Save pending Odoo updates (shared across all users, for ejecutor role)
     * These are price-approved changes waiting to be confirmed in Actualizar Odoo
     */
    savePendingOdooUpdates: async (changes: any[]) => {
        saveLocalPendingOdooUpdates(changes);
        try {
            await fetch('/api/progress/odoo_update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: changes })
            });
            console.log(`💾 Guardados ${changes.length} cambios pendientes Odoo`);
        } catch (error) {
            console.error('Error saving pending Odoo updates to server:', error);
        }
    },

    /**
     * Load pending Odoo updates (shared across all users, for ejecutor role)
     */
    loadPendingOdooUpdates: async (): Promise<any[]> => {
        const localItems = loadLocalPendingOdooUpdates();

        try {
            const response = await fetch(`/api/progress/odoo_update?_t=${Date.now()}`);
            if (response.ok) {
                const serverData = await response.json();

                // The shared server file is the source of truth. Keeping the local cache
                // aligned prevents old browser data from resurrecting already-confirmed items.
                saveLocalPendingOdooUpdates(serverData);
                console.log(`📥 Cargados ${serverData.length} cambios pendientes Odoo (servidor)`);
                if (localItems.length > serverData.length) {
                    console.log(`🧹 Limpiada caché local antigua de Odoo updates (${localItems.length} → ${serverData.length})`);
                }
                return serverData;
            }
        } catch (error) {
            console.error('Error loading pending Odoo updates from server:', error);
        }

        if (localItems.length > 0) {
            console.log(`📥 Cargados ${localItems.length} cambios pendientes Odoo (localStorage)`);
            return localItems;
        }
        return [];
    },

    /**
     * Add a change to the shared pending Odoo updates (for ejecutor to see)
     * CRITICAL: Only products approved by analyst should be added
     */
    addPendingOdooUpdate: async (change: any) => {
        try {
            // VALIDATION 1: Ensure the item has at least one approval
            if (!change.costApproved && !change.priceApproved) {
                console.warn(`⚠️ Skipping ${change.description} - No approvals found`);
                return;
            }

            const existingLocal = loadLocalPendingOdooUpdates();
            const existingIndex = existingLocal.findIndex((c: any) => c.id === change.id);
            if (existingIndex >= 0) {
                existingLocal[existingIndex] = { ...existingLocal[existingIndex], ...change };
            } else {
                existingLocal.push(change);
            }
            saveLocalPendingOdooUpdates(existingLocal);

            console.log(`🔵 Adding approved change to Odoo updates: ${change.description}`);
            console.log(`   - Cost approved: ${change.costApproved} (${change.cost} → ${change.newCost || change.cost})`);
            console.log(`   - Price approved: ${change.priceApproved} (${change.price} → ${change.newPrice || change.price})`);
            console.log(`   - Approved by: ${change.costApprovedBy || change.priceApprovedBy}`);

            const response = await fetch('/api/progress/odoo_update/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item: change })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.added) {
                    console.log(`✅ Change added to Odoo updates. Total: ${result.total}`);
                } else if (result.updated) {
                    console.log(`🔄 Change updated in Odoo updates. Total: ${result.total}`);
                } else {
                    console.log('ℹ️ Change already existed in Odoo updates');
                }
            } else {
                throw new Error('Server returned error');
            }
        } catch (error) {
            console.error('❌ Error adding pending Odoo update:', error);
            // Fallback: Try to add directly
            try {
                console.log('🔄 Attempting fallback method...');
                const existing = await StorageService.loadPendingOdooUpdates();

                // Check if already exists
                const existingIndex = existing.findIndex((c: any) => c.id === change.id);

                if (existingIndex >= 0) {
                    // Update existing
                    existing[existingIndex] = { ...existing[existingIndex], ...change };
                    console.log('🔄 Updated existing item in fallback');
                } else {
                    // Add new
                    existing.push(change);
                    console.log('➕ Added new item in fallback');
                }

                await StorageService.savePendingOdooUpdates(existing);
                console.log(`✅ Fallback successful. Total: ${existing.length}`);
            } catch (e) {
                console.error('❌ Fallback also failed:', e);
            }
        }
    },

    returnItemToAnalyst: async (id: string) => {
        try {
            await fetch('/api/progress/odoo_update/return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            console.log(`↩️ Item devuelto al analista: ${id}`);
        } catch (error) {
            console.error('❌ Error devolviendo item a analista:', error);
        }
    },

    /**
     * Remove a change from pending Odoo updates
     * CRITICAL: This must execute successfully to prevent duplicate confirmations
     */
    removePendingOdooUpdate: async (changeId: string) => {
        const localItems = loadLocalPendingOdooUpdates().filter((c: any) => c.id !== changeId);
        saveLocalPendingOdooUpdates(localItems);

        try {
            const response = await fetch(`/api/progress/odoo_update/${encodeURIComponent(changeId)}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Server error');
            const result = await response.json();
            console.log(`🗑️ Removed ${changeId}. Remaining: ${result.total}`);
        } catch (error) {
            console.error(`❌ Error removing pending Odoo update ${changeId}:`, error);
        }
    },

    saveSharedExcelAccumulator: async (items: any[]) => {
        try {
            await fetch('/api/progress/excel_accumulator', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: items, userId: 'shared' })
            });
            console.log(`💾 Guardados ${items.length} items en Excel Acumulado Compartido`);
        } catch (error) {
            console.error('Error saving shared excel accumulator:', error);
        }
    },

    addToExcelAccumulator: async (item: any, userId: string | null) => {
        try {
            // MATCHING KEY with SystemUpdate.tsx: priceflow_excel_data_${userId}
            const excelKey = getUserStorageKey(userId, undefined, 'priceflow_excel_data');
            const savedData = localStorage.getItem(excelKey);
            const currentData = savedData ? JSON.parse(savedData) : [];

            const calculateMargin = (cost: number, price: number): number => {
                if (price === 0) return 0;
                return ((price - cost) / price) * 100;
            };

            const finalCost = item.costApproved ? (item.newCost || item.cost) : item.cost;
            const finalPrice = item.priceApproved ? (item.newPrice || item.price) : item.price;

            const newRow = {
                barcode: item.barcode,
                description: item.description,
                provider: (item.provider && item.provider !== 'Provider File' && item.provider !== 'Carga Proveedor' ? item.provider : null) || item.supplierName || item.batchSupplierName || 'N/A',
                oldCost: item.cost,
                newCost: finalCost,
                costMargin: calculateMargin(finalCost, finalPrice),
                oldPrice: item.price,
                newPrice: finalPrice,
                priceMargin: calculateMargin(finalCost, finalPrice),
                timestamp: new Date().toISOString()
            };

            const existingIndex = currentData.findIndex((r: any) => r.barcode === newRow.barcode);
            let updatedData;
            if (existingIndex >= 0) {
                updatedData = [...currentData];
                updatedData[existingIndex] = newRow;
                console.log(`📊 Actualizado en Excel Acumulado (Local): ${newRow.description}`);
            } else {
                updatedData = [...currentData, newRow];
                console.log(`📊 Agregado a Excel Acumulado (Local): ${newRow.description}`);
            }
            localStorage.setItem(excelKey, JSON.stringify(updatedData));
            console.log(`📊 Excel Acumulado (Local) Total: ${updatedData.length}`);

            // ALSO save to SHARED storage for Executors to see
            try {
                // First load existing shared data to append
                const sharedData = await StorageService.loadSharedExcelAccumulator();

                const existingSharedIndex = sharedData.findIndex((r: any) => r.barcode === newRow.barcode);
                let updatedSharedData;
                if (existingSharedIndex >= 0) {
                    updatedSharedData = [...sharedData];
                    updatedSharedData[existingSharedIndex] = newRow;
                    console.log(`📊 Actualizado en Excel Acumulado (Compartido): ${newRow.description}`);
                } else {
                    updatedSharedData = [...sharedData, newRow];
                    console.log(`📊 Agregado a Excel Acumulado (Compartido): ${newRow.description}`);
                }

                await fetch('/api/progress/excel_accumulator', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: updatedSharedData, userId: 'shared' })
                });
                console.log(`📊 Excel Acumulado (Compartido) Total: ${updatedSharedData.length}`);
            } catch (err) {
                console.error('Error syncing to shared excel accumulator:', err);
            }

        } catch (error) {
            console.error('Error adding to Excel accumulator:', error);
        }
    },

    removeExcelAccumulatorItem: async (barcode: string, userId: string | null) => {
        try {
            // 1. Remove from Local Accumulator
            const excelKey = getUserStorageKey(userId, undefined, 'priceflow_excel_data');
            const savedData = localStorage.getItem(excelKey);
            if (savedData) {
                const currentData = JSON.parse(savedData);
                const updatedData = currentData.filter((r: any) => r.barcode !== barcode);
                localStorage.setItem(excelKey, JSON.stringify(updatedData));
                console.log(`📊 Eliminado de Excel Local: ${barcode}`);
            }

            // 2. Remove from SHARED Accumulator
            const sharedData = await StorageService.loadSharedExcelAccumulator();
            const updatedShared = sharedData.filter((r: any) => r.barcode !== barcode);

            if (updatedShared.length !== sharedData.length) {
                await fetch('/api/progress/excel_accumulator', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: updatedShared, userId: 'shared' })
                });
                console.log(`📊 Eliminado de Excel Compartido: ${barcode}`);
            }
        } catch (error) {
            console.error('Error removing from Excel accumulator:', error);
        }
    },

    loadSharedExcelAccumulator: async (): Promise<any[]> => {
        try {
            const response = await fetch(`/api/progress/excel_accumulator?userId=shared&_t=${Date.now()}`);
            if (response.ok) {
                const items = await response.json();
                console.log(`📥 Cargados ${items.length} items del Excel Acumulado Compartido`);
                return items;
            }
        } catch (error) {
            console.error('❌ Error loading shared excel accumulator:', error);
        }
        return [];
    },

    saveGlobalWorksheetItems: async (items: any[]) => {
        try {
            await fetch('/api/progress/global_worksheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: items })
            });
            console.log(`💾 Global worksheet items saved: ${items.length}`);
        } catch (error) {
            console.error('Error saving global worksheet items:', error);
        }
    },

    loadGlobalWorksheetItems: async (): Promise<any[]> => {
        try {
            const response = await fetch(`/api/progress/global_worksheet?_t=${Date.now()}`);
            if (response.ok) {
                const items = await response.json();
                return items;
            }
        } catch (error) {
            console.error('Error loading global worksheet items:', error);
        }
        return [];
    },

    saveCurrentFile: (filename: string | null, userId: string | null, userRole?: string) => {
        try {
            const key = getUserStorageKey(userId, userRole, 'current_provider_file');
            if (filename) {
                localStorage.setItem(key, filename);
            } else {
                localStorage.removeItem(key);
            }
        } catch (error) {
            console.error('Error saving current file:', error);
        }
    },


    loadCurrentFile: (userId: string | null, userRole?: string): string | null => {
        try {
            const key = getUserStorageKey(userId, userRole, 'current_provider_file');
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }
};
