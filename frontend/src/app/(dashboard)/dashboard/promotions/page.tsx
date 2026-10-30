"use client";

import { useState } from "react";
import { AdminPageHeader, Field, StatusBadge } from "@/components/admin/ui";
import { AdminModal } from "@/components/admin/modal";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList } from "@/components/admin/hooks";
import { describeAdminError } from "@/lib/api/admin/client";
import {
  createAdminPromotion,
  listAdminPromotions,
  updateAdminPromotion,
  uploadMedia,
} from "@/lib/api/admin/catalogue";
import type { AdminPromotion } from "@/types/admin";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function toInputValue(value?: string | null): string {
  return value ? value.slice(0, 16) : "";
}

export default function PromotionsPage() {
  const [search, setSearch] = useState("");
  const list = useAdminList(
    (page) => listAdminPromotions({ search, page }),
    search,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPromotion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [displayOrder, setDisplayOrder] = useState("0");

  function openCreate() {
    setEditing(null);
    setTitle("");
    setSlug("");
    setDescription("");
    setImageUrl("");
    setImageFile(null);
    setImageAlt("");
    setCtaLabel("");
    setCtaHref("");
    setStartsAt("");
    setEndsAt("");
    setIsActive(true);
    setDisplayOrder("0");
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(row: AdminPromotion) {
    setEditing(row);
    setTitle(row.title);
    setSlug(row.slug ?? "");
    setDescription(row.description ?? "");
    setImageUrl(row.image_url ?? "");
    setImageFile(null);
    setImageAlt(row.image_alt ?? "");
    setCtaLabel(row.cta_label ?? "");
    setCtaHref(row.cta_href ?? "");
    setStartsAt(toInputValue(row.starts_at));
    setEndsAt(toInputValue(row.ends_at));
    setIsActive(row.is_active);
    setDisplayOrder(String(row.display_order ?? 0));
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
    if (!title.trim()) {
      setFormError("Title is required.");
      return;
    }
    setSubmitting(true);
    try {
      let finalImageUrl = imageUrl;
      if (imageFile) {
        const result = await uploadMedia(imageFile, "promotions");
        finalImageUrl = result.url;
      }

      const payload = {
        title: title.trim(),
        description,
        image_url: finalImageUrl,
        image_alt: imageAlt,
        cta_label: ctaLabel,
        cta_href: ctaHref,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        is_active: isActive,
        display_order: Number(displayOrder),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      };
      if (editing) {
        await updateAdminPromotion(editing.id, payload);
      } else {
        await createAdminPromotion(payload);
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

  const columns: AdminColumn<AdminPromotion>[] = [
    {
      key: "image",
      header: "Image",
      render: (row) =>
        row.image_url ? (
          <img
            src={row.image_url}
            alt={row.title}
            className="ws-dash-table-img"
            loading="lazy"
          />
        ) : (
          <div className="ws-dash-table-img-placeholder" />
        ),
    },
    {
      key: "title",
      header: "Title",
      render: (row) => (
        <div>
          <div>{row.title}</div>
          <div className="ws-dash-muted">{row.slug || "—"}</div>
        </div>
      ),
    },
    {
      key: "cta",
      header: "CTA",
      render: (row) => row.cta_label || "—",
    },
    {
      key: "link",
      header: "Link",
      render: (row) =>
        row.cta_href ? (
          <a
            className="ws-dash-link"
            href={row.cta_href}
            target="_blank"
            rel="noreferrer"
          >
            {row.cta_href}
          </a>
        ) : (
          "—"
        ),
    },
    {
      key: "window",
      header: "Window",
      render: (row) => `${formatDate(row.starts_at)} → ${formatDate(row.ends_at)}`,
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <StatusBadge
          label={row.is_active ? "Active" : "Inactive"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "order",
      header: "Order",
      align: "right",
      render: (row) => row.display_order,
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
        title="Promotions"
        description="Storefront banner campaigns. Inactive or expired promotions are hidden from shoppers."
        actions={
          <button
            type="button"
            className="ws-dash-btn is-primary"
            onClick={openCreate}
          >
            New promotion
          </button>
        }
      />

      <div className="ws-dash-panel">
        <div className="ws-dash-panel-body">
          <div className="ws-dash-toolbar">
            <input
              className="ws-dash-input ws-dash-search"
              type="search"
              placeholder="Search promotions…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="ws-dash-toolbar-spacer" />
            <button type="button" className="ws-dash-btn" onClick={list.reload}>
              Refresh
            </button>
          </div>

          <AdminTable<AdminPromotion>
            columns={columns}
            rows={list.rows}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            emptyMessage="No promotions yet."
            onRetry={list.reload}
          />

          <AdminPagination
            page={list.page}
            totalPages={list.totalPages}
            count={list.count}
            onPageChange={list.setPage}
            noun="promotions"
          />
        </div>
      </div>

      <AdminModal
        open={modalOpen}
        wide
        title={editing ? "Edit promotion" : "New promotion"}
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
          <Field label="Title">
            <input
              className="ws-dash-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Slug" hint="Leave blank to generate one automatically.">
            <input
              className="ws-dash-input"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </Field>
          <Field label="CTA label">
            <input
              className="ws-dash-input"
              type="text"
              value={ctaLabel}
              onChange={(event) => setCtaLabel(event.target.value)}
            />
          </Field>
          <Field label="Link / destination URL">
            <input
              className="ws-dash-input"
              type="text"
              value={ctaHref}
              onChange={(event) => setCtaHref(event.target.value)}
            />
          </Field>
          <Field label="Banner image">
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
          <Field label="Image alt text">
            <input
              className="ws-dash-input"
              type="text"
              value={imageAlt}
              onChange={(event) => setImageAlt(event.target.value)}
            />
          </Field>
          <Field label="Starts at">
            <input
              className="ws-dash-input"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Ends at">
            <input
              className="ws-dash-input"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
          <Field label="Display order">
            <input
              className="ws-dash-input"
              type="number"
              step="1"
              value={displayOrder}
              onChange={(event) => setDisplayOrder(event.target.value)}
            />
          </Field>
          <div className="is-span-2">
            <label className="ws-dash-checkbox">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              Active
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
