"use client";

import { useState } from "react";
import { AdminPageHeader, Field, StatusBadge } from "@/components/admin/ui";
import { AdminModal } from "@/components/admin/modal";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList, useAdminResource } from "@/components/admin/hooks";
import { describeAdminError } from "@/lib/api/admin/client";
import {
  createAdminProduct,
  listAdminBrands,
  listAdminCategories,
  listAdminProducts,
  updateAdminProduct,
  uploadMedia,
} from "@/lib/api/admin/catalogue";
import type { AdminProduct, AdminProductImage } from "@/types/admin";

const PRODUCT_TYPES: { value: string; label: string }[] = [
  { value: "spare_part", label: "Spare part" },
  { value: "car", label: "Car" },
  { value: "electric_vehicle", label: "Electric vehicle" },
  { value: "tricycle", label: "Motorized tricycle" },
  { value: "motorcycle_bike", label: "Motorcycle or bike" },
  { value: "other", label: "Other" },
];

const PUBLICATION_STATUSES: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function productTypeLabel(value: string): string {
  return PRODUCT_TYPES.find((option) => option.value === value)?.label ?? value;
}

function publicationStatusLabel(value: string): string {
  return (
    PUBLICATION_STATUSES.find((option) => option.value === value)?.label ?? value
  );
}

