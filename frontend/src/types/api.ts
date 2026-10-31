// ─── Catalogue ────────────────────────────────────────────────────────────────

export interface ProductImage {
  id: number;
  image_url: string;
  alt_text: string;
  display_order: number;
  is_primary: boolean;
}

export interface ProductSpecification {
  id: number;
  name: string;
  value: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  product_type: string;
  image_url: string;
  is_featured: boolean;
  featured_order: number;
  parent: number | null;
}

export interface Brand {
  id: number;
  name: string;
  slug: string;
  logo_url: string;
  description: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  slug: string;
  description: string;
  category: Category;
  brand: Brand | null;
  product_type: string;
  sales_method: "direct_purchase" | "quotation";
  publication_status: "draft" | "published" | "archived";
  price: string | null;
  currency: string;
  weight_kg: string | null;
  is_featured: boolean;
  featured_order: number;
  images: ProductImage[];
  specifications: ProductSpecification[];
  created_at: string;
  updated_at: string;
}

export interface Promotion {
  id: number;
  title: string;
  slug: string;
  description: string;
  image_url: string;
  image_alt: string;
  cta_label: string;
  cta_href: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  display_order: number;
}

export interface HomepageSettings {
  hero_kicker: string;
  hero_heading: string;
  hero_subtitle: string;
  hero_description: string;
  hero_image_url: string;
  hero_image_alt: string;
  hero_primary_cta_label: string;
  hero_primary_cta_href: string;
  hero_secondary_cta_label: string;
  hero_secondary_cta_href: string;
  categories_eyebrow: string;
  categories_heading: string;
  promotions_eyebrow: string;
  promotions_heading: string;
  featured_products_eyebrow: string;
  featured_products_heading: string;
  brands_eyebrow: string;
  brands_heading: string;
  preorders_eyebrow: string;
  preorders_heading: string;
  preorders_body: string;
  vehicles_eyebrow: string;
  vehicles_heading: string;
  vehicles_body: string;
  how_it_works_eyebrow: string;
  how_it_works_heading: string;
  support_eyebrow: string;
  support_heading: string;
  support_body: string;
  show_hero: boolean;
  show_categories: boolean;
  show_promotions: boolean;
  show_featured_products: boolean;
  show_brands: boolean;
  show_preorders: boolean;
  show_vehicles: boolean;
  show_how_it_works: boolean;
  show_support: boolean;
  section_order: string[];
  updated_at: string;
}

export interface HomepageData {
  settings: HomepageSettings;
  featured_categories: Category[];
  featured_products: Product[];
  promotions: Promotion[];
  brands: Brand[];
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ─── Auth / Customers ─────────────────────────────────────────────────────────

export interface UserProfile {
  role: "superadmin" | "admin" | "staff" | "customer";
  phone_number: string;
}

export interface CustomerAccount {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

export interface AuthToken {
  token: string;
  customer: CustomerAccount;
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

export interface CartProduct {
  id: number;
  name: string;
  slug: string;
  image_url: string;
  product_type: string;
  price: string | null;
  currency: string;
}

export interface CartItem {
  id: number;
  product: CartProduct | null;
  quantity: number;
  is_available: boolean;
}

export interface Cart {
  id: number;
  items: CartItem[];
  item_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────

export interface WishlistItem {
  id: number;
  product: Product;
  created_at: string;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface DeliveryZone {
  id: number;
  code: string;
  name: string;
  city: string;
  region: string;
  estimated_distance_km: string | null;
  is_active: boolean;
}

export interface DeliveryQuote {
  status: "estimated" | "manual_review";
  requires_manual_review: boolean;
  review_reason: string;
  pricing_mode?: "distance_formula" | "ghana_regional" | "international_manual";
  currency: string;
  delivery_fee: string | null;
  subtotal: string | null;
  order_total: string | null;
  base_fee?: string | null;
  distance_component?: string | null;
  weight_component?: string | null;
  estimated_distance_km?: string | null;
  shipment_weight_kg?: string | null;
  surcharges?: { code: string; name: string; amount: string }[];
  destination?: Record<string, string>;
  quote_request_available?: boolean;
}

export interface DeliveryOptions {
  regions: {
    region_code: string;
    region_name: string;
    is_active: boolean;
    allow_fallback: boolean;
  }[];
  countries: { country_code: string; country_name: string }[];
  international: {
    manual_quotes_enabled: boolean;
    instructions: string;
    updated_at: string;
  };
}

export interface DeliveryQuoteRequestResult {
  reference: string;
  status: string;
}

export interface OrderItem {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export interface Order {
  id: number;
  public_reference: string;
  status: "pending" | "processing" | "completed" | "cancelled" | "expired";
  payment_status: "unpaid" | "pending" | "paid" | "failed" | "refunded";
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
  delivery_zone_name: string;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface CheckoutPayload {
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

export interface PaymentInit {
  reference: string;
  status: string;
  authorization_url: string | null;
}

// ─── Enquiries ────────────────────────────────────────────────────────────────

export interface VehicleEnquiryPayload {
  product: number;
  name: string;
  email: string;
  phone_number: string;
  message: string;
}
