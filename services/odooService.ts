import { OdooProduct } from '../types';

function getEnv(name: string, fallback = ''): string {
    const value = import.meta.env[name];
    return value && String(value).trim() !== '' ? String(value) : fallback;
}

const ODOO_CONFIG = {
    // Proxy interno del backend (no sensible)
    url: getEnv('VITE_ODOO_PROXY_URL', '/api/odoo'),
    db: getEnv('VITE_ODOO_DB'),
    username: getEnv('VITE_ODOO_USERNAME'),
    password: getEnv('VITE_ODOO_PASSWORD')
};

function normalizeLookupCode(value: string): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    // Keep only common barcode/code characters and normalize spaces
    const compact = raw.replace(/\s+/g, '');
    // Numeric-like values: remove leading zeros to improve cross-system matching
    if (/^\d+$/.test(compact)) return compact.replace(/^0+/, '') || '0';
    return compact.toUpperCase();
}

// Session cache — one auth for the whole batch, avoids 1 extra HTTP round-trip per product
let _sessionValid = false;
let _sessionExpiry = 0;

async function ensureSession(): Promise<void> {
    if (_sessionValid && Date.now() < _sessionExpiry) return;
    const hasFrontendCreds = !!(ODOO_CONFIG.db && ODOO_CONFIG.username && ODOO_CONFIG.password);

    // First try existing session (proxy may manage cookies server-side)
    try {
        const infoRes = await fetch(`${ODOO_CONFIG.url}/web/session/get_session_info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ jsonrpc: "2.0", params: {} })
        });
        const infoJson = await infoRes.json();
        if (infoJson?.result?.uid) {
            _sessionValid = true;
            _sessionExpiry = Date.now() + 25 * 60 * 1000;
            return;
        }
    } catch {
        // continue with auth fallback below
    }

    if (!hasFrontendCreds) {
        throw new Error('ODOO_SESSION_MISSING: No session in proxy and missing VITE_ODOO_DB/VITE_ODOO_USERNAME/VITE_ODOO_PASSWORD');
    }

    const res = await fetch(`${ODOO_CONFIG.url}/web/session/authenticate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ jsonrpc: "2.0", params: { db: ODOO_CONFIG.db, login: ODOO_CONFIG.username, password: ODOO_CONFIG.password } })
    });
    const json = await res.json();
    if (json.error || !json.result?.uid) throw new Error("Auth failed");
    _sessionValid = true;
    _sessionExpiry = Date.now() + 25 * 60 * 1000; // 25 min
}

export function invalidateSession(): void {
    _sessionValid = false;
    _sessionExpiry = 0;
}

// Helper interactivo para reintentar transacciones y lidiar con colisiones de concurrencia en Odoo
async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delayMs = 500): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) {
                if (i === retries - 1) return res;
                await new Promise(r => setTimeout(r, delayMs));
                continue;
            }
            
            // Verificamos si en la respuesta RPC hay un error (ej. Concurrent Update Lock)
            const cloned = res.clone();
            const json = await cloned.json();
            if (json.error && i < retries - 1) {
                console.warn(`Odoo RPC Error (Attempt ${i+1}/${retries}). Retrying in ${delayMs}ms...`, json.error);
                await new Promise(r => setTimeout(r, delayMs));
                continue;
            }
            
            return res; // Retornamos respuesta exitosa o en el ultimo intento
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, delayMs));
        }
    }
    throw new Error("Max retries exceeded");
}

export const testOdooConnection = async (): Promise<boolean> => {
    try {
        console.log("🔍 Testing Odoo connection...");
        await ensureSession();

        console.log("✅ Odoo connection test successful");
        return true;
    } catch (error) {
        console.error("❌ Odoo connection test error:", error);
        return false;
    }
};

