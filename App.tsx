import React, { useState, useEffect, useRef } from 'react';
import { MergedItem, SupplierInputItem, ChangeStatus, OdooProduct } from './types';
import { MOCK_ODOO_PRODUCTS } from './constants';
import { fetchOdooProducts, updateProductPrice } from './services/odooService';
import { StorageService } from './services/storageService';
import { HistoryService } from './services/historyService';
import { Dashboard } from './components/Dashboard';
import { Ingestion } from './components/Ingestion';
import { Worksheet } from './components/Worksheet';
import { SystemUpdate } from './components/SystemUpdate';
import { FailedConfirmationsPage } from './components/FailedConfirmationsPage';
import { StoreExecution } from './components/StoreExecution';
import { History } from './components/History';
import { RevertChanges } from './components/RevertChanges';
import { ActivityMonitor } from './components/ActivityMonitor';
import { MgvExport } from './components/MgvExport';
import { NotificationCenter, Notification } from './components/NotificationCenter';
import { ProviderUpload } from './components/ProviderUpload';
import { ArchivedSheets } from './components/ArchivedSheets';
import { CreateUserModal } from './components/CreateUserModal';
import { ProfileModal } from './components/ProfileModal';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { DownloadData } from './components/DownloadData';
import { LayoutDashboard, FileInput, Table, Database, Tag, Bell, FileClock, Upload, Menu, UserPlus, LogOut, User, FileText, X, Download, RotateCcw, Activity, AlertTriangle, Scale } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';

