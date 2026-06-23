import { OdooProduct, SupplierInputItem } from './types';

export const MOCK_ODOO_PRODUCTS: OdooProduct[] = [
  { barcode: '7791234567890', supplierCode: 'PROD-001', description: 'Leche Entera 1L', cost: 1.00, price: 1.50, supplierName: 'Lacteos del Sur', category: 'Lácteos' },
  { barcode: '7791234567891', supplierCode: 'PROD-002', description: 'Yogurt Frutilla 500g', cost: 0.80, price: 1.20, supplierName: 'Lacteos del Sur', category: 'Lácteos' },
  { barcode: '7791234567892', supplierCode: 'PROD-003', description: 'Manteca 200g', cost: 2.00, price: 2.80, supplierName: 'Lacteos del Sur', category: 'Lácteos' },
  { barcode: '7791234567893', supplierCode: 'PROD-004', description: 'Queso Crema 300g', cost: 3.50, price: 5.00, supplierName: 'Lacteos del Sur', category: 'Lácteos' },
  { barcode: '8809991112223', supplierCode: 'ELEC-100', description: 'Auriculares Bluetooth', cost: 15.00, price: 25.00, supplierName: 'TechImport', category: 'Electrónica' },
];

export const MOCK_SUPPLIER_FILE: SupplierInputItem[] = [
  { barcode: '7791234567890', supplierCode: 'PROD-001', description: 'Leche Entera 1L - Nueva Formula', newCost: 1.10, suggestedPrice: 1.65 }, // Cost up
  { barcode: '7791234567891', supplierCode: 'PROD-002', description: 'Yogurt Frutilla 500g', newCost: 0.80, suggestedPrice: 1.20 }, // No change
  { barcode: '7791234567892', supplierCode: 'PROD-003', description: 'Manteca 200g', newCost: 2.20, suggestedPrice: 3.00 }, // Cost up
  { barcode: '7791234567899', supplierCode: 'PROD-NEW', description: 'Dulce de Leche 400g (NUEVO)', newCost: 1.50, suggestedPrice: 2.20 }, // New product (not in Odoo)
];