export const fetchOdooProducts = async (onProgress?: (progress: number, total: number) => void, lastSyncDate?: Date): Promise<OdooProduct[]> => {
    console.log("🔐 Authenticating with Odoo...");

    try {
        await ensureSession();

        // Prepare domain for incremental sync
        let domain: any[] = [];
        if (lastSyncDate) {
            // Format to Odoo UTC string YYYY-MM-DD HH:mm:ss
            const toOdooDate = (date: Date) => {
                return date.toISOString().replace('T', ' ').split('.')[0];
            };
            const dateStr = toOdooDate(lastSyncDate);
            console.log(`🕒 Incremental Sync: Fetching products modified after ${dateStr}`);
            domain = [['write_date', '>', dateStr]];
        }

        // 1. Get total count (with domain)
        const countResponse = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: { model: "product.product", method: "search_count", args: [domain], kwargs: {} },
                id: 1
            })
        });

        const countResult = await countResponse.json();
        const totalCount = countResult.result || 0;

        // If incremental and 0 changes, return empty immediately
        if (totalCount === 0) {
            console.log("✅ No products changed since last sync.");
            return [];
        }

        // 2. Fetch products (with domain)
        console.log(`📦 Fetching ${totalCount} products...`);
        if (onProgress) onProgress(0, totalCount);

        const dataResponse = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: {
                    model: "product.product", method: "search_read", args: [domain],
                    kwargs: {
                        fields: ["id", "name", "display_name", "default_code", "barcode", "lst_price", "standard_price", "categ_id", "seller_ids", "product_tmpl_id", "qty_available", "virtual_available", "free_qty"],
                        offset: 0,
                        limit: false // Fetch all matches
                    }
                },
                id: 2
            })
        });

        const result = (await dataResponse.json()).result || [];
        const allProducts = result;

        if (onProgress) onProgress(totalCount, totalCount);

        const productIds = allProducts.map((p: any) => p.id);

        // Chunked stock and supplier names fetching as well
        const stockMap = await fetchStockFromQuants(productIds);
        const supplierMap = await fetchSupplierNames(allProducts);

        // Fallback: for products whose seller_ids gives cost=0 (or are empty), query by template ID
        const tmplIds = [...new Set(allProducts
            .filter((p: any) => {
                if (!Array.isArray(p.seller_ids) || p.seller_ids.length === 0) return true;
                // Also include products where every seller entry has price 0 or isn't in supplierMap
                return !p.seller_ids.some((sid: number) => {
                    const sd = supplierMap.get(sid);
                    return sd && sd.price > 0;
                });
            })
            .map((p: any) => Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id)
            .filter(Boolean))] as number[];
        const tmplCostMap = await fetchTemplateSupplierCosts(tmplIds);

        return allProducts.map((p: any) => {
            let category = 'Sin Categoría';
            if (Array.isArray(p.categ_id) && p.categ_id.length > 1) {
                category = p.categ_id[1].replace('All products /', '').trim();
            }

            let name = (p.display_name || p.name || 'Sin Nombre').replace(/^\[.*?\]\s*/, '').replace(/\((.*?)\)/, '$1');
            let provider = 'N/A';
            let cost = p.standard_price || 0;

            if (Array.isArray(p.seller_ids) && p.seller_ids.length > 0) {
                let exactNonZero = null, exactAny = null, anyNonZero = null, firstAny = null;
                for (const sellerId of p.seller_ids) {
                    const sd = supplierMap.get(sellerId);
                    if (!sd) continue;
                    if (sd.productId === p.id) {
                        if (sd.price > 0 && !exactNonZero) exactNonZero = sd;
                        if (!exactAny) exactAny = sd;
                    }
                    if (sd.price > 0 && !anyNonZero) anyNonZero = sd;
                    if (!firstAny) firstAny = sd;
                }
                const bestSeller = exactNonZero || anyNonZero || exactAny || firstAny;
                if (bestSeller) {
                    provider = bestSeller.name;
                    if (bestSeller.price > 0) cost = bestSeller.price; // Don't overwrite standard_price with 0
                }
            }

            // Fallback to template-level supplier cost when variant seller_ids is empty/zero
            if (cost === 0 || provider === 'N/A') {
                const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
                const tmplSeller = tmplId ? tmplCostMap.get(tmplId) : undefined;
                if (tmplSeller) {
                    if (cost === 0) cost = tmplSeller.price;
                    if (provider === 'N/A') provider = tmplSeller.name;
                }
            }

            return {
                barcode: p.barcode || String(p.id),
                supplierCode: p.default_code || '',
                description: name.trim(),
                cost: cost,
                price: p.lst_price || 0,
                supplierName: provider !== 'N/A' ? provider : 'Odoo Import',
                category: category,
                provider: provider,
                stock: stockMap.get(p.id) || (p.free_qty || p.qty_available || 0)
            };
        });

    } catch (error) {
        console.error("❌ Odoo Sync Error:", error);
        throw error;
    }
};