const App: React.FC = () => {
    const { user, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'dashboard' | 'ingestion' | 'worksheet' | 'system' | 'store' | 'history' | 'provider' | 'archive' | 'download' | 'revert' | 'monitor' | 'failed' | 'mgv'>(() => {
        try {
            const savedUser = localStorage.getItem('priceflow_user');
            if (savedUser) {
                const u = JSON.parse(savedUser);
                const savedTab = localStorage.getItem(`priceflow_active_tab_${u.id}`);
                if (savedTab) return savedTab as any;
            }
        } catch (e) {}
        return user?.role === 'sala' ? 'store' :
            user?.role === 'proveedor' ? 'provider' :
                user?.role === 'analista' ? 'ingestion' :
                    user?.role === 'ejecutor' ? 'system' :
                        'dashboard';
    });
    const [odooProducts, setOdooProducts] = useState<OdooProduct[]>([]);
    const [items, setItems] = useState<MergedItem[]>([]);
    const [initialWorksheetMode, setInitialWorksheetMode] = useState<'inbox' | 'pending_price' | 'pending_sheets'>('inbox');
    const [odooLastUpdate, setOdooLastUpdate] = useState<Date | null>(() => {
        const savedUser = localStorage.getItem('priceflow_user');
        if (savedUser) {
            try {
                const userData = JSON.parse(savedUser);
                return StorageService.getLastSync(userData.id, userData.role);
            } catch { return null; }
        }
        return null;
    });
    const [odooSyncStatus, setOdooSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [csvLoadStatus, setCsvLoadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [executedBarcodes, setExecutedBarcodes] = useState<Set<string>>(new Set());
    const loggedActions = useRef<Set<string>>(new Set());
    const recentNotifications = useRef<Set<string>>(new Set());

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [currentProviderFile, setCurrentProviderFile] = useState<string | null>(null);
    const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [isNubaToggled, setIsNubaToggled] = useState(false);
    const [persistentNotifications, setPersistentNotifications] = useState<Notification[]>(() => {
        try {
            const savedUser = localStorage.getItem('priceflow_user');
            if (savedUser) {
                const u = JSON.parse(savedUser);
                const savedNotifs = localStorage.getItem(`priceflow_persistent_notifs_${u.id}`);
                return savedNotifs ? JSON.parse(savedNotifs) : [];
            }
        } catch (e) {
            console.error('Error loading persistent notifications:', e);
        }
        return [];
    });
    const [showBellDropdown, setShowBellDropdown] = useState(false);

    // Persist active tab so page reload returns to same location
    useEffect(() => {
        if (user?.id) {
            localStorage.setItem(`priceflow_active_tab_${user.id}`, activeTab);
        }
    }, [activeTab, user?.id]);

    // Notification helper with deduplication
    const addNotification = (type: 'success' | 'error' | 'info', title: string, message: string) => {
        const notifKey = `${title}|||${message}`;
        if (recentNotifications.current.has(notifKey)) return;
        const isDuplicate = notifications.some(n => n.message === message && n.title === title);
        if (isDuplicate) return;

        const id = `notif-${Date.now()}-${Math.random()}`;
        recentNotifications.current.add(notifKey);
        setTimeout(() => recentNotifications.current.delete(notifKey), 100);

        setNotifications(prev => [...prev, { id, type, title, message }]);
        setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 5000);
    };

    const dismissNotification = (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    // Save persistent notifications to localStorage whenever they change
    useEffect(() => {
        if (user?.id) {
            localStorage.setItem(`priceflow_persistent_notifs_${user.id}`, JSON.stringify(persistentNotifications));
        }
    }, [persistentNotifications, user?.id]);

    // Helper to extract provider name from filename (e.g., PROVIDER_NAME_2025-01-01_10-00-00.csv)
    const extractProviderFromFilename = (filename: string): string => {
        if (!filename) return 'Carga Proveedor';

        // Remove .csv extension
        let name = filename.replace(/\.csv$/i, '');

        // Remove the timestamp (_YYYY-MM-DD_HH-MM-SS) which is usually the last 20 characters
        // Format: _2025-12-19_10-51-10 (1 + 10 + 1 + 8 = 20 chars)
        if (name.length > 20) {
            const timestampRegex = /_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/;
            name = name.replace(timestampRegex, '');
        }

        // Replace underscores with spaces and capitalize
        return name.split('_').join(' ');
    };

    // Poll for SHARED notifications
    useEffect(() => {
        const checkNotifications = async () => {
            if (!user?.role) return;

            // Consume notifications relevant to this user's role and ID
            try {
                const newNotifs = await StorageService.consumeSharedNotifications(user.role, user.id);
                if (newNotifs.length > 0) {
                    newNotifs.forEach(n => {
                        // 1. Show floating toast for EVERYTHING
                        addNotification(n.type, n.title, n.message);

                        // 2. Persistent storage ONLY for specific notifications if role is analista or ejecutor
                        if ((user.role === 'analista' || user.role === 'ejecutor') && n.title === 'Confirmado en Odoo') {
                            setPersistentNotifications(prev => {
                                // Prevent duplicates in persistent list too
                                if (prev.some(p => p.message === n.message && p.title === n.title)) return prev;
                                return [{ id: n.id || `persist-${Date.now()}-${Math.random()}`, type: n.type, title: n.title, message: n.message }, ...prev];
                            });
                        }
                    });
                }
            } catch (e) {
                console.warn("Notification poll failed", e);
            }
        };

        const interval = setInterval(checkNotifications, 10000); // 10s
        checkNotifications(); // Initial check

        return () => clearInterval(interval);
    }, [user?.role, user?.id]);

    // Load history to get locally executed items
    useEffect(() => {
        const loadExecutedItems = async () => {
            const history = await HistoryService.getHistory(null, undefined);

            // Should match StoreExecution logic: Filter by user ID if logged in
            const executed = new Set(
                history
                    .filter(h => h.action === 'STORE_EXECUTION' && (!user || h.userId === user.id))
                    .map(h => h.productId)
                    .filter(Boolean)
            );
            setExecutedBarcodes(executed);
        };
        loadExecutedItems();
    }, [user]);

    useEffect(() => {
        const loadData = async () => {
            const userId = user?.id || null;
            const userRole = user?.role;

            // First check if we have products in localStorage as a quick fallback
            const savedProducts = await StorageService.loadProducts(userId, userRole);
            const lastSync = StorageService.getLastSync(userId, userRole);

            // Load saved workflow items for this user
            const savedItems = await StorageService.loadWorkflowItems(userId, userRole);
            if (savedItems.length > 0) {
                setItems(savedItems);
                console.log(`📋 Cargados ${savedItems.length} items de trabajo para usuario ${userId || 'guest'}`);

                // Removed auto-recovery logic that was incorrectly reverting confirmed items to pending
                const needsReset = false;
                if (needsReset) {
                    // This block no longer resets confirmed items
                }
            }

            const savedFile = StorageService.loadCurrentFile(userId, userRole);
            if (savedFile) {
                setCurrentProviderFile(savedFile);
                console.log(`📂 Restaurado archivo de proveedor activo: ${savedFile}`);

                // Patch restored items if they have 'Provider File'
                const pName = extractProviderFromFilename(savedFile);
                setItems(prev => prev.map(item => {
                    const actualProvider = (item.supplierName && item.supplierName !== 'Carga Proveedor') ? item.supplierName : pName;
                    return {
                        ...item,
                        provider: (item.provider === 'Provider File' || !item.provider) ? actualProvider : item.provider,
                        batchSupplierName: (item.batchSupplierName === 'Carga Proveedor' || !item.batchSupplierName) ? actualProvider : item.batchSupplierName,
                        supplierName: (item.supplierName === 'Carga Proveedor' || !item.supplierName) ? actualProvider : item.supplierName
                    };
                }));
            }

            // Always try to load from the latest CSV first
            console.log('📁 Intentando cargar desde el CSV más reciente...');
            let csvData = null;
            try {
                const forceFull = !(savedProducts && savedProducts.length > 0);
                csvData = await StorageService.loadProductsFromLatestCSV(userId, userRole, forceFull);
            } catch (error) {
                console.warn('⚠️ Error al cargar CSV desde servidor:', error);
            }

            if (csvData && csvData !== 'NOT_MODIFIED') {
                // Map CSV strings to typed OdooProduct format
                const typedProducts: OdooProduct[] = csvData.products.map((p: any) => ({
                    barcode: p.Barcode || '',
                    supplierCode: p['Código Proveedor'] || '',
                    description: p['Descripción'] || '',
                    cost: parseFloat((parseFloat(p.Costo) || 0).toFixed(2)),
                    price: parseFloat((parseFloat(p.Precio) || 0).toFixed(2)),
                    supplierName: p['Proveedor Odoo'] || 'N/A',
                    category: p['Categoría'] || '',
                    provider: p.Provider || 'N/A',
                    stock: parseFloat(p.Stock) || 0
                }));

                setOdooProducts(typedProducts);
                const modDate = new Date(csvData.modified);
                setOdooLastUpdate(modDate);
                setOdooSyncStatus('success');

                // HEAL: Ensure local storage reflects this server-side sync date
                StorageService.updateLastSync(modDate, userId, userRole);

                // Save to localStorage for backup
                await StorageService.saveProducts(typedProducts, userId, userRole);

                console.log('✅ Cargados ' + typedProducts.length + ' productos desde ' + csvData.filename);
            } else {
                // Fallback to localStorage if no CSV found, server unavailable, or NOT_MODIFIED
                console.log(csvData === 'NOT_MODIFIED' ? '🔄 Datos sin modificar, usando localStorage...' : '📦 Usando localStorage como respaldo...');
                if (savedProducts && savedProducts.length > 0) {
                    setOdooProducts(savedProducts);
                    setOdooLastUpdate(lastSync);
                    setOdooSyncStatus('success');
                    console.log('📦 Cargados ' + savedProducts.length + ' productos desde localStorage');
                } else {
                    // No data at all - force a full sync automatically
                    console.log('ℹ️ No hay datos disponibles, iniciando sincronización automática con Odoo');
                    handleLoadOdoo(undefined, true);
                }
            }
        };

        loadData();
    }, [user]); // Re-run when user changes

    // Save workflow items whenever they change (General Save) with simple manual debounce
    useEffect(() => {
        if (!user || items.length === 0) return;

        const timer = setTimeout(() => {
            // Always save to user's personal workflow storage
            StorageService.saveWorkflowItems(items, user.id, user.role);

            // If User is Analyst, ALSO save to global shared location for Admin visibility
            if (user.role === 'analista') {
                StorageService.saveGlobalWorksheetItems(items);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [items, user]);

    // Emergency save before page closes/reloads — prevents data loss on unexpected reloads
    useEffect(() => {
        if (!user) return;
        const handleBeforeUnload = () => {
            if (items.length > 0) {
                StorageService.saveWorkflowItems(items, user.id, user.role);
                if (user.role === 'analista') {
                    StorageService.saveGlobalWorksheetItems(items);
                }
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [items, user]);

    // Auto-save progress for CURRENT SHEET (Specific Save)
    // This allows continuing work exactly where left off for a specific provider file
    useEffect(() => {
        if (currentProviderFile && items.length > 0) {
            const saveKey = `progress_sheet_${currentProviderFile}`;
            localStorage.setItem(saveKey, JSON.stringify(items));
        }
    }, [items, currentProviderFile]);

    // Auto-sync Odoo periodically (only incremental changes)
    useEffect(() => {
        if (!user || (user.role !== 'analista' && user.role !== 'ejecutor')) return;

        const checkAndSync = () => {
            if (odooSyncStatus !== 'syncing') {
                const now = new Date().getTime();
                const last = odooLastUpdate ? odooLastUpdate.getTime() : 0;
                // If it's been at least 9.5 minutes since last update, trigger sync
                // We use 9.5 to account for slight interval drift
                if (now - last >= 9.5 * 60 * 1000) {
                    console.log("🔄 Ejecutando sincronización automática incremental de Odoo...");
                    handleLoadOdoo(undefined, false).catch(err => console.error("Auto-sync failed", err));
                }
            }
        };

        const interval = setInterval(checkAndSync, 60 * 1000); // Check every minute

        // Also check when the user returns to the tab (browsers suspend intervals in background)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkAndSync();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user, odooSyncStatus, odooLastUpdate]);

    // Background poll for the latest Odoo CSV from server every 3 minutes (for all users)
    // This ensures that if ANY user syncs, EVERYONE sees it soon without manual sync.
    useEffect(() => {
        if (!user) return;

        const pollCSV = async () => {
            try {
                // Avoid polling if we are currently performing a manual sync
                if (odooSyncStatus === 'syncing') return;

                const csvData = await StorageService.loadProductsFromLatestCSV(user.id, user.role);
                if (csvData && csvData !== 'NOT_MODIFIED') {
                    const modDate = new Date(csvData.modified);

                    // Precision check: Update if the server file is definitely newer than our last state update.
                    // We use a small threshold to ignore tiny clock drifts, 
                    // but we ensure that if another user syncs, we catch it.
                    const lastSyncTime = odooLastUpdate ? odooLastUpdate.getTime() : 0;
                    const fileTime = modDate.getTime();

                    // If file is at least 5 seconds newer than our last local state update OR we have no local date
                    const isNewer = !odooLastUpdate || (fileTime > lastSyncTime + 5000);

                    if (isNewer) {
                        console.log(`📡 [Poll] Detectado nuevo archivo de Odoo: ${csvData.filename} (${modDate.toLocaleString()}). Antiguo: ${odooLastUpdate?.toLocaleString() || 'Ninguno'}`);

                        const typedProducts: OdooProduct[] = csvData.products.map((p: any) => ({
                            barcode: p.Barcode || '',
                            supplierCode: p['Código Proveedor'] || '',
                            description: p['Descripción'] || '',
                            cost: parseFloat((parseFloat(p.Costo) || 0).toFixed(2)),
                            price: parseFloat((parseFloat(p.Precio) || 0).toFixed(2)),
                            supplierName: p['Proveedor Odoo'] || 'N/A',
                            category: p['Categoría'] || '',
                            provider: p.Provider || 'N/A',
                            stock: parseFloat(p.Stock) || 0
                        }));

                        setOdooProducts(typedProducts);
                        setOdooLastUpdate(modDate);
                        setOdooSyncStatus('success');

                        // Sync local storage to avoid discrepancies on reload
                        await StorageService.saveProducts(typedProducts, user.id, user.role);
                        StorageService.updateLastSync(modDate, user.id, user.role);
                    }
                }
            } catch (e) {
                console.warn("Error polling for latest Odoo CSV:", e);
            }
        };

        const interval = setInterval(pollCSV, 3 * 60 * 1000); // 3 minutes
        pollCSV(); // Check immediately on mount/user change
        return () => clearInterval(interval);
    }, [user, odooLastUpdate, odooSyncStatus]);

    async function handleLoadOdoo(onProgress?: (p: number, t: number) => void, forceFull: boolean = false): Promise<number> {
        setOdooSyncStatus('syncing');
        try {
            // Use last update date for incremental sync unless forced full
            const lastSyncParams = (forceFull || !odooLastUpdate) ? undefined : odooLastUpdate;

            const newProducts = await fetchOdooProducts(onProgress, lastSyncParams);

            if (newProducts.length === 0 && lastSyncParams) {
                const timeDiff = new Date().getTime() - lastSyncParams.getTime();
                const hoursDiff = timeDiff / (1000 * 3600);

                // If less than 4 hours have passed, just update local state without saving new CSV
                if (hoursDiff < 4) {
                    console.log("✅ Sincronización incremental: Sin cambios.");
                    setOdooSyncStatus('success');
                    setOdooLastUpdate(new Date());
                    StorageService.updateLastSync(new Date(), user?.id, user?.role);
                    return 0;
                }

                // If more than 4 hours, proceed to save a "Heartbeat" CSV to confirm system is alive
                console.log("❤️ Heartbeat: Sin cambios, pero actualizando archivo de respaldo...");
                // Don't return, let it fall through to save "odooProducts" as the final list
            }

            let finalProducts = newProducts;

            // Merge if incremental
            if (lastSyncParams && odooProducts.length > 0) {
                console.log(`🔀 Fusionando ${newProducts.length} cambios incrementales...`);
                // Create map for faster lookup/merge
                const productMap = new Map(odooProducts.map(p => [p.barcode, p]));

                // Update or Add new products
                newProducts.forEach(p => productMap.set(p.barcode, p));

                finalProducts = Array.from(productMap.values());
            }

            setOdooProducts(finalProducts);
            setOdooLastUpdate(new Date());

            await StorageService.saveProducts(finalProducts, user?.id || null, user?.role);
            await StorageService.saveProductsAsCSV(finalProducts, user?.id || null, user?.role);

            setOdooSyncStatus('success');

            // Notify if new items were found in auto-sync
            if (!forceFull && newProducts.length > 0) {
                addNotification('info', 'Odoo Actualizado', `Se detectaron y actualizaron ${newProducts.length} productos.`);
            }

            return finalProducts.length;
        } catch (error) {
            console.error('Error loading Odoo:', error);
            setOdooSyncStatus('error');
            throw error;
        }
    };

    const handleLoadCSV = async () => {
        setCsvLoadStatus('loading');
        setTimeout(() => setCsvLoadStatus('success'), 1000);
    };

    const handleSelectProvider = async (providerName: string) => {
        const providerProducts = odooProducts.filter(p => p.supplierName === providerName);

        if (providerProducts.length === 0) {
            alert(`No se encontraron productos para el proveedor: ${providerName}`);
            return;
        }

        // Generate CSV content
        const csvHeader = 'Código de Barras,Código Proveedor,Descripción,Costo,Precio,Proveedor,Categoría\n';
        const csvRows = providerProducts.map(p =>
            `"${p.barcode}","${p.supplierCode || ''}","${p.description}",${p.cost},${p.price},"${p.supplierName}","${p.category || ''}"`
        ).join('\n');
        const csvContent = csvHeader + csvRows;

        // Save CSV to server
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `proveedor_${timestamp}.csv`;

            const response = await fetch('/api/save-provider-csv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename, content: csvContent })
            });

            if (response.ok) {
                console.log(`✅ CSV de proveedor guardado: ${filename}`);
                addNotification('success', 'Proveedor Cargado', `${providerProducts.length} productos de ${providerName} guardados`);
            }
        } catch (error) {
            console.error('Error guardando CSV de proveedor:', error);
            addNotification('info', 'Advertencia', 'Productos cargados pero no se pudo guardar el archivo CSV');
        }

        const newItems: MergedItem[] = providerProducts.map((p, index) => ({
            ...p,
            id: `provider-${index}-${Date.now()}`,
            batchSupplierName: providerName,
            newCost: p.cost,
            suggestedPrice: p.price,
            newPrice: p.price,
            costApproved: false,
            priceApproved: false,
            systemUpdated: false,
            storeExecuted: false,
            status: ChangeStatus.PENDING,
            createdBy: user?.name || 'Usuario',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }));

        setItems(newItems);
        setActiveTab('worksheet');
    };

    const handleUploadSupplier = (supplierItems: SupplierInputItem[], supplierName: string) => {
        const newItems: MergedItem[] = supplierItems.map((sItem, index) => {
            const match = odooProducts.find(p => p.barcode === sItem.barcode) || {
                barcode: sItem.barcode,
                supplierCode: sItem.supplierCode,
                description: sItem.description + ' (NUEVO)',
                cost: 0,
                price: 0,
                supplierName: supplierName,
                category: 'N/A'
            };

            return {
                ...match,
                id: `change-${index}-${Date.now()}`,
                batchSupplierName: supplierName,
                newCost: sItem.newCost,
                suggestedPrice: sItem.suggestedPrice,
                newPrice: sItem.suggestedPrice || match.price,
                costApproved: false,
                priceApproved: false,
                systemUpdated: false,
                storeExecuted: false,
                status: ChangeStatus.PENDING,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        });

        // Replace existing items with new ones (per consistency with other import flows)
        setItems(newItems);
        setActiveTab('worksheet');
    };

    const [isLoading, setIsLoading] = useState(false); // Added isLoading state

    const handleLoadProviderFile = async (filename: string, shouldSwitchTab: boolean = true) => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/get-provider-csv/${filename}`);
            if (!response.ok) throw new Error('Failed to load file');
            const data = await response.json();
            const csvContent = data.content;

            // Load shared confirmed items to exclude them
            const pendingStoreChanges = await StorageService.loadPendingStoreChanges();
            const confirmedBarcodes = new Set(pendingStoreChanges.map((i: any) => i.barcode));

            // Progress check removed to always load fresh data
            // Any saved progress is ignored to ensure latest prices/stocks are matched


            setCurrentProviderFile(filename);
            const providerName = extractProviderFromFilename(filename);
            StorageService.saveCurrentFile(filename, user?.id || null, user?.role);

            // Load saved progress if available to restore user's work
            const saveKey = `progress_sheet_${filename}`;
            const savedProgressJson = localStorage.getItem(saveKey);
            let savedProgressMap = new Map<string, MergedItem>();

            if (savedProgressJson) {
                try {
                    const savedItems: MergedItem[] = JSON.parse(savedProgressJson);
                    // Map by barcode for fast lookup
                    savedItems.forEach(item => {
                        if (item.barcode) savedProgressMap.set(item.barcode, item);
                    });
                    console.log(`📂 Found saved progress for ${filename} with ${savedItems.length} items (Cost Approved/Pending Price will be restored)`);
                } catch (e) {
                    console.error("Error parsing saved progress:", e);
                }
            }

            const lines = csvContent.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

            // Fetch the latest Odoo CSV from server to ensure we have the most up-to-date data
            // Use StorageService to ensure we only get 'odoo_sync' files and not other random CSVs
            let latestOdooProducts: OdooProduct[] = odooProducts;
            try {
                const csvData = await StorageService.loadProductsFromLatestCSV(user?.id, user?.role);
                if (csvData && csvData !== 'NOT_MODIFIED' && csvData.products && Array.isArray(csvData.products)) {
                    console.log(`✅ Loaded fresh Odoo data from ${csvData.filename} (${csvData.products.length} products)`);
                    const freshProducts: OdooProduct[] = csvData.products.map((p: any) => ({
                        barcode: p.Barcode || '',
                        supplierCode: p['Código Proveedor'] || '',
                        description: p['Descripción'] || '',
                        cost: parseFloat((parseFloat(p.Costo) || 0).toFixed(2)),
                        price: parseFloat((parseFloat(p.Precio) || 0).toFixed(2)),
                        supplierName: p['Proveedor Odoo'] || 'N/A',
                        category: p['Categoría'] || '',
                        provider: p.Provider || 'N/A',
                        stock: parseFloat(p.Stock) || 0
                    }));

                    latestOdooProducts = freshProducts;

                    // CRITICAL: Update the global state as well so other components see fresh data
                    setOdooProducts(freshProducts);
                    if (csvData && typeof csvData === 'object' && 'modified' in csvData) {
                        setOdooLastUpdate(csvData.modified);
                    }
                    setOdooSyncStatus('success');

                    // Also persist to storage silently to keep state in sync
                    StorageService.saveProducts(freshProducts, user?.id || null, user?.role);
                }
            } catch (err) {
                console.warn("⚠️ Failed to load latest CSV, falling back to local state:", err);
            }

            // Map indexes
            const barcodeIdx = headers.findIndex(h => h.includes('Codigo Barra') || h.includes('Barra'));
            const descIdx = headers.findIndex(h => h.includes('Producto') || h.includes('Descripcion'));
            const costIdx = headers.findIndex(h => h.includes('Costo'));
            const priceIdx = headers.findIndex(h => h.includes('Precio'));

            const newItems: MergedItem[] = [];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;

                // Simple split by comma, respecting quotes would be better but simple split might work for now 
                // if we assume the standard format we generated (quoted strings)
                // A regex split is safer for CSVs with quotes
                const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
                const cols = matches || line.split(',');

                // Helper to clean quotes
                const clean = (val: string) => val ? val.replace(/^"|"$/g, '').replace(/""/g, '"').trim() : '';

                // We need a robust parser or simple indexed access if format is guaranteed
                // Since we generated it:
                // "barcode","desc",cost,price

                // Let's rely on our standard generator format:
                // cols[0] = barcode, cols[1] = desc, cols[2] = cost, cols[3] = price
                // But better to verify headers if possible. For now, assume fixed position if headers match

                let barcode = '', description = '', cost = 0, price = 0;

                if (line.includes('"')) {
                    // It has quotes, use regex match for simple CSV parsing
                    const regex = /(?:^|,)(?:"([^"]*)"|([^",]*))/g;
                    const matches = [];
                    let match;
                    while ((match = regex.exec(line)) !== null) {
                        matches.push(match[1] || match[2] || '');
                    }
                    if (matches.length >= 4) {
                        barcode = matches[0];
                        description = matches[1];
                        cost = parseFloat(parseFloat(matches[2]).toFixed(2)) || 0;
                        price = parseFloat(parseFloat(matches[3]).toFixed(2)) || 0;
                    }
                } else {
                    const parts = line.split(',');
                    if (parts.length >= 4) {
                        barcode = parts[0];
                        description = parts[1];
                        cost = parseFloat(parseFloat(parts[2]).toFixed(2)) || 0;
                        price = parseFloat(parseFloat(parts[3]).toFixed(2)) || 0;
                    }
                }

                if (!barcode) continue;

                // Normalize barcode for matching (remove leading zeros if numeric-like, or just trim)
                // Odoo might store as "0123" or "123". Let's try exact match first, then normalized.
                const cleanBarcode = barcode.trim();

                // Find match in Odoo products (using the LATEST fetched data)
                // Try exact match first, then try matching numeric values if possible
                let odooMatch = latestOdooProducts.find(p => p.barcode === cleanBarcode);

                if (!odooMatch) {
                    // Try to find by removing leading zeros if it looks numeric
                    const noLeadingZeros = cleanBarcode.replace(/^0+/, '');
                    if (noLeadingZeros !== cleanBarcode) {
                        odooMatch = latestOdooProducts.find(p => p.barcode === noLeadingZeros);
                    }
                }

                if (!odooMatch) {
                    console.log(`⚠️ No match found for provider barcode: ${cleanBarcode} (Desc: ${description})`);
                }

                const finalBarcode = odooMatch?.barcode || cleanBarcode;
                const savedItem = savedProgressMap.get(finalBarcode);

                // NO FILTRAR: Permitir abrir la hoja siempre, incluso si los items ya están confirmados.
                // Esto permite revisión y evita el error de "Archivo Vacío".
                const isLocalConfirmed = savedItem?.systemUpdated;
                const isSharedConfirmed = confirmedBarcodes.has(finalBarcode);
                const isExecuted = executedBarcodes.has(finalBarcode);

                // SIEMPRE usar valores del CSV del proveedor para newCost, newPrice, suggestedPrice
                // Solo usar savedItem si hay progreso guardado
                const calculatedNewCost = savedItem ? savedItem.newCost : cost;
                const calculatedNewPrice = savedItem ? savedItem.newPrice : price;
                const calculatedSuggestedPrice = price; // SIEMPRE del CSV

                const deterministicId = `pending-${filename.replace(/[^a-zA-Z0-9]/g, '_')}-${cleanBarcode}`;
                newItems.push({
                    id: savedItem?.id || deterministicId,
                    barcode: finalBarcode, // Prefer Odoo barcode if matched
                    supplierCode: odooMatch?.supplierCode || '',
                    description: odooMatch?.description || description,
                    batchSupplierName: odooMatch?.supplierName || providerName,
                    supplierName: odooMatch?.supplierName || providerName,
                    category: odooMatch?.category || 'N/A',
                    cost: odooMatch?.cost || 0, // Costo de Odoo (para comparación)
                    price: odooMatch?.price || 0, // Precio de Odoo (para comparación)

                    // VALORES DEL CSV DEL PROVEEDOR
                    newCost: calculatedNewCost,
                    newPrice: calculatedNewPrice,
                    suggestedPrice: calculatedSuggestedPrice,

                    // RESTORE STATUS
                    costApproved: savedItem ? (savedItem.costApproved || false) : false,
                    priceApproved: savedItem ? (savedItem.priceApproved || false) : false,
                    systemUpdated: savedItem ? (savedItem.systemUpdated || false) : false,
                    storeExecuted: savedItem ? (savedItem.storeExecuted || false) : false,
                    status: savedItem ? (savedItem.status || ChangeStatus.PENDING) : ChangeStatus.PENDING,

                    createdBy: user?.name || 'Admin',
                    createdAt: savedItem?.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    provider: odooMatch?.supplierName || providerName,
                    stock: odooMatch?.stock || 0
                });
            }

            if (newItems.length > 0) {
                // Removed auto-recovery logic during polling to prevent item regression
                const healedItems = newItems;

                if (shouldSwitchTab) {
                    // For Admin/Analyst when loading from Pending Sheets
                    setItems(healedItems);

                    // Smart tab selection: Go to where the work is
                    const hasInbox = healedItems.some(i => !i.systemUpdated && !i.costApproved);
                    const hasPendingPrice = healedItems.some(i => !i.systemUpdated && i.costApproved && !i.priceApproved);

                    if (!hasInbox && hasPendingPrice) {
                        setInitialWorksheetMode('pending_price');
                    } else {
                        setInitialWorksheetMode('inbox');
                    }

                    setActiveTab('worksheet');
                    addNotification('success', 'Archivo Cargado', `${healedItems.length} productos cargados ` + (savedProgressMap.size > 0 ? `(Progreso restaurado)` : ''));
                } else {
                    // For when we just want to confirm it was saved to history (e.g. from ProviderUpload)
                    setItems(healedItems);
                    addNotification('success', 'Carga Exitosa', `Archivo cargado al historial correctamente (${healedItems.length} productos).`);
                }
            } else {
                addNotification('info', 'Archivo Vacío', 'No se encontraron productos válidos en el archivo');
            }

        } catch (error) {
            console.error('Error loading provider file:', error);
            addNotification('error', 'Error Carga', 'No se pudo cargar el archivo');
            setIsLoading(false);
        } finally {
            setIsLoading(false);
        }
    };


    const handleApproveCost = async (id: string, approved: boolean) => {
        const item = items.find(i => i.id === id);
        if (!item) return;

        try {
            if (approved) {
                addNotification('success', 'Costo Aprobado', `${item.description} - Costo: Bs${(item.newCost || item.cost).toFixed(2)}`);

                // Log cost approval to history
                HistoryService.logAction({
                    action: 'COST_APPROVAL',
                    productId: item.barcode,
                    productName: item.description,
                    provider: item.provider || item.supplierName || item.batchSupplierName,
                    oldCost: item.cost,
                    newCost: item.newCost || item.cost,
                    user: user?.name || 'User',
                    details: `Costo aprobado por Analista. Pendiente de actualización en sistema.`
                }, user?.id || null, user?.role);

                // Add to shared Odoo updates list for ejecutor to see
                const updatedItemMetadata = {
                    ...item,
                    costApproved: true,
                    costApprovedBy: user?.name || 'Usuario',
                    costApprovedAt: new Date().toISOString(),
                    // PRESERVE price approval if it was already granted
                    priceApproved: item.priceApproved || false,
                    systemUpdated: false,
                    status: ChangeStatus.PENDING
                };
                await StorageService.addPendingOdooUpdate(updatedItemMetadata);
            }

            setItems(prev => prev.map(i => {
                if (i.id === id) {
                    return {
                        ...i,
                        costApproved: approved,
                        // Fix: Do not reset price approval when cost is re-approved
                        priceApproved: i.priceApproved,
                        costApprovedBy: approved ? (user?.name || 'Usuario') : undefined,
                        costApprovedAt: approved ? new Date().toISOString() : undefined,
                        // If approving cost, it's a new change pending system update
                        systemUpdated: approved ? false : i.systemUpdated,
                        status: approved ? ChangeStatus.PENDING : i.status
                    };
                }
                return i;
            }));
        } catch (error) {
            console.error('Error approving cost:', error);
        }
    };

    const handleApprovePrice = async (id: string, approved: boolean) => {
        const item = items.find(i => i.id === id);
        if (!item) return;

        if (approved) {
            // Changed from > 0.005 to > 0.0001 to allow minimal changes (e.g., 0.01 cents)
            const hasPriceChanged = Math.abs((item.newPrice || item.price) - item.price) > 0.0001;
            const hasCostChanged = Math.abs((item.newCost || item.cost) - item.cost) > 0.0001;

            // Only skip Executor and Store if BOTH price and cost haven't changed
            if (!hasPriceChanged && !hasCostChanged) {
                HistoryService.logAction({
                    action: 'PRICE_KEPT',
                    productId: item.barcode,
                    productName: item.description,
                    provider: item.provider || item.supplierName || item.batchSupplierName,
                    oldPrice: item.price,
                    newPrice: item.price,
                    oldCost: item.cost,
                    newCost: item.cost,
                    user: user?.name || 'User',
                    details: `Analista no realizó cambios en costo ni precio. Se envía a Ejecutor para fines de registro.`
                }, user?.id || null, user?.role);

                // Add to shared Odoo updates list anyway so it shows in Excel/History
                const updatedItemMetadata = {
                    ...item,
                    priceApproved: true,
                    priceApprovedBy: user?.name || 'Usuario',
                    priceApprovedAt: new Date().toISOString(),
                    systemUpdated: false,
                    status: ChangeStatus.PENDING
                };
                await StorageService.addPendingOdooUpdate(updatedItemMetadata);
            } else {
                // REGULAR APPROVAL (Price or Cost Changed)
                const message = hasPriceChanged
                    ? `${item.description} - Precio: Bs${(item.newPrice || item.price).toFixed(2)}`
                    : `${item.description} - Costo Actualizado`;

                addNotification('success', hasPriceChanged ? 'Precio Aprobado' : 'Costo Aprobado', message);

                // Log price approval to history
                HistoryService.logAction({
                    action: 'PRICE_APPROVAL',
                    productId: item.barcode,
                    productName: item.description,
                    provider: item.provider || item.supplierName || item.batchSupplierName,
                    oldPrice: item.price,
                    newPrice: item.newPrice || item.price,
                    oldCost: item.cost,
                    newCost: item.newCost || item.cost,
                    user: user?.name || 'User',
                    details: (hasPriceChanged && hasCostChanged)
                        ? `Costo y Precio aprobados por Analista`
                        : hasPriceChanged
                            ? `Precio aprobado y Costo mantenido por Analista`
                            : `Costo aprobado y Precio mantenido por Analista`
                }, user?.id || null, user?.role);

                // Add to Excel accumulator immediately upon validation/approval
                StorageService.addToExcelAccumulator(item, user?.id || null);

                // Add to shared Odoo updates list for ejecutor to see
                const updatedItemMetadata = {
                    ...item,
                    priceApproved: true,
                    priceApprovedBy: user?.name || 'Usuario',
                    priceApprovedAt: new Date().toISOString(),
                    // Ensure it shows as pending for executor even if cost was already updated
                    systemUpdated: false,
                    status: ChangeStatus.PENDING
                };
                await StorageService.addPendingOdooUpdate(updatedItemMetadata);
            }
        }

        setItems(prev => prev.map(i => {
            if (i.id === id) {
                return {
                    ...i,
                    priceApproved: approved,
                    priceApprovedBy: approved ? (user?.name || 'Usuario') : undefined,
                    priceApprovedAt: approved ? new Date().toISOString() : undefined,
                    systemUpdated: approved ? false : i.systemUpdated,
                    status: approved ? ChangeStatus.PENDING : i.status
                };
            }
            return i;
        }));
    };

    const handleUpdateNewPrice = (id: string, price: number) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, newPrice: price };
            }
            return item;
        }));
    };

    const handleUpdateNewCost = (id: string, cost: number) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, newCost: cost };
            }
            return item;
        }));
    };

    const handleUpdateSystem = async (id: string, providedItem?: MergedItem): Promise<boolean> => {
        const itemToUpdate = items.find(i => i.id === id) || providedItem;
        if (!itemToUpdate) return false;

        try {

            // Update Odoo price (simulated or real)
            // CRITICAL FIX: Only send new price if it was approved by analyst. 
            // Otherwise, keep the current price. Same for cost.
            const priceToSend = itemToUpdate.priceApproved ? (itemToUpdate.newPrice || itemToUpdate.price) : itemToUpdate.price;
            const costToSend = itemToUpdate.costApproved ? (itemToUpdate.newCost || itemToUpdate.cost) : itemToUpdate.cost;

            await updateProductPrice(
                itemToUpdate.barcode,
                priceToSend,
                costToSend,
                itemToUpdate.provider || itemToUpdate.supplierName || itemToUpdate.batchSupplierName
            );

            // Calculate if there is a REAL price change
            // Changed from > 0.005 to > 0.0001 to allow minimal changes (e.g., 0.01 cents)
            const isPriceChanged = Math.abs(priceToSend - itemToUpdate.price) > 0.0001;

            // Create updated item object
            const updatedItem = {
                ...itemToUpdate,
                newPrice: priceToSend,
                newCost: costToSend,
                systemUpdated: true,
                // If price changed, it waits for store. If cost only, it's fully done.
                status: isPriceChanged ? ChangeStatus.SYSTEM_UPDATED : ChangeStatus.STORE_EXECUTED,
                systemUpdatedAt: new Date().toISOString(),
                storeExecuted: !isPriceChanged, // Auto-execute if only cost changed
                storeExecutedAt: !isPriceChanged ? new Date().toISOString() : undefined
            };

            // Add to shared pending store changes for Sala de Ventas
            // ONLY if there is a price change!
            if (isPriceChanged) {
                await StorageService.addPendingStoreChange(updatedItem);

                // Send SHARED notification to Sala de Ventas
                StorageService.addSharedNotification(
                    {
                        title: 'Cambio Confirmado',
                        message: `${itemToUpdate.description} - Nuevo Precio: Bs${priceToSend.toFixed(2)}`,
                        type: 'success'
                    },
                    'sala'
                );
            } else {
                console.log(`ℹ️ Cost-only update for ${itemToUpdate.description}. Skipping Store Execution.`);
            }

            // Send SHARED notification to Analista & Ejecutor (Confirmation in Odoo)
            StorageService.addSharedNotification(
                {
                    title: 'Confirmado en Odoo',
                    message: `${itemToUpdate.description} - Actualizado exitosamente en sistema`,
                    type: 'success'
                },
                'analista'
            );

            StorageService.addSharedNotification(
                {
                    title: 'Confirmado en Odoo',
                    message: `${itemToUpdate.description} - Actualizado exitosamente en sistema`,
                    type: 'success'
                },
                'ejecutor'
            );

            // Also add locally for the current user if they are analista or ejecutor
            // (Only for system confirmation, not store notification)
            if (user?.role === 'analista' || user?.role === 'ejecutor') {
                const localNotif: Notification = {
                    id: `local-${Date.now()}-${Math.random()}`,
                    title: 'Confirmado en Odoo',
                    message: `${itemToUpdate.description} - Actualizado exitosamente en sistema`,
                    type: 'success'
                };
                setPersistentNotifications(prev => [localNotif, ...prev]);
            }

            // Remove from Odoo updates list (ejecutor no longer needs to see it)
            await StorageService.removePendingOdooUpdate(id);

            // Log system update to history
            HistoryService.logAction({
                action: 'PROVIDER_UPDATE',
                productId: itemToUpdate.barcode,
                productName: itemToUpdate.description,
                provider: itemToUpdate.provider || itemToUpdate.supplierName || itemToUpdate.batchSupplierName,
                oldPrice: itemToUpdate.price,
                newPrice: priceToSend,
                oldCost: itemToUpdate.cost,
                newCost: costToSend,
                user: user?.name || 'User',
                details: `Cambio confirmado - ${itemToUpdate.priceApproved ? `Precio: Bs${priceToSend.toFixed(2)}, ` : ''}Costo: Bs${costToSend.toFixed(2)}`
            }, user?.id || null, user?.role);

            setItems(prev => prev.map(item => {
                if (item.id === id) {
                    return updatedItem;
                }
                return item;
            }));

            addNotification('success', 'Cambio Confirmado', `${itemToUpdate.description} agregado a Excel y enviado a Sala`);

            return true;
        } catch (error) {
            console.error("Failed to update Odoo:", error);
            addNotification('error', 'Error de Actualización', `No se pudo actualizar ${itemToUpdate.description} en Odoo.`);
            return false;
        }
    };

    const handleReturnToInbox = async (id: string) => {
        const itemToReturn = items.find(i => i.id === id);
        if (!itemToReturn) return;

        try {
            // Use the existing backend endpoint to reset everywhere
            await StorageService.returnItemToAnalyst(id);

            // Update local state
            setItems(prev => {
                const newItems = prev.map(item => {
                    if (item.id === id) {
                        return {
                            ...item,
                            costApproved: false,
                            priceApproved: false,
                            costApprovedBy: null,
                            priceApprovedBy: null,
                            costApprovedAt: null,
                            priceApprovedAt: null,
                            status: ChangeStatus.PENDING,
                            systemUpdated: false
                        };
                    }
                    return item;
                });

                // Save progress
                if (currentProviderFile) {
                    localStorage.setItem(`progress_sheet_${currentProviderFile}`, JSON.stringify(newItems));
                }
                StorageService.saveWorkflowItems(newItems, user?.id || null);
                return newItems;
            });

            // Log to history
            HistoryService.logAction({
                action: 'RETURNED_TO_INBOX',
                productId: itemToReturn.barcode,
                productName: itemToReturn.description,
                provider: itemToReturn.provider || itemToReturn.supplierName || itemToReturn.batchSupplierName,
                user: user?.name || 'User',
                details: `Analista devolvió el producto a Bandeja de Entrada (Costos) para revisión.`
            }, user?.id || null, user?.role);

            addNotification('info', 'Producto devuelto', 'El producto ha vuelto a la Bandeja de Entrada de Costos.');
        } catch (error) {
            console.error('Error returning item to inbox:', error);
            addNotification('error', 'Error', 'No se pudo devolver el producto.');
        }
    };

    const handleReturnItem = async (id: string, providedItem?: MergedItem) => {
        const itemToReturn = items.find(i => i.id === id) || providedItem;
        if (!itemToReturn) return;

        try {
            await StorageService.returnItemToAnalyst(id);

            // Log return to history
            HistoryService.logAction({
                action: 'RETURNED',
                productId: itemToReturn.barcode,
                productName: itemToReturn.description,
                provider: itemToReturn.provider || itemToReturn.supplierName || itemToReturn.batchSupplierName,
                user: user?.name || 'User',
                details: `Ejecutor devolvió el producto al Analista por error o revisión.`
            }, user?.id || null, user?.role);

            // Update local state if present
            setItems(prev => prev.map(i => {
                if (i.id === id) {
                    return {
                        ...i,
                        costApproved: false,
                        priceApproved: false,
                        costApprovedBy: null,
                        priceApprovedBy: null,
                        costApprovedAt: null,
                        priceApprovedAt: null,
                        status: ChangeStatus.PENDING,
                        systemUpdated: false
                    };
                }
                return i;
            }));

            addNotification('info', 'Producto Devuelto', `Se ha devuelto ${itemToReturn.description} al Analista.`);

        } catch (error) {
            console.error("Failed to return item:", error);
            addNotification('error', 'Error', 'No se pudo devolver el producto.');
        }
    };

    const handleExecuteStore = (id: string) => {
        const item = items.find(i => i.id === id);
        if (!item) return;

        // Log store execution to history
        HistoryService.logAction({
            action: 'STORE_EXECUTION',
            productId: item.barcode,
            productName: item.description,
            provider: item.provider || item.supplierName || item.batchSupplierName,
            oldPrice: item.price,
            newPrice: item.newPrice || item.price,
            oldCost: item.cost,
            newCost: item.newCost || item.cost,
            user: user?.name || 'User',
            details: `Ejecutado en sala de ventas - Nuevo precio: Bs${(item.newPrice || item.price).toFixed(2)}`
        }, user?.id || null, user?.role);

        // Remove from shared pending store changes
        StorageService.removePendingStoreChange(id);

        addNotification('success', 'Ejecutado en Tienda', `${item.description} actualizado en sala de ventas`);

        setItems(prev => prev.map(i => {
            if (i.id === id) {
                return {
                    ...i,
                    storeExecuted: true,
                    status: ChangeStatus.STORE_EXECUTED,
                    storeExecutedAt: new Date().toISOString()
                };
            }
            return i;
        }));
    };

    const handleSaveProgress = () => {
        if (!currentProviderFile) {
            addNotification('error', 'No hay Archivo', 'No se ha cargado ningún archivo específico para guardar.');
            return;
        }

        const saveKey = `progress_sheet_${currentProviderFile}`;
        localStorage.setItem(saveKey, JSON.stringify(items));
        addNotification('success', 'Progreso Guardado', `Progreso guardado para: ${currentProviderFile} `);
    };

    const handleFinishSheet = async () => {
        if (!currentProviderFile) return;

        if (window.confirm('¿Confirmar que ha terminado con esta hoja? Se eliminará de la lista de pendientes.')) {
            try {
                // ARCHIVE the sheet instead of deleting it
                // We send the filename and all the items (data) to be saved as JSON
                const response = await fetch('/api/archive-sheet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: currentProviderFile, items })
                });

                if (!response.ok) {
                    throw new Error('Failed to archive sheet');
                }

                // Clear local progress
                localStorage.removeItem(`progress_sheet_${currentProviderFile}`);

                // BULK SYNC: Ensure ALL approved items are on the server before finishing
                const approvedToSync = items.filter(i => (i.priceApproved || i.costApproved) && !i.systemUpdated);
                if (approvedToSync.length > 0) {
                    console.log(`🔄 Sincronizando ${approvedToSync.length} items aprobados al ejecutor antes de finalizar...`);
                    for (const item of approvedToSync) {
                        await StorageService.addPendingOdooUpdate(item);
                    }
                }

                // Clear working items but KEEP approved/synced items for System Update
                // FIX: Keep cost-approved items too!
                setItems(prev => prev.filter(i => i.priceApproved || i.costApproved || i.systemUpdated));
                setCurrentProviderFile(null);
                StorageService.saveCurrentFile(null, user?.id || null, user?.role);
                setInitialWorksheetMode('pending_sheets');

                addNotification('success', 'Hoja Completada', 'El archivo ha sido procesado y eliminado de pendientes.');
            } catch (error) {
                console.error('Error completing sheet:', error);
                addNotification('error', 'Error', 'No se pudo finalizar la hoja.');
            }
        }
    };

    const handleSyncApprovedItems = async () => {
        const approvedToSync = items.filter(i => (i.priceApproved || i.costApproved) && !i.systemUpdated);
        if (approvedToSync.length === 0) {
            addNotification('info', 'Sin Pendientes', 'No hay productos aprobados pendientes de sincronizar.');
            return;
        }

        addNotification('info', 'Sincronizando...', `Enviando ${approvedToSync.length} productos al Ejecutor...`);

        try {
            let successCount = 0;
            for (const item of approvedToSync) {
                // Construct fresh metadata to ensure executor gets all flags
                const metadata = {
                    ...item,
                    priceApproved: item.priceApproved || false,
                    costApproved: item.costApproved || false,
                    systemUpdated: false,
                    status: ChangeStatus.PENDING
                };
                await StorageService.addPendingOdooUpdate(metadata);
                successCount++;
            }
            addNotification('success', 'Sincronización Completa', `Se han enviado ${successCount} productos a la lista de Actualizar Odoo.`);
        } catch (error) {
            console.error('Error syncing items:', error);
            addNotification('error', 'Error Sincronización', 'Hubo un error al enviar los productos al servidor.');
        }
    };

    const handleClearAll = () => {
        if (window.confirm('¿Estás seguro de que quieres eliminar todos los productos de la lista?')) {
            setItems([]);
            setInitialWorksheetMode('inbox'); // Ensure we return to clean state (not pending sheets list)

            // Persist the empty state using the service (handles both server and localStorage)
            if (user) {
                StorageService.saveWorkflowItems([], user.id, user.role);

                // Log global clear to history
                HistoryService.logAction({
                    action: 'LIST_CLEAR',
                    user: user.name || 'User',
                    details: 'Se vació la lista completa de la Hoja de Trabajo'
                }, user.id, user.role);
            }
            addNotification('success', 'Lista Limpiada', 'Todos los productos han sido eliminados');
        }
    };

    const handleOpenAnotherSheet = () => {
        // Limpiar sin confirmación
        setItems([]);
        setCurrentProviderFile(null);
        StorageService.saveCurrentFile(null, user?.id || null, user?.role);
        setInitialWorksheetMode('pending_sheets');

        // Persist the empty state
        if (user) {
            StorageService.saveWorkflowItems([], user.id, user.role);
        }
    };

    const handleDeleteItem = async (id: string, providedItem?: MergedItem) => {
        const itemToDelete = items.find(i => i.id === id) || providedItem;

        // 1. Remove from shared pending updates (Executor view)
        // We always try both to be safe, regardless of what's in local state
        await StorageService.removePendingOdooUpdate(id);

        // 2. Remove from shared store changes (Sala view)
        await StorageService.removePendingStoreChange(id);

        // 3. Remove from Excel accumulator (to keep report clean)
        if (itemToDelete) {
            await StorageService.removeExcelAccumulatorItem(itemToDelete.barcode, user?.id || null);
        }

        console.log(`🗑️ Item eliminado de listas compartidas: ${id}`);

        // 3. Update local state
        setItems(prev => prev.filter(item => item.id !== id));

        // Log deletion to history
        if (itemToDelete) {
            HistoryService.logAction({
                action: 'ITEM_DELETE',
                productId: itemToDelete.barcode,
                productName: itemToDelete.description,
                user: user?.name || 'User',
                details: `Producto eliminado de la lista: ${itemToDelete.description}`
            }, user?.id || null, user?.role);
        }
        addNotification('info', 'Item Eliminado', 'El item ha sido eliminado de la lista');
    };

    const handleClearSharedChanges = () => {
        if (window.confirm('¿Está seguro de que desea eliminar TODOS los cambios pendientes de TODOS los usuarios? Esta acción no se puede deshacer.')) {
            // Limpiar lista compartida
            localStorage.removeItem('priceflow_store_pending_changes');

            // Limpiar workflow items de todos los usuarios
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('priceflow_workflow_items_')) {
                    localStorage.removeItem(key);
                }
            });

            addNotification('success', 'Cambios Eliminados', 'Todos los cambios pendientes han sido eliminados');
            window.location.reload();
        }
    };

    const [salaCount, setSalaCount] = useState(0);

    // Poll for shared changes for ALL users (for badge count consistency)
    useEffect(() => {
        if (user) {
            const updateCount = async () => {
                const changes = await StorageService.loadPendingStoreChanges();
                // Fixed filter to include ALL items confirmed in Odoo
                // Fixed filter: For Admins, show total pending. For Salas, show their specific pending.
                const filteredItems = changes.filter(i =>
                    i.systemUpdated &&
                    !i.storeExecuted &&
                    // For Admin/Analyst, show everything pending. For Sala, show only what THEY haven't executed.
                    (user?.role !== 'sala' ? true : (!i.executedBy || !i.executedBy.includes(user?.id)))
                );

                // Stop deduplicating to show the full count of items (e.g. 356)
                setSalaCount(filteredItems.length);
            };

            updateCount();
            const interval = setInterval(updateCount, 15000); // 15s
            return () => clearInterval(interval);
        }
    }, [user, executedBarcodes]); // Re-run when executedBarcodes updates



    // Poll for pending Odoo updates (for Ejecutor badge count)
    const [ejecutorCount, setEjecutorCount] = useState(0);
    useEffect(() => {
        if (user?.role === 'ejecutor') {
            const updateEjecutorCount = async () => {
                try {
                    const updates = await StorageService.loadPendingOdooUpdates();
                    const pendingCount = updates.filter(i => (i.priceApproved || i.costApproved) && !i.systemUpdated).length;
                    setEjecutorCount(pendingCount);
                } catch (e) { }
            };

            updateEjecutorCount();
            const interval = setInterval(updateEjecutorCount, 15000); // 15s
            return () => clearInterval(interval);
        }
    }, [user?.role]);

    const worksheetCount = items.filter(i => !i.systemUpdated && !i.priceApproved).length;
    const systemCount = user?.role === 'ejecutor'
        ? ejecutorCount
        : items.filter(i => (i.priceApproved || i.costApproved) && !i.systemUpdated).length;

    // Use the polled count from shared storage for ALL users to ensure consistency across views
    // This fixes the mismatch where local items might show as 'ready' but haven't successfully synced to the shared list
    const storeCount = salaCount;

    const [failedCount, setFailedCount] = React.useState(() => {
        try {
            const key = `priceflow_failed_confirmations_${user?.id || 'guest'}`;
            return JSON.parse(localStorage.getItem(key) || '[]').length;
        } catch { return 0; }
    });

    const NavItem = ({ id, label, icon: Icon, count }: { id: typeof activeTab, label: string, icon: any, count?: number }) => (
        <button
            onClick={() => {
                if (id === 'worksheet' && items.length === 0) {
                    setInitialWorksheetMode('pending_sheets');
                }
                setActiveTab(id);
            }}
            className={`w-full flex items-center justify-between p-3 rounded-lg mb-2 transition-colors ${activeTab === id ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
        >
            <div className="flex items-center gap-3">
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
            </div>
            {count !== undefined && count > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === id ? 'bg-white text-indigo-600' : 'bg-gray-700 text-gray-300'}`}>
                    {count}
                </span>
            )}
        </button>
    );

    const handleRemoteUpdate = (id: string) => {
        setItems(prev => prev.map(item => {
            if (item.id === id) {
                return {
                    ...item,
                    systemUpdated: true,
                    status: ChangeStatus.SYSTEM_UPDATED,
                    systemUpdatedAt: new Date().toISOString()
                };
            }
            return item;
        }));
    };

    const handleDeleteProviderFile = async (filename: string): Promise<boolean> => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar el archivo "${filename}"? Esta acción no se puede deshacer.`)) {
            return false;
        }

        try {
            const response = await fetch(`/api/delete-provider-csv/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                addNotification('success', 'Archivo Eliminado', `El archivo ${filename} ha sido eliminado.`);
                return true;
            } else {
                addNotification('error', 'Error', 'No se pudo eliminar el archivo del servidor.');
                return false;
            }
        } catch (error) {
            addNotification('error', 'Error', 'Problema de conexión al eliminar el archivo.');
            return false;
        }
    };

    const handleDownloadProviderData = async (providerName: string) => {
        console.log(`Downloading Excel for ${providerName}`);

        const providerProducts = odooProducts.filter(p =>
            (p.provider === providerName) || (p.supplierName === providerName)
        );

        if (providerProducts.length === 0) {
            addNotification('error', 'Error', `No hay productos para ${providerName}`);
            return;
        }

        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Productos');

            // Define columns
            worksheet.columns = [
                { header: 'Código Barra', key: 'barcode', width: 20 },
                { header: 'Producto', key: 'description', width: 50 },
                { header: 'Costo Actual', key: 'cost', width: 15 },
                { header: 'Precio Actual', key: 'price', width: 15 },
                { header: 'Proveedor', key: 'provider', width: 30 }
            ];

            // Add rows
            const rows = providerProducts.map(p => ({
                barcode: p.barcode,
                description: p.description,
                cost: p.cost,
                price: p.price,
                provider: p.supplierName || ''
            }));

            worksheet.addRows(rows);

            // Style headers
            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4F46E5' } // Indigo-600 used in app
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
            headerRow.height = 30;

            // Format numbers (currency)
            worksheet.getColumn('cost').numFmt = '#,##0.00';
            worksheet.getColumn('price').numFmt = '#,##0.00';

            // Center align code and numbers
            worksheet.getColumn('barcode').alignment = { horizontal: 'left' };

            // Add borders to all data cells
            worksheet.eachRow((row, rowNumber) => {
                row.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            });

            // Trigger download
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const cleanName = providerName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            saveAs(blob, `${cleanName}_productos.xlsx`);

            addNotification('success', 'Descarga Completa', `Se exportaron ${providerProducts.length} productos correctamente.`);
        } catch (error) {
            console.error('Error generating Excel:', error);
            addNotification('error', 'Error', 'Falló la generación del Excel');
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 overflow-hidden">

            <aside className={`bg-gray-900 text-white flex flex-col shadow-xl transition-all duration-300 ease-in-out overflow-hidden ${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full opacity-0'}`}>
                <div className="p-6 border-b border-gray-800">
                    <h1 className="text-xl font-bold flex items-center gap-2 whitespace-nowrap">
                        <img src="/andys_logo.jpg" alt="Andy's" className="w-8 h-8 rounded-full object-cover" />
                        Andy's
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">Gestión de Precios v1.0</p>
                </div>

                <nav className="flex-1 p-4">
                    {/* Admin - Full access */}
                    {user?.role === 'admin' && (
                        <>
                            <NavItem id="dashboard" label="Panel de Control" icon={LayoutDashboard} />
                            <div className="my-4 border-t border-gray-800 opacity-50" />
                            <NavItem id="ingestion" label="Importar Datos" icon={FileInput} />
                            <NavItem id="provider" label="Cargar Proveedor" icon={Upload} />
                            <NavItem id="worksheet" label="Hoja de Trabajo" icon={Table} count={worksheetCount} />
                            <div className="my-4 border-t border-gray-800 opacity-50" />
                            <NavItem id="system" label="Actualizar Odoo" icon={Database} count={systemCount} />
                            <NavItem id="failed" label="Errores de Subida" icon={AlertTriangle} count={failedCount > 0 ? failedCount : undefined} />
                            <NavItem id="store" label="Sala de Ventas" icon={Tag} count={storeCount} />
                            <div className="my-4 border-t border-gray-800 opacity-50" />
                            <NavItem id="revert" label="Revertir Cambios" icon={RotateCcw} />
                            <NavItem id="mgv" label="Exportar MGV" icon={Scale} />
                            <NavItem id="monitor" label="Monitor Actividad" icon={Activity} />
                            <NavItem id="history" label="Historial" icon={FileClock} />
                        </>
                    )}

                    {/* Analista - Access to ingestion, provider, worksheet */}
                    {user?.role === 'analista' && (
                        <>
                            <NavItem id="ingestion" label="Importar Datos" icon={FileInput} />
                            <NavItem id="provider" label="Cargar Proveedor" icon={Upload} />
                            <NavItem id="worksheet" label="Hoja de Trabajo" icon={Table} count={worksheetCount} />
                            <NavItem id="archive" label="Excels Finalizados" icon={FileText} />
                            <NavItem id="download" label="Descargar Datos" icon={Download} />
                            <div className="my-4 border-t border-gray-800 opacity-50" />
                            <NavItem id="revert" label="Revertir Cambios" icon={RotateCcw} />
                            <NavItem id="mgv" label="Exportar MGV" icon={Scale} />
                            <NavItem id="history" label="Historial" icon={FileClock} />
                        </>
                    )}

                    {/* Ejecutor - Only access to system (Actualizar Odoo) */}
                    {user?.role === 'ejecutor' && (
                        <>
                            <NavItem id="system" label="Actualizar Odoo" icon={Database} count={systemCount} />
                            <NavItem id="failed" label="Errores de Subida" icon={AlertTriangle} count={failedCount > 0 ? failedCount : undefined} />
                            <div className="my-4 border-t border-gray-800 opacity-50" />
                            <NavItem id="revert" label="Revertir Cambios" icon={RotateCcw} />
                            <NavItem id="mgv" label="Exportar MGV" icon={Scale} />
                            <NavItem id="history" label="Historial" icon={FileClock} />
                        </>
                    )}

                    {/* Proveedor - Only provider upload */}
                    {user?.role === 'proveedor' && (
                        <NavItem id="provider" label="Cargar Productos" icon={Upload} />
                    )}

                    {/* Sala - Only store execution */}
                    {user?.role === 'sala' && (
                        <>
                            <NavItem id="store" label="Ejecución en Sala" icon={Tag} count={storeCount} />
                            <div className="my-4 border-t border-gray-800 opacity-50" />
                            <NavItem id="history" label="Historial" icon={FileClock} />
                        </>
                    )}
                </nav>

                {user?.role === 'admin' && (
                    <div className="p-4 border-t border-gray-800">
                        <button
                            onClick={() => setCreateUserModalOpen(true)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-lg"
                        >
                            <UserPlus className="w-5 h-5" />
                            <span className="font-medium">Crear Usuario</span>
                        </button>
                    </div>
                )}

                {(user?.role === 'admin' || user?.role === 'analista' || user?.role === 'ejecutor') && (
                    <div className="p-4 border-t border-gray-800">
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                            <div className={`w-2 h-2 rounded-full ${odooSyncStatus === 'success' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                            Odoo: {odooSyncStatus === 'success' ? 'Sincronizado' : 'Desconectado'}
                        </div>
                    </div>
                )}
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm z-10 p-4 flex justify-between items-center relative">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <h2 className="text-xl font-semibold text-gray-800">
                            {activeTab === 'dashboard' && 'Panel de Control General'}
                            {activeTab === 'ingestion' && 'Carga y Sincronización'}
                            {activeTab === 'worksheet' && 'Análisis y Aprobación de Precios'}
                            {activeTab === 'system' && 'Gestión de Sistema ERP'}
                            {activeTab === 'store' && 'Ejecución en Tienda'}
                            {activeTab === 'history' && 'Historial de Auditoría'}
                            {activeTab === 'provider' && 'Carga de Productos del Proveedor'}
                            {activeTab === 'archive' && 'Excels Finalizados'}
                            {activeTab === 'download' && 'Descargar Datos de Proveedor'}
                            {activeTab === 'revert' && 'Revertir Cambios'}
                            {activeTab === 'mgv' && 'Exportar MGV6 - Precios Balanza'}
                            {activeTab === 'monitor' && 'Monitor de Actividad'}
                            {activeTab === 'failed' && 'Errores de Subida a Odoo'}
                        </h2>

                    </div>

                    {/* Toggle Nuba/Andys for Executor - Centered */}
                    {activeTab === 'system' && user?.role === 'ejecutor' && (
                        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                            <a
                                href="http://208.87.133.212:3001/"
                                onClick={() => setIsNubaToggled(true)}
                                className="flex items-center gap-2 group transition-opacity hover:opacity-90 transform active:scale-95 transition-transform duration-100"
                                title="Ir a sistema Andys"
                            >
                                <span className={`text-xs font-medium transition-colors duration-200 ${isNubaToggled ? 'text-[#AA1E65] font-bold' : 'text-gray-400'}`}>Nuba</span>
                                <div className={`relative w-9 h-5 rounded-full flex items-center px-0.5 transition-colors duration-200 ${isNubaToggled ? 'bg-[#AA1E65]' : 'bg-[#5454D4]'}`}>
                                    {/* Toggled to right (Andys) by default */}
                                    <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-md ml-auto transition-transform duration-200 ${isNubaToggled ? '-translate-x-[18px]' : 'group-active:-translate-x-[18px]'}`}></div>
                                </div>
                                <span className={`text-xs font-medium transition-colors duration-200 ${isNubaToggled ? 'text-gray-400' : 'text-[#5454D4] font-bold'}`}>Andys</span>
                            </a>
                        </div>
                    )}
                    <div className="flex items-center gap-4">
                        {/* Bell Icon with Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowBellDropdown(!showBellDropdown)}
                                className={`p-2 rounded-lg transition-colors relative ${showBellDropdown ? 'bg-gray-100 text-gray-700' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <Bell className="w-5 h-5" />
                                {persistentNotifications.length > 0 && (
                                    <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                                )}
                            </button>

                            {showBellDropdown && (
                                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                        <h3 className="font-bold text-gray-800 text-sm">Notificaciones de Odoo</h3>
                                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                                            {persistentNotifications.length}
                                        </span>
                                    </div>
                                    <div className="max-h-[70vh] overflow-y-auto">
                                        {persistentNotifications.length === 0 ? (
                                            <div className="p-8 text-center">
                                                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                    <Bell className="w-6 h-6 text-gray-300" />
                                                </div>
                                                <p className="text-gray-400 text-xs">No hay confirmaciones de Odoo pendientes</p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-gray-50">
                                                {persistentNotifications.map((n) => (
                                                    <div key={n.id} className="p-4 hover:bg-gray-50 transition-colors group">
                                                        <div className="flex gap-3">
                                                            <div className="mt-1 w-2 h-2 rounded-full bg-green-500 shrink-0"></div>
                                                            <div className="flex-1">
                                                                <p className="text-[11px] font-bold text-gray-900 leading-tight mb-1">{n.title}</p>
                                                                <p className="text-[11px] text-gray-600 leading-normal">{n.message}</p>
                                                            </div>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setPersistentNotifications(prev => prev.filter(item => item.id !== n.id));
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {persistentNotifications.length > 0 && (
                                        <button
                                            onClick={() => setPersistentNotifications([])}
                                            className="w-full p-3 text-center text-xs text-gray-500 hover:text-indigo-600 font-medium border-t border-gray-50 hover:bg-gray-50 transition-colors"
                                        >
                                            Limpiar todas
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* User Profile Button */}
                        <div className="relative flex items-center gap-2">
                            <button
                                onClick={() => setProfileModalOpen(true)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold">
                                    {user?.avatar ? (
                                        <img src={user.avatar} alt="Avatar" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        user?.name?.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-medium text-gray-900">{user?.name}</div>
                                    <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
                                </div>
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                                        logout();
                                    }
                                }}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Cerrar Sesión"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-auto p-8">
                    {activeTab === 'dashboard' && (
                        <Dashboard
                            items={items}
                            onNavigateToPendingSheets={() => {
                                setInitialWorksheetMode('pending_sheets');
                                setActiveTab('worksheet');
                            }}
                            onLoadSheet={handleLoadProviderFile}
                        />
                    )}

                    {activeTab === 'ingestion' && (
                        <Ingestion
                            onLoadOdoo={handleLoadOdoo}
                            onLoadCSV={handleLoadCSV}
                            odooSyncStatus={odooSyncStatus}
                            csvLoadStatus={csvLoadStatus}
                            products={odooProducts}
                            onSelectProvider={handleSelectProvider}
                            lastSyncDate={odooLastUpdate}
                        />
                    )}

                    {activeTab === 'worksheet' && (
                        <Worksheet
                            batchId={currentProviderFile || (items.length > 0 ? 'active' : null)}
                            items={items}
                            onApproveCost={handleApproveCost}
                            onApprovePrice={handleApprovePrice}
                            onUpdateNewPrice={handleUpdateNewPrice}
                            onUpdateNewCost={handleUpdateNewCost}
                            onReturnToInbox={handleReturnToInbox}
                            onOpenAnotherSheet={handleOpenAnotherSheet}
                            onLoadProviderFile={handleLoadProviderFile}
                            onDeleteProviderFile={handleDeleteProviderFile}
                            onFinish={handleFinishSheet}
                            onSync={handleSyncApprovedItems}
                            initialViewMode={initialWorksheetMode}
                            isLoading={isLoading}
                        />
                    )}

                    {activeTab === 'system' && (
                        <SystemUpdate
                            items={items}
                            odooProducts={odooProducts}
                            onUpdateSystem={handleUpdateSystem}
                            onSyncOdoo={handleLoadOdoo}
                            onRemoteUpdate={(id) => {
                                setItems(prev => prev.map(item =>
                                    item.id === id ? { ...item, systemUpdated: true, status: ChangeStatus.SYSTEM_UPDATED } : item
                                ));
                            }}
                            onDeleteItem={handleDeleteItem}
                            onReturnItem={handleReturnItem}
                            addNotification={addNotification}
                        />
                    )}

                    {activeTab === 'failed' && (
                        <FailedConfirmationsPage
                            addNotification={addNotification}
                            onCountChange={setFailedCount}
                        />
                    )}

                    {activeTab === 'store' && (
                        <StoreExecution
                            items={items}
                            onExecute={handleExecuteStore}
                            onDeleteItem={handleDeleteItem}
                            onClearShared={handleClearSharedChanges}
                            onNotify={addNotification}
                        />
                    )}

                    {activeTab === 'history' && (
                        <History odooProducts={odooProducts} />
                    )}

{activeTab === 'revert' && (
                        <RevertChanges addNotification={addNotification} odooProducts={odooProducts} />
                      )}

                    {activeTab === 'mgv' && (
                        <MgvExport addNotification={addNotification} />
                    )}

                    {activeTab === 'monitor' && (
                        <ActivityMonitor />
                    )}

                    {activeTab === 'provider' && (
                        <ProviderUpload onFileSaved={(filename) => handleLoadProviderFile(filename, false)} />
                    )}

                    {activeTab === 'archive' && (
                        <ArchivedSheets />
                    )}
                    {/* Download Data View */}
                    {activeTab === 'download' && (
                        <DownloadData
                            products={odooProducts}
                            onDownload={handleDownloadProviderData}
                            lastSyncDate={odooLastUpdate}
                        />
                    )}

                </div>
            </main>

            <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />

            <CreateUserModal
                isOpen={createUserModalOpen}
                onClose={() => setCreateUserModalOpen(false)}
                onUserCreated={() => {
                    addNotification('success', 'Usuario Creado', 'El usuario ha sido creado exitosamente');
                }}
            />

            <ProfileModal
                isOpen={profileModalOpen}
                onClose={() => setProfileModalOpen(false)}
            />
        </div>
    );
};



export default App;