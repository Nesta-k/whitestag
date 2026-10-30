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
  createAdminCategory,
  listAdminCategories,
  updateAdminCategory,
  uploadMedia,
} from "@/lib/api/admin/catalogue";
import type { AdminCategory } from "@/types/admin";

const PRODUCT_TYPES: { value: string; label: string }[] = [
  { value: "spare_part", label: "Spare part" },
  { value: "car", label: "Car" },
  { value: "electric_vehicle", label: "Electric vehicle" },
  { value: "tricycle", label: "Motorized tricycle" },
  { value: "motorcycle_bike", label: "Motorcycle or bike" },
  { value: "other", label: "Other" },
];

function productTypeLabel(value: string): string {
  return PRODUCT_TYPES.find((option) => option.value === value)?.label ?? value;
}

export default function CategoriesPage() {
  const [search, setSearch] = useState("");
  const [productType, setProductType] = useState("");

  const list = useAdminList(
    (page) => listAdminCategories({ search, product_type: productType, page }),
    `${search}|${productType}`,
  );

  const parentOptions = useAdminResource(
    () => listAdminCategories({ page_size: 100 }),
    [],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [formProductType, setFormProductType] = useState("spare_part");
  const [parentId, setParentId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredOrder, setFeaturedOrder] = useState("0");

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setDescription("");
    setFormProductType("spare_part");
    setParentId("");
    setImageUrl("");
    setImageFile(null);
    setIsFeatured(false);
    setFeaturedOrder("0");
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(row: AdminCategory) {
    setEditing(row);
    setName(row.name);
    setSlug(row.slug);
    setDescription(row.description);
    setFormProductType(row.product_type);
    setParentId(String(row.parent?.id ?? ""));
    setImageUrl(row.image_url);
    setImageFile(null);
    setIsFeatured(row.is_featured);
    setFeaturedOrder(String(row.featured_order));
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
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSubmitting(true);
    try {
      let finalImageUrl = imageUrl;
      if (imageFile) {
        const result = await uploadMedia(imageFile, "categories");
        finalImageUrl = result.url;
      }

      const payload = {
        name: name.trim(),
        description,
        product_type: formProductType,
        parent_id: parentId ? Number(parentId) : null,
        image_url: finalImageUrl,
        is_featured: isFeatured,
        featured_order: Number(featuredOrder),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      };
      if (editing) {
        await updateAdminCategory(editing.id, payload);
      } else {
        await createAdminCategory(payload);
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

  const parentChoices = (parentOptions.data?.results ?? []).filter(
    (option) => option.id !== editing?.id,
  );

  const columns: AdminColumn<AdminCategory>[] = [
    {
      key: "image",
      header: "Image",
      render: (row) =>
        row.image_url ? (
          <img
            src={row.image_url}
            alt={row.name}
            className="ws-dash-table-img"
            loading="lazy"
          />
        ) : (
          <div className="ws-dash-table-img-placeholder" />
        ),
    },
    {
      key: "name",
      header: "Name",
      render: (row) => row.name,
    },
    {
      key: "slug",
      header: "Slug",
      render: (row) => <span className="ws-dash-muted">{row.slug}</span>,
    },
    {
      key: "type",
      header: "Type",
      render: (row) => productTypeLabel(row.product_type),
    },
    {
      key: "parent",
      header: "Parent",
      render: (row) => row.parent?.name ?? "—",
    },
    {
      key: "featured",
      header: "Featured",
      render: (row) =>
        row.is_featured ? (
          <StatusBadge label={`#${row.featured_order}`} tone="success" />
        ) : (
          "—"
        ),
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
        title="Categories"
        description="Merchandising taxonomy used across the storefront."
        actions={
          <button
            type="button"
            className="ws-dash-btn is-primary"
            onClick={openCreate}
          >
            New category
          </button>
        }
      />

      <div className="ws-dash-panel">
        <div className="ws-dash-panel-body">
          <div className="ws-dash-toolbar">
            <input
              className="ws-dash-input ws-dash-search"
              type="search"
              placeholder="Search categories…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
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

          <AdminTable<AdminCategory>
            columns={columns}
            rows={list.rows}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            emptyMessage="No categories yet."
            onRetry={list.reload}
          />

          <AdminPagination
            page={list.page}
            totalPages={list.totalPages}
            count={list.count}
            onPageChange={list.setPage}
            noun="categories"
          />
        </div>
      </div>

      <AdminModal
        open={modalOpen}
        wide
        title={editing ? "Edit category" : "New category"}
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
          <Field label="Name">
            <input
              className="ws-dash-input"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Slug">
            <input
              className="ws-dash-input"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
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
          <Field label="Parent category">
            <select
              className="ws-dash-select"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              disabled={parentOptions.loading}
            >
              <option value="">No parent</option>
              {parentChoices.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category image">
            <div className="ws-dash-image-upload">
              {imageUrl || imageFile ? (
                <div className="ws-dash-image-preview">
                  <img
                    src={imageFile ? URL.createObjectURL(imageFile) : imageUrl}
                    alt="Preview"
                  />
                  <button
                    type="button"
                    className="ws-dash-image-remove"
                    onClick={() => {
                      setImageUrl("");
                      setImageFile(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) setImageFile(file);
                  }}
                />
              )}
            </div>
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
              Featured
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
        </div>
        {formError ? <p className="ws-dash-field-error">{formError}</p> : null}
      </AdminModal>
    </>
  );
}