function publicationTone(value: string): "neutral" | "success" | "warning" {
  if (value === "published") return "success";
  if (value === "archived") return "warning";
  return "neutral";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [publicationStatus, setPublicationStatus] = useState("");
  const [productType, setProductType] = useState("");

  const list = useAdminList(
    (page) =>
      listAdminProducts({
        search,
        publication_status: publicationStatus,
        product_type: productType,
        page,
      }),
    `${search}|${publicationStatus}|${productType}`,
  );

  const categories = useAdminResource(
    () => listAdminCategories({ page_size: 100 }),
    [],
  );
  const brands = useAdminResource(() => listAdminBrands({ page_size: 100 }), []);

  const categoryOptions = categories.data?.results ?? [];
  const brandOptions = brands.data?.results ?? [];

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [formProductType, setFormProductType] = useState("spare_part");
  const [formSalesMethod, setFormSalesMethod] = useState("direct_purchase");
  const [formPublicationStatus, setFormPublicationStatus] = useState("draft");
  const [price, setPrice] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredOrder, setFeaturedOrder] = useState("0");
  const [productImages, setProductImages] = useState<AdminProductImage[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);

  function openCreate() {
    setEditing(null);
    setSku("");
    setName("");
    setSlug("");
    setDescription("");
    setCategoryId("");
    setBrandId("");
    setFormProductType("spare_part");
    setFormSalesMethod("direct_purchase");
    setFormPublicationStatus("draft");
    setPrice("");
    setWeightKg("");
    setIsFeatured(false);
    setFeaturedOrder("0");
    setProductImages([]);
    setNewImageFiles([]);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(row: AdminProduct) {
    setEditing(row);
    setSku(row.sku);
    setName(row.name);
    setSlug(row.slug);
    setDescription(row.description);
    setCategoryId(String(row.category?.id ?? row.category_id ?? ""));
    setBrandId(row.brand ? String(row.brand.id) : "");
    setFormProductType(row.product_type);
    setFormSalesMethod(row.sales_method);
    setFormPublicationStatus(row.publication_status);
    setPrice(row.price ?? "");
    setWeightKg(row.weight_kg ?? "");
    setIsFeatured(row.is_featured);
    setFeaturedOrder(String(row.featured_order));
    setProductImages(row.images ?? []);
    setNewImageFiles([]);
    setFormError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFormError("");
  }

  async function handleSubmit() {
    setFormError("");
    if (!name.trim() || !sku.trim() || !categoryId) {
      setFormError("SKU, name and category are required.");
      return;
    }
    setSubmitting(true);
    try {
      const uploadedImages: AdminProductImage[] = [];
      for (const file of newImageFiles) {
        const result = await uploadMedia(file, "products");
        uploadedImages.push({
          image_url: result.url,
          alt_text: name.trim(),
          display_order: productImages.length + uploadedImages.length,
          is_primary: productImages.length + uploadedImages.length === 0,
        });
      }

      const payload = {
        sku: sku.trim(),
        name: name.trim(),
        description,
        category_id: Number(categoryId),
        brand_id: brandId ? Number(brandId) : null,
        product_type: formProductType,
        sales_method: formSalesMethod,
        publication_status: formPublicationStatus,
        price: price ? price : null,
        weight_kg: weightKg ? Number(weightKg) : null,
        is_featured: isFeatured,
        featured_order: Number(featuredOrder),
        images: [...productImages, ...uploadedImages],
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      };
      if (editing) {
        await updateAdminProduct(editing.id, payload);
      } else {
        await createAdminProduct(payload);
      }
      setModalOpen(false);
      setEditing(null);
      list.reload();
    } catch (error) {
      setFormError(describeAdminError(error));
    } finally {
      setSubmitting(false);
    }
  }

  const columns: AdminColumn<AdminProduct>[] = [
    {
      key: "image",
      header: "Image",
      render: (row) => {
        const primary =
          row.images.find((img) => img.is_primary) ?? row.images[0];
        return primary ? (
          <img
            src={primary.image_url}
            alt={row.name}
            className="ws-dash-table-img"
            loading="lazy"
          />
        ) : (
          <div className="ws-dash-table-img-placeholder" />
        );
      },
    },
    {
      key: "sku",
      header: "SKU",
      render: (row) => <span className="ws-dash-tag">{row.sku}</span>,
    },
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div>
          <strong>{row.name}</strong>
          <div className="ws-dash-muted">{row.slug}</div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (row) => row.category?.name ?? "—",
    },
    {
      key: "type",
      header: "Type",
      render: (row) => productTypeLabel(row.product_type),
    },
    {
      key: "price",
      header: "Price",
      render: (row) => (row.price ? `GHS ${row.price}` : "—"),
    },
    {
      key: "sales",
      header: "Sales",
      render: (row) => (
        <StatusBadge
          label={row.sales_method === "direct_purchase" ? "Direct" : "Quotation"}
          tone={row.sales_method === "direct_purchase" ? "success" : "info"}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          label={publicationStatusLabel(row.publication_status)}
          tone={publicationTone(row.publication_status)}
        />
      ),
    },
    {
      key: "featured",
      header: "Featured",
      render: (row) =>
        row.is_featured ? <span className="ws-dash-tag">Featured</span> : "—",
    },
    {
      key: "updated",
      header: "Updated",
      render: (row) => formatDate(row.updated_at),
    },
    {
      key: "actions",
      header: "Edit",
      align: "right",
      render: (row) => (
        <button
          type="button"
          className="ws-dash-btn is-small"
          onClick={() => openEdit(row)}
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Products"
        description="Catalogue items, pricing and publication status."
        actions={
          <button
            type="button"
            className="ws-dash-btn is-primary"
            onClick={openCreate}
          >
            New product
          </button>
        }
      />

      <div className="ws-dash-panel">
        <div className="ws-dash-panel-body">
          <div className="ws-dash-toolbar">
            <input
              className="ws-dash-input ws-dash-search"
              type="search"
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              className="ws-dash-select"
              value={publicationStatus}
              onChange={(event) => setPublicationStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {PUBLICATION_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="ws-dash-select"
              value={productType}
              onChange={(event) => setProductType(event.target.value)}
            >
              <option value="">All types</option>
              {PRODUCT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="ws-dash-toolbar-spacer" />
            <button type="button" className="ws-dash-btn" onClick={list.reload}>
              Refresh
            </button>
          </div>

          <AdminTable<AdminProduct>
            columns={columns}
            rows={list.rows}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            emptyMessage="No products yet."
            onRetry={list.reload}
          />

          <AdminPagination
            page={list.page}
            totalPages={list.totalPages}
            count={list.count}
            onPageChange={list.setPage}
            noun="products"
          />
        </div>
      </div>

      <AdminModal
        open={modalOpen}
        wide
        title={editing ? "Edit product" : "New product"}
        onClose={closeModal}
        footer={
          <>
            <button
              type="button"
              className="ws-dash-btn is-ghost"
              onClick={closeModal}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ws-dash-btn is-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="ws-dash-form-grid">
          <Field label="SKU">
            <input
              className="ws-dash-input"
              type="text"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
          </Field>
          <Field label="Name">
            <input
              className="ws-dash-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="Slug"
            hint="Leave blank to auto-generate on the server if supported."
          >
            <input
              className="ws-dash-input"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </Field>
          <Field label="Category">
            <select
              className="ws-dash-select"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={categories.loading}
            >
              <option value="">Select a category…</option>
              {categoryOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Brand">
            <select
              className="ws-dash-select"
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
            >
              <option value="">No brand</option>
              {brandOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product type">
            <select
              className="ws-dash-select"
              value={formProductType}
              onChange={(event) => setFormProductType(event.target.value)}
            >
              {PRODUCT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sales method">
            <select
              className="ws-dash-select"
              value={formSalesMethod}
              onChange={(event) => setFormSalesMethod(event.target.value)}
            >
              <option value="direct_purchase">Direct purchase</option>
              <option value="quotation">Quotation</option>
            </select>
          </Field>
          <Field label="Publication status">
            <select
              className="ws-dash-select"
              value={formPublicationStatus}
              onChange={(event) => setFormPublicationStatus(event.target.value)}
            >
              {PUBLICATION_STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Price (GHS)"
            hint="Required for published direct-purchase products."
          >
            <input
              className="ws-dash-input"
              type="number"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </Field>
          <Field label="Weight (kg)">
            <input
              className="ws-dash-input"
              type="number"
              step="0.01"
              value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
            />
          </Field>
          <Field label="Featured order">
            <input
              className="ws-dash-input"
              type="number"
              step="1"
              value={featuredOrder}
              onChange={(event) => setFeaturedOrder(event.target.value)}
            />
          </Field>
          <div className="is-span-2">
            <label className="ws-dash-checkbox">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
              />
              Featured on homepage
            </label>
          </div>
          <div className="is-span-2">
            <Field label="Description">
              <textarea
                className="ws-dash-textarea"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </div>
          <div className="is-span-2">
            <Field label="Product images">
              <div className="ws-dash-product-images">
                {productImages.map((img, index) => (
                  <div key={index} className="ws-dash-image-preview">
                    <img src={img.image_url} alt={img.alt_text} />
                    <button
                      type="button"
                      className="ws-dash-image-remove"
                      onClick={() =>
                        setProductImages(
                          productImages.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                    {img.is_primary ? (
                      <span className="ws-dash-badge is-success">Primary</span>
                    ) : (
                      <button
                        type="button"
                        className="ws-dash-btn is-small"
                        onClick={() =>
                          setProductImages(
                            productImages.map((item, i) => ({
                              ...item,
                              is_primary: i === index,
                            })),
                          )
                        }
                      >
                        Set primary
                      </button>
                    )}
                  </div>
                ))}
                {newImageFiles.map((file, index) => (
                  <div key={`new-${index}`} className="ws-dash-image-preview">
                    <img src={URL.createObjectURL(file)} alt="New upload" />
                    <button
                      type="button"
                      className="ws-dash-image-remove"
                      onClick={() =>
                        setNewImageFiles(
                          newImageFiles.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Remove
                    </button>
                    <span className="ws-dash-badge is-info">New</span>
                  </div>
                ))}
                {productImages.length + newImageFiles.length < 5 && (
                  <div className="ws-dash-image-add">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => {
                        const files = Array.from(event.target.files ?? []);
                        setNewImageFiles([...newImageFiles, ...files]);
                      }}
                    />
                    <span>Add images (Max 5)</span>
                  </div>
                )}
              </div>
            </Field>
          </div>
        </div>
        {formError ? <p className="ws-dash-field-error">{formError}</p> : null}
      </AdminModal>
    </>
  );
}