const CHUNK_SIZE = 200;

const fetchTemplateSupplierCosts = async (tmplIds: number[]): Promise<Map<number, { name: string, price: number }>> => {
    if (tmplIds.length === 0) return new Map();
    try {
        // Chunk to avoid oversized JSON-RPC payloads
        const allInfos: any[] = [];
        for (let i = 0; i < tmplIds.length; i += CHUNK_SIZE) {
            const chunk = tmplIds.slice(i, i + CHUNK_SIZE);
            const res = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: "2.0", method: "call",
                    params: {
                        model: "product.supplierinfo", method: "search_read",
                        args: [[['product_tmpl_id', 'in', chunk], ['price', '>', 0]]],
                        kwargs: { fields: ['product_tmpl_id', 'partner_id', 'price'], limit: false }
                    },
                    id: 9901
                })
            });
            const chunkInfos = (await res.json()).result;
            if (!Array.isArray(chunkInfos)) {
                console.warn(`⚠️ fetchTemplateSupplierCosts chunk ${i}-${i + CHUNK_SIZE}: unexpected response`, chunkInfos);
                continue;
            }
            allInfos.push(...chunkInfos);
        }

        const partnerIds = [...new Set(allInfos.map((i: any) => i.partner_id?.[0]).filter(Boolean))];
        if (partnerIds.length === 0) return new Map();
        const pRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: { model: "res.partner", method: "search_read", args: [[['id', 'in', partnerIds]]], kwargs: { fields: ['id', 'name'] } },
                id: 9902
            })
        });
        const pMap = new Map<number, string>((await pRes.json()).result?.map((p: any) => [p.id, p.name]) || []);
        const result = new Map<number, { name: string, price: number }>();
        for (const info of allInfos) {
            const tmplId = Array.isArray(info.product_tmpl_id) ? info.product_tmpl_id[0] : info.product_tmpl_id;
            const name = pMap.get(info.partner_id?.[0]) || 'N/A';
            const existing = result.get(tmplId);
            if (!existing) result.set(tmplId, { name, price: info.price });
        }
        return result;
    } catch (err) {
        console.error('❌ fetchTemplateSupplierCosts failed:', err);
        return new Map();
    }
};

const fetchSupplierNames = async (products: any[]): Promise<Map<number, { name: string, price: number, productId: number | null }>> => {
    try {
        const sellerIdsSet = new Set<number>();
        products.forEach(p => { if (Array.isArray(p.seller_ids)) p.seller_ids.forEach((id: number) => sellerIdsSet.add(id)); });
        const sellerIds = Array.from(sellerIdsSet);
        if (sellerIds.length === 0) return new Map();

        const supplierMap = new Map<number, any>();
        const partnerIds = new Set<number>();
        const sellerToDataMap = new Map<number, any>();

        // Fetch ALL seller info at once
        const res = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: {
                    model: "product.supplierinfo", method: "search_read",
                    args: [[['id', 'in', sellerIds]]],
                    kwargs: { fields: ['id', 'partner_id', 'price', 'product_id'], limit: false }
                },
                id: 998
            })
        });

        const infos = (await res.json()).result || [];
        infos.forEach((info: any) => {
            if (info.partner_id) {
                const pid = info.partner_id[0]; partnerIds.add(pid);
                sellerToDataMap.set(info.id, { partnerId: pid, price: info.price || 0, productId: Array.isArray(info.product_id) ? info.product_id[0] : null });
            }
        });

        if (partnerIds.size === 0) return new Map();

        const pRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: { model: "res.partner", method: "search_read", args: [[['id', 'in', Array.from(partnerIds)]]], kwargs: { fields: ['id', 'name'] } },
                id: 999
            })
        });

        const pMap = new Map<number, string>();
        ((await pRes.json()).result || []).forEach((partner: any) => pMap.set(partner.id, partner.name));

        sellerToDataMap.forEach((data, sid) => {
            const name = pMap.get(data.partnerId);
            if (name) supplierMap.set(sid, { name, price: data.price, productId: data.productId });
        });

        return supplierMap;
    } catch (error) {
        console.error('getProductsByBarcodes failed:', error);
        throw error;
    }
};

