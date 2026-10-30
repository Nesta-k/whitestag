"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader, Field } from "@/components/admin/ui";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
} from "@/components/admin/states";
import { useAdminResource } from "@/components/admin/hooks";
import { describeAdminError } from "@/lib/api/admin/client";
import {
  getAdminHomepageSettings,
  updateAdminHomepageSettings,
  uploadMedia,
} from "@/lib/api/admin/catalogue";
import type { AdminHomepageSettings } from "@/types/admin";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function humanizeSection(key: string): string {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function HomepagePage() {
  const resource = useAdminResource(() => getAdminHomepageSettings());
  const [form, setForm] = useState<AdminHomepageSettings | null>(null);
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (resource.data) setForm(resource.data);
  }, [resource.data]);

  function setField<K extends keyof AdminHomepageSettings>(
    key: K,
    value: AdminHomepageSettings[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      let finalHeroImageUrl = form.hero_image_url;
      if (heroImageFile) {
        const result = await uploadMedia(heroImageFile, "homepage");
        finalHeroImageUrl = result.url;
      }

      const payload: Partial<AdminHomepageSettings> = {
        ...form,
        hero_image_url: finalHeroImageUrl,
      };
      delete payload.updated_at;
      const result = await updateAdminHomepageSettings(payload);
      setForm(result);
      setHeroImageFile(null);
      setSaved(true);
    } catch (error) {
      setSaveError(describeAdminError(error));
    } finally {
      setSaving(false);
    }
  }

  function moveSection(index: number, direction: -1 | 1) {
    if (!form) return;
    const target = index + direction;
    if (target < 0 || target >= form.section_order.length) return;
    const next = [...form.section_order];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setField("section_order", next);
  }

  if (resource.loading) return <AdminLoading />;
  if (resource.error) {
    return <AdminError message={resource.error} onRetry={resource.reload} />;
  }
  if (!form) return <AdminEmpty message="Homepage settings are unavailable." />;

  return (
    <>
      <AdminPageHeader
        title="Homepage CMS"
        description="Every headline, image and section on the storefront homepage. Changes appear immediately."
        actions={
          <button
            type="button"
            className="ws-dash-btn is-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        }
      />

      {saveError ? <p className="ws-dash-field-error">{saveError}</p> : null}
      {saved ? (
        <p className="ws-dash-note">
          Saved. The storefront will show the new content on its next load.
        </p>
      ) : null}

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Hero</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_hero}
              onChange={(event) => setField("show_hero", event.target.checked)}
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Kicker">
              <input
                className="ws-dash-input"
                type="text"
                value={form.hero_kicker}
                onChange={(event) =>
                  setField("hero_kicker", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.hero_heading}
                onChange={(event) =>
                  setField("hero_heading", event.target.value)
                }
              />
            </Field>
            <div className="is-span-2">
              <Field label="Subtitle">
                <input
                  className="ws-dash-input"
                  type="text"
                  value={form.hero_subtitle}
                  onChange={(event) =>
                    setField("hero_subtitle", event.target.value)
                  }
                />
              </Field>
            </div>
            <div className="is-span-2">
              <Field label="Description">
                <textarea
                  className="ws-dash-textarea"
                  value={form.hero_description}
                  onChange={(event) =>
                    setField("hero_description", event.target.value)
                  }
                />
              </Field>
            </div>
            <Field label="Hero banner image">
              <div className="ws-dash-image-upload">
                {form.hero_image_url || heroImageFile ? (
                  <div className="ws-dash-image-preview">
                    <img
                      src={
                        heroImageFile
                          ? URL.createObjectURL(heroImageFile)
                          : form.hero_image_url
                      }
                      alt="Preview"
                    />
                    <button
                      type="button"
                      className="ws-dash-image-remove"
                      onClick={() => {
                        setField("hero_image_url", "");
                        setHeroImageFile(null);
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
                      if (file) setHeroImageFile(file);
                    }}
                  />
                )}
              </div>
            </Field>
            <Field label="Image alt text">
              <input
                className="ws-dash-input"
                type="text"
                value={form.hero_image_alt}
                onChange={(event) =>
                  setField("hero_image_alt", event.target.value)
                }
              />
            </Field>
            <Field label="Primary CTA label">
              <input
                className="ws-dash-input"
                type="text"
                value={form.hero_primary_cta_label}
                onChange={(event) =>
                  setField("hero_primary_cta_label", event.target.value)
                }
              />
            </Field>
            <Field label="Primary CTA link">
              <input
                className="ws-dash-input"
                type="text"
                value={form.hero_primary_cta_href}
                onChange={(event) =>
                  setField("hero_primary_cta_href", event.target.value)
                }
              />
            </Field>
            <Field label="Secondary CTA label">
              <input
                className="ws-dash-input"
                type="text"
                value={form.hero_secondary_cta_label}
                onChange={(event) =>
                  setField("hero_secondary_cta_label", event.target.value)
                }
              />
            </Field>
            <Field label="Secondary CTA link">
              <input
                className="ws-dash-input"
                type="text"
                value={form.hero_secondary_cta_href}
                onChange={(event) =>
                  setField("hero_secondary_cta_href", event.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Categories</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_categories}
              onChange={(event) =>
                setField("show_categories", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.categories_eyebrow}
                onChange={(event) =>
                  setField("categories_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.categories_heading}
                onChange={(event) =>
                  setField("categories_heading", event.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Promotions</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_promotions}
              onChange={(event) =>
                setField("show_promotions", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.promotions_eyebrow}
                onChange={(event) =>
                  setField("promotions_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.promotions_heading}
                onChange={(event) =>
                  setField("promotions_heading", event.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Featured products</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_featured_products}
              onChange={(event) =>
                setField("show_featured_products", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.featured_products_eyebrow}
                onChange={(event) =>
                  setField("featured_products_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.featured_products_heading}
                onChange={(event) =>
                  setField("featured_products_heading", event.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Brands</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_brands}
              onChange={(event) =>
                setField("show_brands", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.brands_eyebrow}
                onChange={(event) =>
                  setField("brands_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.brands_heading}
                onChange={(event) =>
                  setField("brands_heading", event.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Preorders</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_preorders}
              onChange={(event) =>
                setField("show_preorders", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.preorders_eyebrow}
                onChange={(event) =>
                  setField("preorders_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.preorders_heading}
                onChange={(event) =>
                  setField("preorders_heading", event.target.value)
                }
              />
            </Field>
            <div className="is-span-2">
              <Field label="Body">
                <textarea
                  className="ws-dash-textarea"
                  value={form.preorders_body}
                  onChange={(event) =>
                    setField("preorders_body", event.target.value)
                  }
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Vehicles</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_vehicles}
              onChange={(event) =>
                setField("show_vehicles", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.vehicles_eyebrow}
                onChange={(event) =>
                  setField("vehicles_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.vehicles_heading}
                onChange={(event) =>
                  setField("vehicles_heading", event.target.value)
                }
              />
            </Field>
            <div className="is-span-2">
              <Field label="Body">
                <textarea
                  className="ws-dash-textarea"
                  value={form.vehicles_body}
                  onChange={(event) =>
                    setField("vehicles_body", event.target.value)
                  }
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>How it works</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_how_it_works}
              onChange={(event) =>
                setField("show_how_it_works", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.how_it_works_eyebrow}
                onChange={(event) =>
                  setField("how_it_works_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.how_it_works_heading}
                onChange={(event) =>
                  setField("how_it_works_heading", event.target.value)
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Support</h2>
          <label className="ws-dash-checkbox">
            <input
              type="checkbox"
              checked={form.show_support}
              onChange={(event) =>
                setField("show_support", event.target.checked)
              }
            />
            Visible
          </label>
        </header>
        <div className="ws-dash-section-body">
          <div className="ws-dash-form-grid">
            <Field label="Eyebrow">
              <input
                className="ws-dash-input"
                type="text"
                value={form.support_eyebrow}
                onChange={(event) =>
                  setField("support_eyebrow", event.target.value)
                }
              />
            </Field>
            <Field label="Heading">
              <input
                className="ws-dash-input"
                type="text"
                value={form.support_heading}
                onChange={(event) =>
                  setField("support_heading", event.target.value)
                }
              />
            </Field>
            <div className="is-span-2">
              <Field label="Body">
                <textarea
                  className="ws-dash-textarea"
                  value={form.support_body}
                  onChange={(event) =>
                    setField("support_body", event.target.value)
                  }
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className="ws-dash-section">
        <header className="ws-dash-section-head">
          <h2>Section order</h2>
        </header>
        <div className="ws-dash-section-body">
          {form.section_order.length === 0 ? (
            <AdminEmpty message="No sections configured." />
          ) : (
            <ul className="ws-dash-list">
              {form.section_order.map((key, index) => (
                <li className="ws-dash-list-item" key={key}>
                  <span>{humanizeSection(key)}</span>
                  <div className="ws-dash-row-actions">
                    <button
                      type="button"
                      className="ws-dash-btn is-small"
                      onClick={() => moveSection(index, -1)}
                      disabled={index === 0}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="ws-dash-btn is-small"
                      onClick={() => moveSection(index, 1)}
                      disabled={index === form.section_order.length - 1}
                    >
                      Move down
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="ws-dash-form-actions">
        <span className="ws-dash-muted">
          Last updated: {formatDate(form.updated_at)}
        </span>
        <button
          type="button"
          className="ws-dash-btn is-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );
}
