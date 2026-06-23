export enum ChangeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SYSTEM_UPDATED = 'SYSTEM_UPDATED',
  STORE_EXECUTED = 'STORE_EXECUTED'
}

export interface OdooProduct {
  barcode: string;
  supplierCode: string;
  description: string;
  cost: number;
  price: number;
  supplierName: string;
  category: string;
  provider?: string; // Real supplier/provider from Odoo
  stock?: number;
}

export interface SupplierInputItem {
  barcode: string;
  supplierCode: string; // Optional fallback
  description: string;
  newCost: number;
  suggestedPrice?: number;
}

export interface MergedItem extends OdooProduct {
  id: string;
  batchSupplierName: string; // New: The supplier name entered during ingestion
  newCost: number;
  suggestedPrice?: number;
  newPrice: number; // Initially suggestedPrice or calculated

  // Status Flags
  costApproved: boolean;
  priceApproved: boolean;
  systemUpdated: boolean; // Step 4
  storeExecuted: boolean; // Step 5
  status: ChangeStatus;

  // User tracking
  createdBy?: string; // User who created/imported this item
  costApprovedBy?: string; // User who approved the cost
  priceApprovedBy?: string; // User who approved the price
  executedBy?: string[]; // List of user IDs who have executed this change

  // Audit Trail / Timestamps
  createdAt: string;
  costApprovedAt?: string;
  priceApprovedAt?: string;
  systemUpdatedAt?: string;
  storeExecutedAt?: string;

  updatedAt: string;
}

export interface BatchInfo {
  id: string;
  supplierName: string;
  date: string;
  items: MergedItem[];
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: Date;
  read: boolean;
}

export interface ProviderFile {
  name: string;
  path: string;
  size: number;
  modified: string; // ISO date string
}