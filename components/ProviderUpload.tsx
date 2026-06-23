import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Save, FileSpreadsheet, FileUp, Download, X, Eye, Search, Plus, Users } from 'lucide-react';
import { getBoliviaFilenameTimestamp } from '../utils/boliviaTime';
import { useAuth } from '../contexts/AuthContext';
import * as XLSX from 'xlsx';
import { roundPrice, formatPrice } from '../utils/formatters';

interface ProviderProduct {
    id: string;
    barcode: string;
    supplierCode: string;
    description: string;
    cost: number;
    suggestedPrice: number;
    isOdooMatch?: boolean;
    stock?: number;
    odooCost?: number; // Added to track current Odoo cost
    odooPrice?: number; // Added to track current Odoo price
    provider?: string; // Derived provider name
}

// Helper to get user-specific storage key
const getUserStorageKey = (userId: string | null): string => {
    if (!userId) return 'priceflow_provider_products_guest';
    return `priceflow_provider_products_${userId}`;
};

interface ProviderUploadProps {
    onFileSaved?: (filename: string) => void;
}

export const ProviderUpload: React.FC<ProviderUploadProps> = ({ onFileSaved }) => {
    const { user } = useAuth();
    const [products, setProducts] = useState<ProviderProduct[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [currentFilename, setCurrentFilename] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isRevalidating, setIsRevalidating] = useState(false);
    const [previewProducts, setPreviewProducts] = useState<ProviderProduct[] | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    // Provider Management State
    const [providers, setProviders] = useState<string[]>([]);
    const [selectedProvider, setSelectedProvider] = useState<string>('');
    const [isAddingProvider, setIsAddingProvider] = useState(false);
    const [newProviderName, setNewProviderName] = useState('');

    // Fetch providers on mount
    useEffect(() => {
        fetch('/api/providers')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setProviders(data);
                }
            })
            .catch(err => console.error('Error fetching providers:', err));
    }, []);

    const handleAddProvider = async () => {
        if (!newProviderName.trim()) return;
        if (providers.includes(newProviderName.trim())) {
            alert('El proveedor ya existe');
            return;
        }

        const updatedProviders = [...providers, newProviderName.trim()];
        try {
            const res = await fetch('/api/providers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedProviders)
            });
            if (res.ok) {
                setProviders(updatedProviders);
                setSelectedProvider(newProviderName.trim());
                setNewProviderName('');
                setIsAddingProvider(false);
            }
        } catch (error) {
            console.error('Error adding provider:', error);
            alert('Error al agregar proveedor');
        }
    };

    // Load products from localStorage on mount or when user changes
    useEffect(() => {
        try {
            const storageKey = getUserStorageKey(user?.id || null);
            const savedProducts = localStorage.getItem(storageKey);
            if (savedProducts) {
                const parsed = JSON.parse(savedProducts);
                setProducts(parsed);
                console.log(`📦 Cargados ${parsed.length} productos del proveedor para usuario ${user?.name || 'guest'}`);
            } else {
                // Clear products if switching to a user with no saved products
                setProducts([]);
            }
        } catch (error) {
            console.error('Error loading provider products:', error);
        }
    }, [user?.id]);

    // Save products to localStorage whenever they change
    useEffect(() => {
        try {
            const storageKey = getUserStorageKey(user?.id || null);
            localStorage.setItem(storageKey, JSON.stringify(products));
            if (products.length > 0) {
                console.log(`💾 Guardados ${products.length} productos del proveedor para usuario ${user?.name || 'guest'}`);
            }
        } catch (error) {
            console.error('Error saving provider products:', error);
        }
    }, [products, user?.id]);

    const handleRemoveProduct = (id: string) => {
        setProducts(products.filter(p => p.id !== id));
    };

    const handleClearAll = () => {
        if (products.length === 0) {
            alert('No hay productos para limpiar');
            return;
        }

        if (window.confirm(`¿Está seguro de que desea eliminar todos los ${products.length} productos?\n\nEsta acción no se puede deshacer.`)) {
            setProducts([]);
            setCurrentFilename(null);
            setIsReadOnly(false);
            alert('✅ Todos los productos han sido eliminados');
        }
    };

    const handleImportFile = () => {
        fileInputRef.current?.click();
    };

    const handleDownloadTemplate = () => {
        const headers = ['Codigo Barra', 'Producto', 'Costo Base', 'Precio Sugerido', 'Proveedor (Opcional)'];
        const exampleData = [
            ['7791234567890', 'Producto de Ejemplo 1', 10.50, 15.00, 'Proveedor A'],
            ['7791234567891', 'Producto de Ejemplo 2', 25.00, 35.00, 'Proveedor B'],
            ['7791234567892', 'Producto de Ejemplo 3', 8.75, 12.50, '']
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);

        // Adjust column widths
        worksheet['!cols'] = [
            { wch: 15 }, // Barcode
            { wch: 40 }, // Product
            { wch: 12 }, // Cost
            { wch: 15 }, // Price
            { wch: 20 }  // Provider
        ];

        // Format first 1000 rows of "Codigo Barra" column as Text
        const ROWS_TO_FORMAT = 1000;
        for (let R = 1; R <= ROWS_TO_FORMAT; R++) {
            const cellRef = XLSX.utils.encode_cell({ c: 0, r: R });
            if (!worksheet[cellRef]) {
                worksheet[cellRef] = { t: 'z', z: '@' }; // 'z' is stub cell type for empty formatted cells
            } else {
                worksheet[cellRef].z = '@';
            }
        }

        // Update worksheet range to include the blank formatted rows
        worksheet['!ref'] = `A1:E${ROWS_TO_FORMAT + 1}`;

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');

        // Write file
        XLSX.writeFile(workbook, 'plantilla_productos_proveedor.xlsx');

        // Show success message
        alert('✅ Plantilla Excel descargada exitosamente');
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setCurrentFilename(null); // Reset filename for new imports
        setIsReadOnly(false);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Get data as array of arrays (raw, including all rows with merged cells resolved)
            const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

            if (rows.length < 2) {
                alert('El archivo debe contener al menos una fila de encabezados y una fila de datos');
                return;
            }

            // ── SMART HEADER DETECTION ──────────────────────────────────────────────
            // Broad keyword groups - if cell text CONTAINS any of these strings → match
            const BARCODE_KEYS = ['barras', 'código', 'codigo', 'barcode', 'barra', 'cod.bar', 'codbarra'];
            const DESC_KEYS = ['descripci', 'producto', 'description', 'detalle', 'nombre'];
            // For cost/price we cast a very wide net since each company uses different labels
            const COST_KEYS = ['costo', 'precio unit', 'p.unit', 'precio base', 'cost', 'unitario',
                'nuevo costo', 'n. costo', 'ncosto', 'precio c', 'p/c', 'pc', 'post descuento'];
            const PRICE_KEYS = ['sugerido', 'precio vent', 'pvp', 'p.v.p', 'precio final', 'p.v.', 'psug',
                'precio s/', 'nuevo precio', 'n. precio', 'nprecio', 'venta', 'p/v', 'pv'];
            const PROVIDER_KEYS = ['proveedor', 'provider', 'supplier'];
            // Generic "precio" columns — collected separately to use as fallback
            const PRECIO_KEYS = ['precio', 'price', 'importe', 'valor'];

            const normalize = (v: any) => String(v ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
            const matchesAny = (val: string, keys: string[]) => keys.some(k => val.includes(k));

            let headerRowIdx = -1;
            let colBarcode = -1;
            let colDesc = -1;
            let colCost = -1;
            let colPrice = -1;
            let colProvider = -1;

            // Scan up to first 15 rows searching for the real header row
            for (let r = 0; r < Math.min(rows.length, 15); r++) {
                const row = rows[r];
                let barcodeFound = -1, descFound = -1;

                for (let c = 0; c < row.length; c++) {
                    const cell = normalize(row[c]);
                    if (!cell) continue;
                    if (barcodeFound === -1 && matchesAny(cell, BARCODE_KEYS)) barcodeFound = c;
                    if (descFound === -1 && matchesAny(cell, DESC_KEYS)) descFound = c;
                }

                // Need at least barcode + description to consider this the header
                if (barcodeFound !== -1 && descFound !== -1) {
                    headerRowIdx = r;
                    colBarcode = barcodeFound;
                    colDesc = descFound;

                    // Now scan ALL columns in this row for cost, price and provider
                    const precioColumns: number[] = [];
                    for (let c = 0; c < row.length; c++) {
                        const cell = normalize(row[c]);
                        if (!cell) continue;
                        if (colCost === -1 && matchesAny(cell, COST_KEYS)) colCost = c;
                        if (colPrice === -1 && matchesAny(cell, PRICE_KEYS)) colPrice = c;
                        if (colProvider === -1 && matchesAny(cell, PROVIDER_KEYS)) colProvider = c;
                        if (matchesAny(cell, PRECIO_KEYS)) precioColumns.push(c);
                    }

                    // Fallback: use generic "precio" columns if specific ones not found
                    if (colCost === -1 && precioColumns.length >= 1) colCost = precioColumns[0];
                    if (colPrice === -1 && precioColumns.length >= 2) colPrice = precioColumns[precioColumns.length - 1];

                    console.log(`📋 Smart header at row ${r}: barcode=${colBarcode} desc=${colDesc} cost=${colCost} price=${colPrice} provider=${colProvider}`);
                    console.log(`   precioColumns detected at: [${precioColumns.join(', ')}]`);
                    break;
                }
            }

            // ── KNOWN FORMAT OVERRIDES ───────────────────────────────────────────
            // Check if any of the first rows contain a brand name that signals a known file format.
            // This overrides auto-detected cost/price columns with the exact positions for that brand.
            const topContentFlat = rows.slice(0, 8).flat().map(c => normalize(c)).join(' ');

            if (topContentFlat.includes('colgate') && rows[headerRowIdx || 0]?.length > 10) {
                // Colgate Palmolive Bolivia format (Specific fixed layout for wide sheets):
                // B(1)=Barcode  C(2)=Description  I(8)=New Cost  K(10)=Sale Price  A(0)=Provider
                if (colBarcode !== 0 && colBarcode !== 1) { // Only override if smart detection failed to find it in A or B
                    console.log('🎯 Formato COLGATE detectado → usando columnas fijas: B=barcode, C=desc, I=costo, K=precio');
                    colBarcode = 1;
                    colDesc = 2;
                    colCost = 8;
                    colPrice = 10;
                    colProvider = 0;

                    // Also adjust headerRowIdx if it was wrong (use the first row after the real header)
                    if (headerRowIdx === -1) {
                        for (let r = 0; r < Math.min(rows.length, 15); r++) {
                            const bVal = String(rows[r]?.[1] ?? '').trim();
                            if (/^\d{7,}$/.test(bVal)) { // first row with a real barcode in col B
                                headerRowIdx = r - 1;
                                break;
                            }
                        }
                    }
                }
            }

            // Resolve whether we found a smart header or fall back to standard template order
            const usingSmartHeaders = headerRowIdx !== -1;
            const dataRows = usingSmartHeaders
                ? rows.slice(headerRowIdx + 1)
                : rows.slice(1);

            if (!usingSmartHeaders) {
                colBarcode = 0;
                colDesc = 1;
                colCost = 2;
                colPrice = 3;
                colProvider = 4;
                console.log('📋 Import mode: STANDARD (no header detected, using fixed column order)');
            }

            // Ultimate numeric fallback: if cost and/or price weren't found by keywords,
            // scan the first data rows looking for columns that consistently hold positive numbers.
            if (usingSmartHeaders && (colCost === -1 || colPrice === -1)) {
                const sampleRows = rows.slice(headerRowIdx + 1, headerRowIdx + 10);
                const numericScore: Record<number, number> = {};
                const minCol = Math.max(colDesc, colBarcode) + 1;

                for (const sRow of sampleRows) {
                    for (let c = minCol; c < sRow.length; c++) {
                        const v = parseFloat(String(sRow[c] ?? '').replace(',', '.'));
                        if (!isNaN(v) && v > 0) {
                            numericScore[c] = (numericScore[c] || 0) + 1;
                        }
                    }
                }

                const candidateCols = Object.entries(numericScore)
                    .sort(([, a], [, b]) => b - a)
                    .map(([col]) => parseInt(col))
                    .filter(c => c !== colBarcode && c !== colDesc && c !== colProvider);

                console.log('📊 Numeric candidate columns (sorted by frequency):', candidateCols);

                if (colCost === -1 && candidateCols.length >= 1) colCost = candidateCols[0];
                if (colPrice === -1 && candidateCols.length >= 2) colPrice = candidateCols[1];

                console.log(`   → After numeric fallback: cost=${colCost}, price=${colPrice}`);
            }

            // ── ODOO LOOKUP ──────────────────────────────────────────────────────
            const barcodesToLookup: string[] = [];
            for (const row of dataRows) {
                if (!row || row.every((c: any) => !c)) continue;
                const bVal = row[colBarcode];
                if (bVal != null && String(bVal).trim()) {
                    barcodesToLookup.push(String(bVal).trim());
                }
            }

            let odooMap = new Map();

            if (barcodesToLookup.length > 0) {
                try {
                    const { getProductsByBarcodes } = await import('../services/odooService');
                    odooMap = await getProductsByBarcodes(barcodesToLookup);

                    for (const [_, product] of odooMap) {
                        if (product.provider && product.provider !== 'N/A' && product.provider !== 'Odoo Import') {
                            if (!providers.includes(product.provider)) {
                                setProviders(prev => [...prev, product.provider!]);
                            }
                        }
                    }
                } catch (err) {
                    console.error('Failed to fetch Odoo data:', err);
                    alert('❌ No se pudo consultar Odoo. Verifica sesión/credenciales del proxy Odoo (VITE_ODOO_DB, VITE_ODOO_USERNAME, VITE_ODOO_PASSWORD) o inicia sesión en Odoo.');
                }
            }

            const importedProducts: ProviderProduct[] = [];

            for (const row of dataRows) {
                if (!row || row.every((c: any) => !c)) continue;

                const barcodeVal = row[colBarcode];
                const descriptionVal = colDesc >= 0 ? row[colDesc] : '';
                const costVal = colCost >= 0 ? row[colCost] : undefined;
                const priceVal = colPrice >= 0 ? row[colPrice] : undefined;
                const providerVal = colProvider >= 0 ? row[colProvider] : '';

                // Skip rows with no barcode and no description
                if (!barcodeVal && !descriptionVal) continue;

                const barcode = String(barcodeVal ?? '').trim();
                let description = String(descriptionVal ?? '').trim();

                // Skip rows where the barcode cell contains non-numeric text (sub-headers, totals, etc.)
                // Allow: pure numbers, EAN codes starting with digits, empty (will try to fill from Odoo)
                if (barcode && !/^\d/.test(barcode) && isNaN(Number(barcode))) continue;

                // Initially parse raw numbers without aggressive rounding
                let cost = parseFloat(String(costVal ?? '').replace(',', '.')) || 0;
                let suggestedPrice = parseFloat(priceVal) || 0;

                let provider = String(providerVal || '').trim();

                let stock = 0;
                let odooCost = 0;
                let odooPrice = 0;
                // IF cost or price is missing (0), try to fill from Odoo
                if (odooMap.has(barcode)) {
                    const odooData = odooMap.get(barcode);
                    if (odooData) {
                        if (cost === 0) cost = odooData.cost || 0;
                        if (suggestedPrice === 0) suggestedPrice = odooData.price || 0;
                        if (!description) description = odooData.description;
                        stock = odooData.stock || 0;

                        // If provider wasn't in file, use Odoo provider
                        if (!provider || provider === 'N/A') {
                            provider = odooData.provider && odooData.provider !== 'N/A' ? odooData.provider : '';
                        }

                        // Apply appropriate rounding based on final provider
                        cost = roundPrice(cost, provider);
                        suggestedPrice = roundPrice(suggestedPrice, provider);
                        odooCost = roundPrice(odooData.cost || 0, provider);
                        odooPrice = roundPrice(odooData.price || 0, provider);
                    }
                } else {
                    // Even if no Odoo match, apply rounding based on provided provider
                    cost = roundPrice(cost, provider);
                    suggestedPrice = roundPrice(suggestedPrice, provider);
                }

                // Fallback provider if still empty
                if (!provider) provider = 'Sin Proveedor';

                const product: ProviderProduct = {
                    id: `imported-${Date.now()}-${Math.random()}`,
                    barcode: barcode,
                    supplierCode: '',
                    description: description,
                    cost: cost,
                    suggestedPrice: suggestedPrice,
                    stock: stock,
                    isOdooMatch: odooMap.has(barcode),
                    odooCost: odooCost,
                    odooPrice: odooPrice,
                    provider: provider
                };

                importedProducts.push(product);
            }

            if (importedProducts.length === 0) {
                alert('No se encontraron productos válidos en el archivo');
                return;
            }

            // Add imported products to existing list
            setProducts([...products, ...importedProducts]);
            const odooFound = importedProducts.filter(p => p.isOdooMatch);
            const changedCostCount = odooFound.filter(p => Math.abs(p.cost - (p.odooCost || 0)) > 0.001).length;
            const changedPriceCount = odooFound.filter(p => Math.abs(p.suggestedPrice - (p.odooPrice || 0)) > 0.001).length;

            // Collect distinct providers for summary
            const distinctProviders = new Set(importedProducts.map(p => p.provider));

            alert(`✅ ${importedProducts.length} productos importados exitosamente.\n(Datos en Odoo: ${odooFound.length}, Costo cambiado: ${changedCostCount}, Precio cambiado: ${changedPriceCount})\nProveedores detectados: ${distinctProviders.size}`);

        } catch (error) {
            console.error('Error importing file:', error);
            alert('❌ Error al importar el archivo. Verifique que el formato sea correcto.');
        } finally {
            setIsImporting(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const [historyFiles, setHistoryFiles] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const fetchHistory = async () => {
        try {
            const response = await fetch('/api/list-provider-history');
            if (response.ok) {
                const data = await response.json();
                setHistoryFiles(data.files);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    // Load history on mount
    useEffect(() => {
        fetchHistory();
    }, []);

    const handleLoadHistoryFile = async (filename: string) => {
        try {
            const response = await fetch(`/api/get-provider-csv/${filename}`);
            if (!response.ok) throw new Error('Failed to load file');
            const data = await response.json();
            const csvContent = data.content;

            // Simple CSV Parser for generated files
            // Format: "Code","Desc",Cost,Price
            const lines = csvContent.split('\n');
            const newProducts: ProviderProduct[] = [];

            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Handle quoted CSV format we generated
                // Regex to match: "val","val",num,num
                // OR simple split if valid
                const parts = line.split(',');
                if (parts.length < 4) continue;

                // Clean quotes
                const clean = (val: string) => val ? val.replace(/^"|"$/g, '').replace(/""/g, '"') : '';

                // We know our format is: "barcode","desc",cost,price
                // But description might contain commas, so we need regex match if possible, or careful split
                // Since we generated it with quotes around barcode and description, we can try a regex
                const regex = /(?:^|,)(?:"([^"]*)"|([^",]*))/g;
                const matches = [];
                let match;
                while ((match = regex.exec(line)) !== null) {
                    matches.push(match[1] || match[2] || '');
                }

                if (matches.length >= 4) {
                    newProducts.push({
                        id: `loaded-${Date.now()}-${i}`,
                        barcode: matches[0],
                        supplierCode: '',
                        description: matches[1],
                        cost: parseFloat(matches[2]) || 0,
                        suggestedPrice: parseFloat(matches[3]) || 0
                    });
                }
            }

            if (newProducts.length > 0) {
                if (window.confirm(`¿Desea visualizar el archivo histórico ${filename}?\nEsto reemplazará la vista actual.`)) {
                    setProducts(newProducts);
                    setCurrentFilename(filename);
                    setIsReadOnly(true);
                    setShowHistory(false);
                    alert('✅ Archivo cargado exitosamente para visualización (Modo Lectura)');
                }
            } else {
                alert('No se encontraron productos válidos en el archivo');
            }

        } catch (error) {
            console.error('Error loading history file:', error);
            alert('Error al cargar el archivo del historial');
        }
    };

    const handleEditProduct = (id: string, field: keyof ProviderProduct, value: string | number) => {
        setProducts(products.map(p =>
            p.id === id ? { ...p, [field]: value } : p
        ));
    };

    // Open history when saving is complete if desired, or just refresh
    // For now we just refresh history as per existing logic


    const handleSaveCSV = async () => {
        const validProducts = productsToSave;

        if (validProducts.length === 0) {
            // If there are valid matched products, we allow saving even if no changes
            // But if there are truly 0 valid products, warn.
            alert('No hay productos válidos (coincidentes en Odoo) para guardar.');
            return;
        }

        try {
            // Group by provider
            const productsByProvider = new Map<string, ProviderProduct[]>();

            validProducts.forEach(p => {
                // If we allow saving even without changes, we should include all validProducts
                // But validProducts are now ALL products that match in Odoo (see productsToSave definition below)
                const provider = p.provider || selectedProvider || 'Proveedor_General';
                const list = productsByProvider.get(provider) || [];
                list.push(p);
                productsByProvider.set(provider, list);
            });


            let savedCount = 0;
            const savedFiles: string[] = [];

            for (const [providerName, providerProducts] of productsByProvider) {
                const timestamp = getBoliviaFilenameTimestamp();
                const safeProvider = providerName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s_-]/g, '').replace(/\s+/g, '_');
                const filename = `${safeProvider}_${timestamp}.csv`;

                // Create CSV content 
                const headers = ['Codigo Barra', 'Producto', 'Costo Base', 'Precio Sugerido', 'Proveedor'];
                const rows = providerProducts.map(p => [
                    `"${p.barcode}"`,
                    `"${p.description.replace(/"/g, '""')}"`,
                    p.cost,
                    p.suggestedPrice,
                    `"${providerName}"`
                ].join(','));
                const csvContent = [headers.join(','), ...rows].join('\n');

                // Send to backend
                const response = await fetch('/api/save-provider-csv', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content: csvContent })
                });

                if (!response.ok) {
                    console.error(`Failed to save ${filename}`);
                } else {
                    savedCount += providerProducts.length;
                    savedFiles.push(filename);
                }
            }

            const skippedCount = products.length - validProducts.length;
            const msg = `✅ Se generaron ${savedFiles.length} archivos exitosamente.\n${savedCount} productos guardados en total.\n(${skippedCount} productos ignorados)`;

            alert(msg);
            setProducts([]);
            setCurrentFilename(null);
            fetchHistory(); // Refresh history
            if (onFileSaved && savedFiles.length > 0) onFileSaved(savedFiles[0]); // Just notify about one, or change interface to support multiple (optional)
        } catch (error) {
            console.error('Error saving CSV:', error);
            alert('❌ Error al guardar los archivos.');
        }
    };

    const handlePreviewFile = async (filename: string) => {
        setIsPreviewLoading(true);
        try {
            const response = await fetch(`/api/get-provider-csv/${filename}`);
            if (!response.ok) throw new Error('Failed to fetch file');
            const data = await response.json();

            // Basic CSV parsing for preview
            const lines = data.content.split('\n');
            const parsedProducts: ProviderProduct[] = lines.slice(1).filter((l: string) => l.trim() !== '').map((line: string, idx: number) => {
                const parts = line.split(',');
                return {
                    id: `preview-${idx}`,
                    barcode: (parts[0] || '').replace(/^"|"$/g, ''),
                    description: (parts[1] || '').replace(/^"|"$/g, ''),
                    cost: parseFloat((parts[2] || '0').replace(/^"|"$/g, '')),
                    suggestedPrice: parseFloat((parts[3] || '0').replace(/^"|"$/g, '')),
                    supplierCode: '',
                    provider: (parts[4] || '').replace(/^"|"$/g, '')
                };
            });
            setPreviewProducts(parsedProducts);
        } catch (error) {
            console.error('Error previewing file:', error);
            alert('Error al visualizar el archivo');
        } finally {
            setIsPreviewLoading(false);
        }
    };


    const handleRevalidateUnmatched = async () => {
        const unmatched = products.filter(p => p.isOdooMatch === false);
        if (unmatched.length === 0) return;

        setIsRevalidating(true);
        try {
            const barcodes = unmatched.map(p => p.barcode).filter(b => b && b.trim() !== '');

            if (barcodes.length === 0) {
                alert('No hay códigos de barra válidos para buscar.');
                setIsRevalidating(false);
                return;
            }

            // Dynamical import to avoid circular dependencies
            const { getProductsByBarcodes } = await import('../services/odooService');
            const foundMap = await getProductsByBarcodes(barcodes);

            if (foundMap.size === 0) {
                alert('No se encontraron coincidencias en Odoo para los códigos proporcionados.');
                return;
            }

            const updatedProducts = products.map(p => {
                // If it was unmatched and we found it now
                const odooData = foundMap.get(p.barcode);
                if (!odooData) return p;
                const odooCost = roundPrice(odooData.cost || 0, odooData.provider);
                const odooPrice = roundPrice(odooData.price || 0, odooData.provider);
                return {
                    ...p,
                    isOdooMatch: true,
                    description: p.description || odooData.description,
                    cost: roundPrice(p.cost || odooCost, odooData.provider),
                    suggestedPrice: roundPrice(p.suggestedPrice || odooPrice, odooData.provider),
                    odooCost: odooCost,
                    odooPrice: odooPrice,
                    provider: odooData.provider
                };
            });

            setProducts(updatedProducts);
            const foundCount = updatedProducts.filter(p => p.isOdooMatch !== false).length - products.filter(p => p.isOdooMatch !== false).length;
            alert(`✅ Se encontraron ${foundCount} productos en Odoo y se movieron a la lista principal.`);

        } catch (error) {
            console.error("Error revalidating:", error);
            alert('❌ Error al validar con Odoo');
        } finally {
            setIsRevalidating(false);
        }
    };

    const calculateMargin = (cost: number, price: number): number => {
        if (price === 0) return 0;
        return ((price - cost) / price) * 100;
    };

    // Filter products that have a different cost compared to Odoo
    // Filter products that are valid Odoo matches, regardless of changes
    // User wants to be able to save the sheet even if data is just filled from Odoo.
    const productsToSave = products.filter(p =>
        p.isOdooMatch === true // Must be in Odoo
    );

    const validProductsCount = productsToSave.length;

    return (
        <div className="space-y-8">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Top Section: Controls */}
            <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Upload className="w-7 h-7 text-indigo-600" />
                            Carga de Productos
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Gestión de archivos de proveedores
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setShowHistory(true)}
                            className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-4 py-2 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors border border-purple-200"
                        >
                            <FileSpreadsheet className="w-5 h-5" />
                            Historial
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={handleDownloadTemplate}
                        className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-lg shadow flex items-center justify-center gap-2 transition-colors"
                        title="Descargar plantilla Excel"
                    >
                        <Download className="w-5 h-5" />
                        Plantilla
                    </button>
                    <button
                        onClick={handleImportFile}
                        disabled={isImporting}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-3 rounded-lg shadow flex items-center justify-center gap-2 transition-colors"
                    >
                        <FileUp className="w-5 h-5" />
                        {isImporting ? '...' : 'Importar'}
                    </button>
                </div>

                {/* Provider Display (Simplified) - removed as it's now per-row or multiple */}
                {/* 
                {products.length > 0 && !isReadOnly && selectedProvider && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-center animate-in fade-in">
                        <div className="flex items-center gap-2 text-green-800 font-bold text-lg">
                            <span className="text-sm font-semibold bg-green-200 text-green-800 px-2 py-0.5 rounded uppercase tracking-wider">DETECTADO:</span>
                            {selectedProvider}
                        </div>
                    </div>
                )} 
                */}

                {products.length > 0 && !isReadOnly && (
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <button
                            onClick={handleClearAll}
                            className="flex-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors"
                        >
                            <X className="w-4 h-4" />
                            Limpiar
                        </button>
                        <button
                            onClick={handleSaveCSV}
                            className="flex-[2] bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow flex items-center justify-center gap-2 transition-colors"
                        >
                            <Save className="w-5 h-5" />
                            Guardar Todo ({validProductsCount})
                        </button>
                    </div>
                )}

                {/* Read Only Controls */}
                {isReadOnly && (
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                        <button
                            onClick={() => {
                                setProducts([]);
                                setCurrentFilename(null);
                                setIsReadOnly(false);
                            }}
                            className="w-full bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors font-medium"
                        >
                            <X className="w-4 h-4" />
                            Cerrar Vista Previa
                        </button>
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                    <h4 className="font-semibold text-blue-900 mb-1 flex items-center gap-1">
                        <FileSpreadsheet className="w-4 h-4" />
                        Instrucciones
                    </h4>
                    <ol className="text-blue-800 space-y-1 list-decimal list-inside text-xs">
                        <li>Descargue la plantilla Excel.</li>
                        <li>Llene los datos (Codigo, Producto, Costo, Precio).</li>
                        <li>Importe el archivo (.xlsx completado).</li>
                        <li>Revise los datos y guarde.</li>
                    </ol>
                </div>
            </div>

            {/* Unmatched Products Warning Section */}
            {products.some(p => p.isOdooMatch === false) && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                        <h3 className="text-lg font-bold text-orange-800 flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-orange-200 text-orange-800 text-xs">!</span>
                            Productos No Encontrados en Odoo ({products.filter(p => p.isOdooMatch === false).length})
                        </h3>
                        <button
                            onClick={handleRevalidateUnmatched}
                            disabled={isRevalidating}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Search className={`w-4 h-4 ${isRevalidating ? 'animate-spin' : ''}`} />
                            {isRevalidating ? 'Buscando...' : 'Buscar Productos'}
                        </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto border border-orange-100 rounded-lg bg-white">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-orange-100 text-orange-800 sticky top-0">
                                <tr>
                                    <th className="p-2 border-b border-orange-200 text-xs font-bold">CODIGO BARRA</th>
                                    <th className="p-2 border-b border-orange-200 text-xs font-bold">PRODUCTO</th>
                                    <th className="p-2 border-b border-orange-200 text-right text-xs font-bold">COSTO BASE</th>
                                    <th className="p-2 border-b border-orange-200 text-right text-xs font-bold">PRECIO SUGERIDO</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-orange-100">
                                {products.filter(p => p.isOdooMatch === false).map(product => (
                                    <tr key={`unmatched-${product.id}`} className="hover:bg-orange-50">
                                        <td className="p-2">
                                            <input
                                                type="text"
                                                value={product.barcode}
                                                onChange={(e) => handleEditProduct(product.id, 'barcode', e.target.value)}
                                                className="w-full font-mono text-gray-700 bg-white border border-orange-200 rounded px-2 py-1 focus:border-orange-500 focus:ring-1 focus:ring-orange-200 outline-none text-sm"
                                            />
                                        </td>
                                        <td className="p-2 text-gray-800 text-sm">{product.description || '<Sin Descripción>'}</td>
                                        <td className="p-2 text-right text-gray-600 text-sm">Bs{formatPrice(product.cost, product.provider)}</td>
                                        <td className="p-2 text-right text-gray-600 text-sm">Bs{formatPrice(product.suggestedPrice, product.provider)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Detailed Products List */}
            {products.filter(p => p.isOdooMatch !== false).length > 0 ? (
                <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                            Detalle de Productos ({productsToSave.length})
                        </h3>
                        {currentFilename && (
                            <span className={`text-sm px-3 py-1 rounded-full border flex items-center gap-2 ${isReadOnly ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                <span>{isReadOnly ? 'Visualizando Histórico:' : 'Editando:'}</span>
                                <span className="font-mono font-medium">{currentFilename}</span>
                            </span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 text-gray-600 text-sm uppercase tracking-wider">
                                    <th className="p-4 border-b">Codigo Barra</th>
                                    <th className="p-4 border-b">Producto</th>
                                    <th className="p-4 border-b">Proveedor</th>
                                    <th className="p-4 border-b text-center">Stock</th>
                                    <th className="p-4 border-b text-right">Costo Base</th>
                                    <th className="p-4 border-b text-right">Precio Sugerido</th>
                                    <th className="p-4 border-b text-center">Margen</th>
                                    {!isReadOnly && <th className="p-4 border-b text-center">Acción</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {productsToSave.map((product) => {
                                    const margin = calculateMargin(product.cost, product.suggestedPrice);
                                    const costDiff = product.cost - (product.odooCost || 0);

                                    return (
                                        <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <input
                                                    type="text"
                                                    value={product.barcode}
                                                    onChange={(e) => handleEditProduct(product.id, 'barcode', e.target.value)}
                                                    disabled={isReadOnly}
                                                    className={`w-full font-mono text-sm px-2 py-1 border border-transparent 
                                                        ${!isReadOnly ? 'hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200' : 'bg-transparent text-gray-600'} 
                                                        rounded transition-colors`}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="text"
                                                    value={product.description}
                                                    onChange={(e) => handleEditProduct(product.id, 'description', e.target.value)}
                                                    disabled={isReadOnly}
                                                    className={`w-full font-medium text-gray-800 px-2 py-1 border border-transparent 
                                                        ${!isReadOnly ? 'hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200' : 'bg-transparent'} 
                                                        rounded transition-colors`}
                                                />
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="text"
                                                    value={product.provider || ''}
                                                    onChange={(e) => handleEditProduct(product.id, 'provider', e.target.value)}
                                                    disabled={isReadOnly}
                                                    placeholder="Sin Proveedor"
                                                    className={`w-full text-sm text-gray-600 px-2 py-1 border border-transparent 
                                                        ${!isReadOnly ? 'hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200' : 'bg-transparent'} 
                                                        rounded transition-colors`}
                                                />
                                            </td>
                                            <td className="p-4 text-center font-mono text-gray-600">
                                                {product.stock || 0}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col items-end">
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={product.cost}
                                                        onChange={(e) => handleEditProduct(product.id, 'cost', parseFloat(e.target.value) || 0)}
                                                        disabled={isReadOnly}
                                                        className={`w-full text-right font-semibold px-2 py-1 border border-transparent 
                                                            ${!isReadOnly ? 'hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200' : 'bg-transparent text-gray-700'} 
                                                            rounded transition-colors`}
                                                    />
                                                    <span className={`text-[10px] font-bold ${costDiff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                        {costDiff > 0 ? '+' : ''}{formatPrice(costDiff, product.provider)} vs Odoo
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={product.suggestedPrice}
                                                    onChange={(e) => handleEditProduct(product.id, 'suggestedPrice', parseFloat(e.target.value) || 0)}
                                                    disabled={isReadOnly}
                                                    className={`w-full text-right font-semibold text-green-600 px-2 py-1 border border-transparent 
                                                        ${!isReadOnly ? 'hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200' : 'bg-transparent'} 
                                                        rounded transition-colors`}
                                                />
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${margin > 30 ? 'bg-green-100 text-green-800' :
                                                    margin > 15 ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'
                                                    }`}>
                                                    {margin.toFixed(1)}%
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {!isReadOnly && (
                                                    <button
                                                        onClick={() => handleRemoveProduct(product.id)}
                                                        className="text-red-600 hover:text-red-800 hover:bg-red-50 p-2 rounded transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                    <FileSpreadsheet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">No hay productos cargados</h3>
                    <p className="text-gray-500">Use el panel superior para importar un archivo</p>
                </div>
            )}

            {/* History Modal */}
            {showHistory && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <FileSpreadsheet className="w-6 h-6 text-indigo-600" />
                                Historial de Cargas
                            </h3>
                            <button
                                onClick={() => setShowHistory(false)}
                                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-2 rounded-full transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            {historyFiles.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-gray-400 py-12">
                                    <FileSpreadsheet className="w-16 h-16 mb-4 opacity-50" />
                                    <p className="text-lg font-medium">No hay historial disponible</p>
                                    <p className="text-sm">Los archivos guardados aparecerán aquí</p>
                                </div>
                            ) : (
                                <div className="border rounded-lg overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                                                <th className="p-3 border-b font-semibold">Archivo</th>
                                                <th className="p-3 border-b font-semibold">Fecha</th>
                                                <th className="p-3 border-b text-right font-semibold">Tamaño</th>
                                                <th className="p-3 border-b text-center font-semibold">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {historyFiles.map((file, index) => (
                                                <tr key={index} className="hover:bg-indigo-50 transition-colors group">
                                                    <td className="p-3 font-medium text-gray-700 whitespace-normal break-all" title={file.name}>
                                                        {file.name}
                                                    </td>
                                                    <td className="p-3 text-gray-500 text-sm">
                                                        {new Date(file.modified).toLocaleString()}
                                                    </td>
                                                    <td className="p-3 text-gray-500 text-sm text-right font-mono">
                                                        {(file.size / 1024).toFixed(1)} KB
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => handlePreviewFile(file.name)}
                                                            className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                                                            title="Visualizar"
                                                        >
                                                            <Eye className="w-5 h-5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                            <button
                                onClick={() => setShowHistory(false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* File Content Preview Modal (Read Only) */}
            {previewProducts && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50 rounded-t-xl">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <Eye className="w-6 h-6 text-indigo-600" />
                                Vista Previa de Archivo (Solo Lectura)
                            </h3>
                            <button
                                onClick={() => setPreviewProducts(null)}
                                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 p-2 rounded-full transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-0 overflow-y-auto flex-1">
                            <table className="min-w-full w-max text-left border-collapse">
                                <thead className="sticky top-0 bg-white shadow-sm z-10">
                                    <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                                        <th className="p-4 border-b font-semibold">Código</th>
                                        <th className="p-4 border-b font-semibold">Producto</th>
                                        <th className="p-4 border-b text-right font-semibold">Costo</th>
                                        <th className="p-4 border-b text-right font-semibold">Precio Sug.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {previewProducts.map((p) => (
                                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 text-sm font-mono text-gray-600">{p.barcode}</td>
                                            <td className="p-4 text-sm font-medium text-gray-800 min-w-[500px] whitespace-normal">
                                                <div className="whitespace-normal break-words leading-tight">{p.description}</div>
                                            </td>
                                            <td className="p-4 text-sm text-right text-gray-600">Bs{formatPrice(p.cost, p.provider)}</td>
                                            <td className="p-4 text-sm text-right font-bold text-indigo-600">Bs{formatPrice(p.suggestedPrice, p.provider)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-between items-center">
                            <span className="text-sm text-gray-500 italic">
                                * Esta es una vista previa de solo lectura del archivo guardado.
                            </span>
                            <button
                                onClick={() => setPreviewProducts(null)}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-bold shadow-md"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Loader for Preview */}
            {isPreviewLoading && (
                <div className="fixed inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-[70]">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent shadow-lg"></div>
                        <p className="text-indigo-900 font-bold animate-pulse">Cargando vista previa...</p>
                    </div>
                </div>
            )}
        </div>

    );
};
