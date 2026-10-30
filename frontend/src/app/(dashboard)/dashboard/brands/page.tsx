"use client";

import { useState } from "react";
import { AdminPageHeader, Field } from "@/components/admin/ui";
import { AdminModal } from "@/components/admin/modal";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList } from "@/components/admin/hooks";
import { describeAdminError } from "@/lib/api/admin/client";
import {
  createAdminBrand,
  listAdminBrands,
  updateAdminBrand,
  uploadMedia,
} from "@/lib/api/admin/catalogue";
import type { Brand } from "@/types/api";

function truncate(value: string, max = 80): string {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default function BrandsPage() {
  const [search, setSearch] = useState("");
  const list = useAdminList((page) => listAdminBrands({ search, page }), search);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setLogoUrl("");
    setLogoFile(null);
    setDescription("");
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(row: Brand) {
    setEditing(row);
    setName(row.name);
    setSlug(row.slug ?? "");
    setLogoUrl(row.logo_url ?? "");
    setLogoFile(null);
    setDescription(row.description ?? "");
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
      let finalLogoUrl = logoUrl;
      if (logoFile) {
        const result = await uploadMedia(logoFile, "brands");
        finalLogoUrl = result.url;
      }

      const payload = {
        name: name.trim(),
        logo_url: finalLogoUrl,
        description,
        ...(slug.trim() ? { slug: slug.trim() } : {}),
      };
      if (editing) {
        await updateAdminBrand(editing.id, payload);
      } else {
        await createAdminBrand(payload);
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

  const columns: AdminColumn<Brand>[] = [
    {
      key: "logo",
      header: "Logo",
      render: (row) =>
        row.logo_url ? (
          <img
            src={row.logo_url}
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
      render: (row) => <span className="ws-dash-muted">{row.slug || "—"}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (row) => truncate(row.description),
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
        title="Brands"
        description="Vehicle and parts manufacturers used across the catalogue."
        actions={
          <button
            type="button"
            className="ws-dash-btn is-primary"
            onClick={openCreate}
          >
            New brand
          </button>
        }
      />

      <div className="ws-dash-panel">
        <div className="ws-dash-panel-body">
          <div className="ws-dash-toolbar">
            <input
              className="ws-dash-input ws-dash-search"
              type="search"
              placeholder="Search brands…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="ws-dash-toolbar-spacer" />
            <button type="button" className="ws-dash-btn" onClick={list.reload}>
              Refresh
            </button>
          </div>

          <AdminTable<Brand>
            columns={columns}
            rows={list.rows}
            rowKey={(row) => row.id}
            loading={list.loading}
            error={list.error}
            emptyMessage="No brands yet."
            onRetry={list.reload}
          />

          <AdminPagination
            page={list.page}
            totalPages={list.totalPages}
            count={list.count}
            onPageChange={list.setPage}
            noun="brands"
          />
        </div>
      </div>

      <AdminModal
        open={modalOpen}
        title={editing ? "Edit brand" : "New brand"}
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
          <Field label="Slug" hint="Leave blank to generate one automatically.">
            <input
              className="ws-dash-input"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
            />
          </Field>
          <Field label="Brand logo">
            <div className="ws-dash-image-upload">
              {logoUrl || logoFile ? (
                <div className="ws-dash-image-preview">
                  <img
                    src={logoFile ? URL.createObjectURL(logoFile) : logoUrl}
                    alt="Preview"
                  />
                  <button
                    type="button"
                    className="ws-dash-image-remove"
                    onClick={() => {
                      setLogoUrl("");
                      setLogoFile(null);
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
                    if (file) setLogoFile(file);
                  }}
                />
              )}
            </div>
          </Field>
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