export const getProductsByBarcodes = async (barcodes: string[]): Promise<Map<string, OdooProduct>> => {
    if (!barcodes || barcodes.length === 0) return new Map();
    try {
        await ensureSession();

        const inputKeys = Array.from(new Set(barcodes.map(b => String(b || '').trim()).filter(Boolean)));
        const normalizedInputKeys = Array.from(new Set(inputKeys.map(normalizeLookupCode).filter(Boolean)));

        const response = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: {
                    model: "product.product", method: "search_read",
                    args: [[['barcode', 'in', inputKeys]]],
                    kwargs: { fields: ["id", "name", "display_name", "default_code", "barcode", "lst_price", "standard_price", "categ_id", "seller_ids", "product_tmpl_id", "qty_available", "virtual_available", "free_qty"] }
                },
                id: 123
            })
        });

        let products = (await response.json()).result || [];

        // Fallback: many providers send internal supplier code in "barcode" column.
        // Try matching missing keys against product.default_code as second pass.
        const foundNormalized = new Set<string>();
        products.forEach((p: any) => {
            const b = normalizeLookupCode(p.barcode || '');
            const d = normalizeLookupCode(p.default_code || '');
            if (b) foundNormalized.add(b);
            if (d) foundNormalized.add(d);
        });
        const missing = normalizedInputKeys.filter(k => !foundNormalized.has(k));
        if (missing.length > 0) {
            const fallbackRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: "2.0", method: "call",
                    params: {
                        model: "product.product", method: "search_read",
                        args: [[['default_code', 'in', missing]]],
                        kwargs: { fields: ["id", "name", "display_name", "default_code", "barcode", "lst_price", "standard_price", "categ_id", "seller_ids", "product_tmpl_id", "qty_available", "virtual_available", "free_qty"] }
                    },
                    id: 124
                })
            });
            const fallbackProducts = (await fallbackRes.json()).result || [];
            if (fallbackProducts.length > 0) {
                const byId = new Map<number, any>();
                [...products, ...fallbackProducts].forEach((p: any) => byId.set(p.id, p));
                products = Array.from(byId.values());
            }
        }

        const supplierMap = await fetchSupplierNames(products);
        const stockMap = await fetchStockFromQuants(products.map((p: any) => p.id));

        // Template fallback — same logic as fetchOdooProducts
        const tmplIdsForLookup = [...new Set(products
            .filter((p: any) => {
                if (!Array.isArray(p.seller_ids) || p.seller_ids.length === 0) return true;
                return !p.seller_ids.some((sid: number) => {
                    const sd = supplierMap.get(sid);
                    return sd && sd.price > 0;
                });
            })
            .map((p: any) => Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id)
            .filter(Boolean))] as number[];
        const tmplCostMapLocal = await fetchTemplateSupplierCosts(tmplIdsForLookup);

        const resultMap = new Map<string, OdooProduct>();
        products.forEach((p: any) => {
            if (!p.barcode) return;
            let category = (p.categ_id && p.categ_id[1]) ? p.categ_id[1].replace('All products /', '').trim() : 'Sin Categoría';
            let name = (p.display_name || p.name || 'Sin Nombre').replace(/^\[.*?\]\s*/, '').replace(/\((.*?)\)/, '$1');
            let provider = 'N/A';
            let cost = p.standard_price || 0;

            if (Array.isArray(p.seller_ids) && p.seller_ids.length > 0) {
                let exactNonZero = null, exactAny = null, anyNonZero = null, firstAny = null;
                for (const sid of p.seller_ids) {
                    const sd = supplierMap.get(sid);
                    if (!sd) continue;
                    if (sd.productId === p.id) {
                        if (sd.price > 0 && !exactNonZero) exactNonZero = sd;
                        if (!exactAny) exactAny = sd;
                    }
                    if (sd.price > 0 && !anyNonZero) anyNonZero = sd;
                    if (!firstAny) firstAny = sd;
                }
                const best = exactNonZero || anyNonZero || exactAny || firstAny;
                if (best) { provider = best.name; if (best.price > 0) cost = best.price; }
            }

            // Template fallback
            if (cost === 0 || provider === 'N/A') {
                const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
                const tmplSeller = tmplId ? tmplCostMapLocal.get(tmplId) : undefined;
                if (tmplSeller) {
                    if (cost === 0) cost = tmplSeller.price;
                    if (provider === 'N/A') provider = tmplSeller.name;
                }
            }

            const item: OdooProduct = {
                barcode: p.barcode, supplierCode: p.default_code || '', description: name.trim(),
                cost: cost, price: p.lst_price || 0, supplierName: provider !== 'N/A' ? provider : 'Odoo Import',
                category, provider, stock: stockMap.get(p.id) || 0
            };

            // Multi-key index for resilient matching from provider files
            const rawBarcode = String(p.barcode || '').trim();
            const rawSupplierCode = String(p.default_code || '').trim();
            const normBarcode = normalizeLookupCode(rawBarcode);
            const normSupplierCode = normalizeLookupCode(rawSupplierCode);
            if (rawBarcode) resultMap.set(rawBarcode, item);
            if (normBarcode) resultMap.set(normBarcode, item);
            if (rawSupplierCode) resultMap.set(rawSupplierCode, item);
            if (normSupplierCode) resultMap.set(normSupplierCode, item);
        });

        return resultMap;
    } catch (error) { return new Map(); }
};

