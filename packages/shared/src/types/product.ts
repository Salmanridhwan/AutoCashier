// Shared Product and Transaction types for all AutoCashier apps

export interface Product {
  id: string;
  name: string;
  sku?: string;
  price: number;
  category?: string | null;
  image_url?: string | null;
  barcode?: string | null;
  stock: number;
  branch_id?: string | null;
  ai_label?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export type PaymentMethod = 'cash' | 'qris';

export type PaymentStatus = 'pending_verification' | 'verified' | 'failed';

export interface TransactionItem {
  id: string;
  transaction_id: string;
  product_id: string;
  product_name?: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

export interface Transaction {
  id: string;
  invoice_number?: string;
  branch_id?: string;
  cashier_id?: string | null;
  member_id?: string | null;
  items?: TransactionItem[];
  total: number;
  payment_method: PaymentMethod;
  payment_status?: PaymentStatus;
  receipt_url?: string | null;
  created_at: string;
}
