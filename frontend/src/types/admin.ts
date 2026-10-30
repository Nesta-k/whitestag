import type { Brand, HomepageSettings, Order, Promotion } from "@/types/api";

// ─── Staff identity ───────────────────────────────────────────────────────────

export type StaffRole = "superadmin" | "admin" | "staff";

export interface StaffIdentity {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  date_joined: string;
  is_superuser: boolean;
}

export interface StaffLoginResponse {
  token: string;
  staff: StaffIdentity;
}

// ─── Catalogue (staff/admin) ──────────────────────────────────────────────────

export interface CategorySummary {
  id: number;
  name: string;
  slug: string;
  product_type: string;
}

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  product_type: string;
  image_url: string;
  is_featured: boolean;
  featured_order: number;
  parent: CategorySummary | null;
}

export interface AdminProductImage {
  id?: number;
  image_url: string;
  alt_text: string;
  display_order: number;
  is_primary: boolean;
}

export interface AdminProductSpecification {
  name: string;
  value: string;
}

export interface AdminProduct {
  id: number;
  sku: string;
  name: string;
  slug: string;
  description: string;
  category: CategorySummary;
  brand: Brand | null;
  category_id?: number;
  brand_id?: number | null;
  product_type: string;
  sales_method: "direct_purchase" | "quotation";
  publication_status: "draft" | "published" | "archived";
  price: string | null;
  weight_kg: string | null;
  currency: string;
  is_featured: boolean;
  featured_order: number;
  images: AdminProductImage[];
  specifications: AdminProductSpecification[];
  created_at: string;
  updated_at: string;
}

export type AdminPromotion = Promotion;

export type AdminHomepageSettings = HomepageSettings;

export interface MediaUploadResult {
  url: string;
  count?: number;
  images?: { url: string }[];
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export interface InventoryProduct {
  id: number;
  sku: string;
  name: string;
  slug: string;
  product_type: string;
  sales_method: string;
}

export interface InventoryRecord {
  id: number;
  product: InventoryProduct;
  available_quantity: number;
  reserved_quantity: number;
  reorder_threshold: number;
  created_at: string;
  updated_at: string;
}

export type StockMovementType =
  | "receipt"
  | "adjustment"
  | "reservation"
  | "release"
  | "sale"
  | "return";

export interface StockMovement {
  id: number;
  movement_type: StockMovementType;
  quantity: number;
  available_delta: number;
  reserved_delta: number;
  available_before: number;
  reserved_before: number;
  available_after: number;
  reserved_after: number;
  idempotency_key: string;
  reason: string;
  reference: string;
  created_by: number | null;
  created_at: string;
}

export interface StockOperationResult {
  inventory: InventoryRecord;
  movement: StockMovement;
}

export interface StockOperationInput {
  quantity: number;
  reason?: string;
  reference?: string;
}

// ─── Orders / payments / delivery pricing ─────────────────────────────────────

export interface DashboardOverview {
  orders_by_status: Record<string, number>;
  orders_by_payment_status: Record<string, number>;
  paid_revenue: string;
  currency: string;
  recent_orders: Order[];
  low_stock: InventoryRecord[];
  low_stock_count: number;
  unavailable_features: string[];
}

export interface StaffPayment {
  reference: string;
  status: string;
  amount: string;
  currency: string;
  order_reference: string;
  order_status: string;
  payment_status: string;
  customer_email: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRefundResult {
  reference: string;
  status: string;
  amount_minor: number;
  currency: string;
}

export interface DeliveryPricingConfiguration {
  id: number;
  version: string;
  is_active: boolean;
  base_fee: string;
  rate_per_km: string;
  rate_per_kg: string;
  minimum_fee: string;
  maximum_fee: string | null;
  currency: string;
  rounding_mode: string;
  review_weight_threshold_kg: string | null;
  review_distance_threshold_km: string | null;
  review_fee_threshold: string | null;
  updated_at?: string;
}

export interface StaffDeliveryZone {
  id: number;
  code: string;
  name: string;
  city: string;
  region: string;
  estimated_distance_km: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface StaffDeliverySurcharge {
  id: number;
  code: string;
  name: string;
  amount: string;
  zone_id: number | null;
  zone_code: string | null;
  is_active: boolean;
}

export interface StaffDeliveryPricing {
  active_configuration: DeliveryPricingConfiguration | null;
  configurations: DeliveryPricingConfiguration[];
  zones: StaffDeliveryZone[];
  surcharges: StaffDeliverySurcharge[];
}

export interface DeliveryPricingAuditEntry {
  configuration_type: string;
  object_id: string;
  object_label: string;
  action: string;
  actor_username: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}

// ─── Vehicle enquiries ────────────────────────────────────────────────────────

export type VehicleEnquiryStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface VehicleEnquiry {
  id: number;
  product: { id: number; sku: string; name: string; slug: string };
  customer: { id: number; email: string } | null;
  name: string;
  email: string;
  phone_number: string;
  message: string;
  status: VehicleEnquiryStatus;
  created_at: string;
  updated_at: string;
}

// ─── Customers / users ────────────────────────────────────────────────────────

export interface StaffCustomer {
  id: number;
  email: string;
  created_at: string;
}

export interface StaffUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  date_joined: string;
}

export interface StaffUserPayload {
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  is_active?: boolean;
  password?: string;
}
