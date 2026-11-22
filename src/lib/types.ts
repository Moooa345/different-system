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
  status: OrderStatus; subtotal_egp: number; shipping_fee_egp: number; total_egp: number;
  cod_fee_egp: number; payment_method: PaymentMethod; return_loss_egp: number; notes: string | null; created_by: string | null;
  created_at: string; updated_at: string;
}
export type OrderItem = {
  id: string; order_id: string; variant_id: string; product_name: string; variant_sku: string;
  quantity: number; unit_cost_price: number; unit_sell_price: number; line_total_egp: number; created_at: string;
}
export type StockLog = {
  id: string; variant_id: string; order_id: string | null; quantity_delta: number;
  reason: StockLogReason; note: string | null; created_by: string | null; created_at: string;
}

export interface Database {
  public: {
    Tables: {
      products: { Row: Product; Insert: { id?: string; name: string; description?: string | null; category: string; brand?: string | null; is_best_seller?: boolean; compare_at_price?: number | null; image_url?: string | null; image_urls?: string[]; gallery_urls?: string[]; style_tags?: string[]; is_active?: boolean; created_at?: string; updated_at?: string }; Update: Partial<Product>; Relationships: [] };
      product_variants: { Row: ProductVariant; Insert: { id?: string; product_id: string; sku: string; color?: string | null; size?: string | null; image_url?: string | null; unit_cost_price: number; unit_sell_price: number; stock_qty?: number; is_active?: boolean; created_at?: string; updated_at?: string }; Update: Partial<ProductVariant>; Relationships: [] };
      shipping_zones: { Row: ShippingZone; Insert: Omit<ShippingZone, 'id' | 'created_at' | 'cod_fee_egp'> & Partial<Pick<ShippingZone, 'id' | 'created_at' | 'cod_fee_egp'>>; Update: Partial<ShippingZone>; Relationships: [] };
      orders: { Row: Order; Insert: Omit<Order, 'id' | 'order_number' | 'created_at' | 'updated_at' | 'return_loss_egp' | 'cod_fee_egp' | 'payment_method'> & Partial<Pick<Order, 'id' | 'order_number' | 'created_at' | 'updated_at' | 'return_loss_egp' | 'cod_fee_egp' | 'payment_method'>>; Update: Partial<Order>; Relationships: [] };
      order_items: { Row: OrderItem; Insert: Omit<OrderItem, 'id' | 'created_at'> & Partial<Pick<OrderItem, 'id' | 'created_at'>>; Update: Partial<OrderItem>; Relationships: [] };
      stock_logs: { Row: StockLog; Insert: Omit<StockLog, 'id' | 'created_at'> & Partial<Pick<StockLog, 'id' | 'created_at'>>; Update: Partial<StockLog>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      create_order_atomic: { Args: { order_payload: Json; items_array: Json }; Returns: string };
      get_public_order_number: { Args: { p_order_id: string }; Returns: Json };
      update_order_status_atomic: { Args: { p_order_id: string; p_new_status: string }; Returns: undefined };
      cancel_order_atomic: { Args: { p_order_id: string }; Returns: undefined };
      adjust_variant_stock_atomic: { Args: { p_variant_id: string; p_delta: number; p_reason?: string }; Returns: number };
      get_storefront_product_sales_stats: { Args: Record<string, never>; Returns: StorefrontProductSalesStat[] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