export const updateProductPrice = async (barcode: string, newPrice?: number, newCost?: number, providerName?: string): Promise<boolean> => {
    try {
        // Guard: NEVER write 0 to Odoo. If a caller passes 0, treat as "don't update this field".
        // Reason: a missing/unloaded value defaulting to 0 must not overwrite real prices/costs in Odoo.
        const shouldUpdatePrice = typeof newPrice === 'number' && newPrice > 0;
        const shouldUpdateCost = typeof newCost === 'number' && newCost > 0;
        if (!shouldUpdatePrice && !shouldUpdateCost) {
            console.warn(`⏭️ updateProductPrice(${barcode}): nothing to update (price=${newPrice}, cost=${newCost})`);
            return false;
        }

        // 1. Auth (cached — skips the round-trip if session still valid)
        await ensureSession();

        // 2. Find product with detailed variant info
        const searchRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: {
                    model: "product.product", method: "search_read",
                    args: [[['barcode', '=', barcode]]],
                    kwargs: { fields: ["id", "product_tmpl_id", "list_price", "product_template_attribute_value_ids"] }
                }
            })
        });
        const pResult = (await searchRes.json()).result;
        if (!pResult || pResult.length === 0) return false;
        const p = pResult[0];

        // 3. Logic: Update Variant vs Template (only if price update requested)
        const attrValueIds = p.product_template_attribute_value_ids || [];

        if (shouldUpdatePrice && attrValueIds.length > 0) {
            // VARIANT DETECTED
            // We want: template_price + extra = newPrice
            // So: extra = newPrice - template_price
            const templatePrice = p.list_price || 0; // list_price on variant is a related field to template.list_price
            const neededExtra = (newPrice as number) - templatePrice;

            // Idempotency guard: read the current price_extra of each PTAV so we only write when a value
            // actually differs from the target. Avoids redundant writes when the price is already correct.
            const curRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: "2.0", method: "call",
                    params: {
                        model: "product.template.attribute.value", method: "read",
                        args: [attrValueIds], kwargs: { fields: ["id", "price_extra"] }
                    }
                })
            });
            const curExtras: any[] = (await curRes.json()).result || [];
            const extraById = new Map<number, number>(curExtras.map((e: any) => [e.id, e.price_extra || 0]));
            const primaryNeedsWrite = !extraById.has(attrValueIds[0]) || Math.abs((extraById.get(attrValueIds[0]) || 0) - neededExtra) > 0.001;
            const secondaryNeedsZero = attrValueIds.slice(1).some((id: number) => Math.abs(extraById.get(id) || 0) > 0.001);

            console.log(`🔧 Variant update: Template ${templatePrice}, target extra ${neededExtra} on attr ${attrValueIds[0]} (write=${primaryNeedsWrite}, zeroSecondary=${secondaryNeedsZero})`);

            if (primaryNeedsWrite) {
                const attrRes = await fetchWithRetry(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({
                        jsonrpc: "2.0", method: "call",
                        params: {
                            model: "product.template.attribute.value", method: "write",
                            args: [[attrValueIds[0]], { price_extra: neededExtra }], kwargs: {}
                        }
                    })
                });
                if (!attrRes.ok) throw new Error(`HTTP Error: ${attrRes.status}`);
                const attrJson = await attrRes.json();
                if (attrJson.error) throw new Error(attrJson.error.data?.message || attrJson.error.message || "Failed to update variant price");
            }

            // If there are more attributes, zero them out to ensure exact price match
            if (attrValueIds.length > 1 && secondaryNeedsZero) {
                const extraRes = await fetchWithRetry(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({
                        jsonrpc: "2.0", method: "call",
                        params: {
                            model: "product.template.attribute.value", method: "write",
                            args: [attrValueIds.slice(1), { price_extra: 0 }], kwargs: {}
                        }
                    })
                });
                if (!extraRes.ok) throw new Error(`HTTP Error: ${extraRes.status}`);
                const extraJson = await extraRes.json();
                if (extraJson.error) throw new Error(extraJson.error.data?.message || extraJson.error.message || "Failed to zero out extra variants");
            }
        } else if (shouldUpdatePrice) {
            // SIMPLE PRODUCT (no variant attribute values reported for this product.product)
            // SAFETY GUARD: a variant can be mis-read with an empty product_template_attribute_value_ids.
            // Writing list_price here propagates to the SHARED product.template (Odoo _inherits) and,
            // combined with a leftover price_extra on the variant, re-creates the doubled price
            // (e.g. template 48.50 + price_extra 48.50 = 97.00). Refuse to touch list_price when the
            // template actually has variants — never contaminate a shared template from this branch.
            const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
            const tmplInfoRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: "2.0", method: "call",
                    params: {
                        model: "product.template", method: "read",
                        args: [[tmplId]], kwargs: { fields: ["product_variant_count", "attribute_line_ids"] }
                    }
                })
            });
            const tmplInfo = ((await tmplInfoRes.json()).result || [])[0] || {};
            const variantCount = tmplInfo.product_variant_count || 0;
            const hasAttrLines = Array.isArray(tmplInfo.attribute_line_ids) && tmplInfo.attribute_line_ids.length > 0;
            if (variantCount > 1 || hasAttrLines) {
                throw new Error(`SAFETY_ABORT: ${barcode} pertenece a un template con variantes (variants=${variantCount}, attrLines=${hasAttrLines}). No se escribe list_price para evitar duplicar precios de variantes. Re-sincroniza el producto para que cargue sus atributos de variante y reintenta.`);
            }

            // Genuinely simple product → update template price directly
            console.log(`🔄 Simple product update: Setting template price to ${newPrice}`);
            const tmplRes = await fetchWithRetry(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: "2.0", method: "call",
                    params: {
                        model: "product.product", method: "write",
                        args: [[p.id], { list_price: newPrice }], kwargs: {}
                    }
                })
            });
            if (!tmplRes.ok) throw new Error(`HTTP Error: ${tmplRes.status}`);
            const tmplJson = await tmplRes.json();
            if (tmplJson.error) throw new Error(tmplJson.error.data?.message || tmplJson.error.message || "Failed to update simple product price");
        }

        // 4. Update Cost — only if a valid (>0) cost was provided
        if (shouldUpdateCost) {
            try {
                const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;

                // Fetch ALL seller records: variant-specific AND template-level in one query
                const allSellersRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                    body: JSON.stringify({
                        jsonrpc: "2.0", method: "call",
                        params: {
                            model: "product.supplierinfo", method: "search_read",
                            args: [['|', ['product_id', '=', p.id], ['product_tmpl_id', '=', tmplId]]],
                            kwargs: { fields: ['id', 'partner_id', 'price', 'product_id'], limit: 20 }
                        }
                    })
                });
                const allSellers: any[] = (await allSellersRes.json()).result || [];

                // Prefer exact provider name match; fall back to all non-zero price sellers; last resort all sellers
                const isGenericProvider = !providerName || providerName === 'N/A' || providerName === 'Odoo Import';
                const exactMatch = isGenericProvider ? [] : allSellers.filter(s =>
                    (Array.isArray(s.partner_id) ? s.partner_id[1] : '') === providerName
                );
                const nonZero = allSellers.filter(s => s.price > 0);
                const toUpdate = exactMatch.length > 0 ? exactMatch : nonZero.length > 0 ? nonZero : allSellers;

                for (const seller of toUpdate) {
                    const writeRes = await fetchWithRetry(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                        body: JSON.stringify({
                            jsonrpc: "2.0", method: "call",
                            params: {
                                model: "product.supplierinfo", method: "write",
                                args: [[seller.id], { price: newCost }], kwargs: {}
                            }
                        })
                    });
                    const writeJson = await writeRes.json();
                    if (writeJson.error) console.error("⚠️ SupplierInfo write error:", writeJson.error);
                }

                // No seller records exist at all → create one for the provider
                if (allSellers.length === 0 && !isGenericProvider) {
                    const partnerRes = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                        body: JSON.stringify({
                            jsonrpc: "2.0", method: "call",
                            params: { model: "res.partner", method: "search", args: [[['name', '=', providerName]]], kwargs: { limit: 1 } }
                        })
                    });
                    const partnerIds = (await partnerRes.json()).result || [];
                    if (partnerIds.length > 0) {
                        const createRes = await fetchWithRetry(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                            body: JSON.stringify({
                                jsonrpc: "2.0", method: "call",
                                params: {
                                    model: "product.supplierinfo", method: "create",
                                    args: [{ partner_id: partnerIds[0], product_tmpl_id: tmplId, price: newCost, min_qty: 1 }],
                                    kwargs: {}
                                }
                            })
                        });
                        const createJson = await createRes.json();
                        if (createJson.error) console.error("⚠️ SupplierInfo create error:", createJson.error);
                    }
                }
            } catch (err) {
                console.error("⚠️ Error updating SupplierInfo:", err);
            }
        }
        return true;
    } catch (error) { throw error; }
};

const fetchStockFromQuants = async (productIds: number[]): Promise<Map<number, number>> => {
    if (productIds.length === 0) return new Map();
    try {
        const stockMap = new Map<number, number>();
        const response = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({
                jsonrpc: "2.0", method: "call",
                params: {
                    model: "stock.quant", method: "search_read",
                    args: [[['product_id', 'in', productIds], ['location_id.usage', '=', 'internal']]],
                    kwargs: { fields: ['product_id', 'quantity'], limit: false }
                },
                id: 888
            })
        });
        const res = await response.json();
        (res.result || []).forEach((q: any) => {
            if (q.product_id) {
                const pid = q.product_id[0];
                stockMap.set(pid, (stockMap.get(pid) || 0) + (q.quantity || 0));
            }
        });
        return stockMap;
    } catch (error) { return new Map(); }
};
