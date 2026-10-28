export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface CategorySummary {
  id: number;
  name: string;
  slug: string;
}

export interface Category extends CategorySummary {
  description: string;
  parent: CategorySummary | null;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface ProductImage {
  image_url: string;
  alt_text: string;
  display_order: number;
  is_primary: boolean;
}

export interface ProductSpecification {
  name: string;
  value: string;
}

export type ProductType =
  | "spare_part"
  | "car"
  | "electric_vehicle"
  | "tricycle"
  | "motorcycle_bike"
  | "other";

export type SalesMethod = "direct_purchase" | "quotation";

export interface Product {
  id: number;
  sku: string;
  name: string;
  slug: string;
  description: string;
  category: CategorySummary;
  brand: Brand | null;
  product_type: ProductType;
  sales_method: SalesMethod;
  price: string | null;
  weight_kg: string | null;
  currency: string;
  images: ProductImage[];
  specifications: ProductSpecification[];
  created_at: string;
  updated_at: string;
}

export type CatalogueProductType = Extract<
  ProductType,
  "spare_part" | "car" | "electric_vehicle" | "tricycle" | "motorcycle_bike"
>;

export interface Customer {
  id: number;
  email: string;
  created_at: string;
}

export interface AuthenticationResponse {
  token: string;
  customer: Customer;
}

export interface CartProduct {
  id: number;
  name: string;
  slug: string;
  product_type: ProductType;
  price: string | null;
  currency: string;
}

export interface CartItem {
  id: number;
  product: CartProduct | null;
  quantity: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Cart {
  id: number;
  items: CartItem[];
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  product_weight_kg: string | null;
}

export interface DeliveryPricingSnapshot {
  status: "estimated" | "manual_review";
  requires_manual_review: boolean;
  review_reason: string;
  currency: string;
  base_fee: string | null;
  distance_component: string | null;
  weight_component: string | null;
  surcharges: Array<{ code: string; name: string; amount: string }>;
  estimated_distance_km: string | null;
  shipment_weight_kg: string | null;
  distance_source: string;
  delivery_fee: string | null;
  minimum_fee_applied: boolean;
  maximum_fee_applied: boolean;
  formula_version: string | null;
  pricing_inputs: {
    base_fee?: string;
    rate_per_km?: string;
    rate_per_kg?: string;
    minimum_fee?: string;
    maximum_fee?: string | null;
    rounding_mode?: string;
  };
  weighted_items: Array<{
    product_id: number;
    sku: string;
    quantity: number;
    unit_weight_kg: string | null;
    line_weight_kg: string | null;
  }>;
  destination: {
    city: string;
    region: string;
    country: string;
    zone_code: string;
  };
  subtotal: string | null;
  order_total: string | null;
}

export type OrderStatus =
  | "pending"
  | "processing"
  | "completed"
  | "cancelled"
  | "expired";

export type OrderPaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "failed"
  | "refunded";

export interface Order {
  public_reference: string;
  status: OrderStatus;
  payment_status: OrderPaymentStatus;
  currency: string;
  subtotal: string;
  delivery_fee: string;
  discount: string;
  total: string;
  shipping_full_name: string;
  shipping_email: string;
  shipping_phone: string;
  shipping_address_line_1: string;
  shipping_address_line_2: string;
  shipping_city: string;
  shipping_region: string;
  shipping_postal_code: string;
  shipping_country: string;
  delivery_zone_code: string;
  delivery_zone_name: string;
  shipment_weight_kg: string | null;
  estimated_distance_km: string | null;
  delivery_distance_source: string;
  delivery_pricing_snapshot: DeliveryPricingSnapshot;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface DeliveryZone {
  code: string;
  name: string;
  city: string;
  region: string;
  estimated_distance_km: string | null;
}

export type DeliveryQuote = DeliveryPricingSnapshot;

export interface PaymentInitialization {
  reference: string;
  status: string;
  authorization_url: string | null;
}

export interface PaymentVerification {
  reference: string;
  status: string;
  outcome:
    | "succeeded"
    | "failed"
    | "abandoned"
    | "pending"
    | "inconclusive"
    | "refund_required"
    | "reconciliation_required"
    | string;
}

export interface CheckoutDetails {
  full_name: string;
  email: string;
  phone: string;
  address_line_1: string;
  address_line_2?: string;
  city: string;
  region: string;
  postal_code?: string;
  country?: string;
}
