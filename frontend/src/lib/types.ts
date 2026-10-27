export type ProductCategory = "Cars" | "Electric Vehicles" | "Tricycles" | "Spare Parts";
export type SalesMode = "buy_now" | "quote" | "preorder";
export type Availability = "In stock" | "Low stock" | "Out of stock" | "Preorder";
export type Condition = "New" | "Used" | "Refurbished";

export type Product = {
    id: string;
    slug: string;
    name: string;
    category: ProductCategory;
    brand: string;
    model: string;
    description: string;
    price: number;
    currency: "GHS";
    images: string[];
    specifications: Record<string, string>;
    stockQuantity: number;
    availability: Availability;
    condition: Condition;
    published: boolean;
    salesMode: SalesMode;
    createdAt: string;
};

export type CartItem = {
    productId: string;
    quantity: number;
};

export type DemoOrder = {
    id: string;
    customerName: string;
    email: string;
    phone: string;
    items: CartItem[];
    total: number;
    paymentMethod: string;
    status: "Pending" | "Confirmed" | "Ready for collection" | "Completed" | "Cancelled";
    createdAt: string;
};

export type Enquiry = {
    id: string;
    productId: string;
    type: "Quote" | "Preorder" | "Showroom visit";
    name: string;
    phone: string;
    email: string;
    quantity: number;
    message: string;
    status: "New" | "Contacted" | "In progress" | "Resolved";
    createdAt: string;
};