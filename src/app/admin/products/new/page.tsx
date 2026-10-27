import { ProductForm } from "@/components/product-form";

export default function NewProductPage() {
  return <div className="admin-page"><div className="admin-page-head"><div><div className="eyebrow">Inventory management</div><h1>Add product.</h1><p>Create a new listing in the local demo catalogue.</p></div></div><ProductForm /></div>;
}