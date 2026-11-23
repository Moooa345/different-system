export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'returned';
export type OrderChannel = 'storefront' | 'pos';
export type PaymentMethod = 'cash' | 'instapay' | 'cod';
export type StockLogReason = 'sale' | 'cancellation' | 'return' | 'adjustment';

export type Product = {
  id: string; name: string; description: string | null; category: string; brand: string | null;
  is_best_seller: boolean; compare_at_price: number | null;
  image_url: string | null; image_urls: string[]; gallery_urls: string[]; style_tags: string[]; is_active: boolean; created_at: string; updated_at: string;
}
export type StorefrontProductSalesStat = {
  product_id: string;
  sold_last_30_days: number;
  total_sold: number;
}
export type ProductVariant = {
  id: string; product_id: string; sku: string; color: string | null; size: string | null;
  image_url: string | null;
  unit_cost_price: number; unit_sell_price: number; stock_qty: number; is_active: boolean;
  created_at: string; updated_at: string;
}
export type ShippingZone = {
  id: string; name: string; fee_egp: number; cod_fee_egp: number; is_active: boolean; created_at: string;
}
export type Order = {
  id: string; order_number: number; customer_name: string; customer_phone: string;
  shipping_address: string | null; shipping_zone_id: string | null; channel: OrderChannel;
  status: OrderStatus; subtotal_egp: number; discount_amount: number; shipping_fee_egp: number; total_egp: number;
  cod_fee_egp: number; payment_method: PaymentMethod; return_loss_egp: number; notes: string | null; created_by: string | null; cashier_id: string | null; shift_id: string | null;
  created_at: string; updated_at: string;
}
export type OrderItem = {
  id: string; order_id: string; variant_id: string | null; product_name: string; variant_sku: string;
  quantity: number; unit_cost_price: number; unit_sell_price: number; line_total_egp: number; created_at: string;
}
export type StockLog = {
  id: string; variant_id: string | null; order_id: string | null; quantity_delta: number;
  reason: StockLogReason; note: string | null; created_by: string | null; created_at: string;
}
export type ProductReturn = {
  id: string; order_id: string | null; product_id: string | null; variant_id: string | null;
  product_name_snapshot: string; variant_label_snapshot: string; quantity: number; refund_amount: number;
  refund_method: 'cash' | 'instapay' | 'card' | 'wallet'; reason: string | null; shift_id: string | null;
  processed_by: string | null; processed_by_name: string | null; created_at: string;
}
export type Expense = {
  id: string; category_group: 'operational' | 'petty_damages';
  sub_category: 'rent' | 'electricity' | 'taxes' | 'salaries' | 'other_operational' | 'damaged_goods' | 'renovations' | 'hospitality' | 'emergency' | 'other_petty';
  title: string; amount: number; expense_date: string; notes: string | null; created_by: string | null; created_at: string;
}

export interface Database {
  public: {
    Tables: {
      staff_accounts: { Row: { user_id: string; email: string | null; role: 'owner' | 'cashier'; display_name: string | null; is_active: boolean; created_at: string; updated_at: string }; Insert: { user_id: string; email?: string | null; role: 'owner' | 'cashier'; display_name?: string | null; is_active?: boolean }; Update: Partial<{ email: string | null; role: 'owner' | 'cashier'; display_name: string | null; is_active: boolean }> ; Relationships: [] };
      shift_templates: { Row: { id: string; name_ar: string; name_en: string; start_time: string; end_time: string; grace_minutes: number; is_active: boolean; created_at: string }; Insert: { id?: string; name_ar: string; name_en: string; start_time: string; end_time: string; grace_minutes?: number; is_active?: boolean }; Update: Partial<{ name_ar: string; name_en: string; start_time: string; end_time: string; grace_minutes: number; is_active: boolean }>; Relationships: [] };
      shifts: { Row: { id: string; cashier_id: string; cashier_name: string | null; template_id: string | null; scheduled_start_at: string; scheduled_end_at: string | null; opened_at: string; closed_at: string | null; status: 'open' | 'closed'; punctuality_status: 'early' | 'on_time' | 'late'; punctuality_diff_minutes: number; checkout_status: 'overtime' | 'on_time' | 'early_leave' | null; checkout_diff_minutes: number | null; opening_cash_egp: number; expected_cash_egp: number | null; actual_closing_cash_egp: number | null; cash_variance_egp: number | null; notes: string | null; created_at: string }; Insert: { id?: string; cashier_id: string; cashier_name?: string | null; template_id?: string | null; scheduled_start_at: string; scheduled_end_at?: string | null; opened_at?: string; closed_at?: string | null; status?: 'open' | 'closed'; punctuality_status: 'early' | 'on_time' | 'late'; punctuality_diff_minutes: number; checkout_status?: 'overtime' | 'on_time' | 'early_leave' | null; checkout_diff_minutes?: number | null; opening_cash_egp?: number; expected_cash_egp?: number | null; actual_closing_cash_egp?: number | null; cash_variance_egp?: number | null; notes?: string | null }; Update: Partial<{ status: 'open' | 'closed'; closed_at: string | null; expected_cash_egp: number | null; actual_closing_cash_egp: number | null; cash_variance_egp: number | null; scheduled_end_at: string | null; checkout_status: 'overtime' | 'on_time' | 'early_leave' | null; checkout_diff_minutes: number | null; notes: string | null }>; Relationships: [] };
      products: { Row: Product; Insert: { id?: string; name: string; description?: string | null; category: string; brand?: string | null; is_best_seller?: boolean; compare_at_price?: number | null; image_url?: string | null; image_urls?: string[]; gallery_urls?: string[]; style_tags?: string[]; is_active?: boolean; created_at?: string; updated_at?: string }; Update: Partial<Product>; Relationships: [] };
      product_variants: { Row: ProductVariant; Insert: { id?: string; product_id: string; sku: string; color?: string | null; size?: string | null; image_url?: string | null; unit_cost_price: number; unit_sell_price: number; stock_qty?: number; is_active?: boolean; created_at?: string; updated_at?: string }; Update: Partial<ProductVariant>; Relationships: [] };
      shipping_zones: { Row: ShippingZone; Insert: Omit<ShippingZone, 'id' | 'created_at' | 'cod_fee_egp'> & Partial<Pick<ShippingZone, 'id' | 'created_at' | 'cod_fee_egp'>>; Update: Partial<ShippingZone>; Relationships: [] };
      orders: { Row: Order; Insert: Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at' | 'return_loss_egp' | 'cod_fee_egp' | 'payment_method' | 'cashier_id' | 'shift_id'> & Partial<Pick<Order, 'id' | 'order_number' | 'created_at' | 'updated_at' | 'return_loss_egp' | 'cod_fee_egp' | 'payment_method' | 'cashier_id' | 'shift_id'>>; Update: Partial<Order>; Relationships: [] };
      order_items: { Row: OrderItem; Insert: Omit<OrderItem, 'id' | 'created_at'> & Partial<Pick<OrderItem, 'id' | 'created_at'>>; Update: Partial<OrderItem>; Relationships: [] };
      stock_logs: { Row: StockLog; Insert: Omit<StockLog, 'id' | 'created_at'> & Partial<Pick<StockLog, 'id' | 'created_at'>>; Update: Partial<StockLog>; Relationships: [] };
      product_returns: { Row: ProductReturn; Insert: Omit<ProductReturn, 'id' | 'created_at'> & Partial<Pick<ProductReturn, 'id' | 'created_at'>>; Update: Partial<ProductReturn>; Relationships: [] };
      expenses: { Row: Expense; Insert: Omit<Expense, 'id' | 'created_at' | 'created_by'> & Partial<Pick<Expense, 'id' | 'created_at' | 'created_by'>>; Update: Partial<Expense>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      get_my_staff_role: { Args: Record<string, never>; Returns: string | null };
      current_staff_role: { Args: Record<string, never>; Returns: string | null };
      is_owner: { Args: Record<string, never>; Returns: boolean };
      get_owner_variant_costs: { Args: Record<string, never>; Returns: { variant_id: string; unit_cost_price: number }[] };
      assign_staff_role: { Args: { p_email: string; p_role: string; p_display_name?: string | null }; Returns: string };
      open_cashier_shift: { Args: { p_template_id: string; p_opening_cash?: number }; Returns: Database['public']['Tables']['shifts']['Row'] };
      close_cashier_shift: { Args: { p_shift_id: string; p_actual_closing_cash: number; p_notes?: string | null }; Returns: Database['public']['Tables']['shifts']['Row'] };
      get_shift_accountability_summary: { Args: Record<string, never>; Returns: { cashier_id: string; cashier_name: string; total_late_minutes: number; total_overtime_minutes: number }[] };
      get_current_shift_summary: { Args: Record<string, never>; Returns: Json };
      get_pos_receipt: { Args: { p_order_id: string }; Returns: { order_number: number; created_at: string } };
      delete_product_permanently: { Args: { p_product_id: string }; Returns: undefined };
      create_order_atomic: { Args: { order_payload: Json; items_array: Json }; Returns: string };
      get_public_order_number: { Args: { p_order_id: string }; Returns: Json };
      update_order_status_atomic: { Args: { p_order_id: string; p_new_status: string }; Returns: undefined };
      cancel_order_atomic: { Args: { p_order_id: string }; Returns: undefined };
      adjust_variant_stock_atomic: { Args: { p_variant_id: string; p_delta: number; p_reason?: string }; Returns: number };
      get_storefront_product_sales_stats: { Args: Record<string, never>; Returns: StorefrontProductSalesStat[] };
      process_product_return: { Args: { p_variant_id: string; p_quantity: number; p_refund_amount: number; p_refund_method: ProductReturn['refund_method']; p_order_id?: string | null; p_reason?: string | null }; Returns: ProductReturn };
      get_returns_summary: { Args: { p_since?: string | null; p_until?: string | null }; Returns: { refund_total: number; return_count: number }[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
