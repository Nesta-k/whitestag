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
import { useStaffAuth } from "@/store/staff-auth-context";
import {
  createStaffUser,
  listStaffUsers,
  updateStaffUser,
} from "@/lib/api/admin/customers";
import type { StaffUser } from "@/types/admin";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

function roleName(value: string): string {
  switch (value) {
    case "superadmin":
      return "Superadmin";
    case "admin":
      return "Admin";
    case "staff":
      return "Staff";
    case "customer":
      return "Customer";
    default:
      return value || "Unknown";
  }
}

function roleTone(value: string): BadgeTone {
  switch (value) {
    case "superadmin":
      return "danger";
    case "admin":
      return "info";
    case "staff":
      return "success";
    default:
      return "neutral";
  }
}

export default function UsersPage() {
  const { role, staff } = useStaffAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const list = useAdminList(
    (page) => listStaffUsers({ search, role: roleFilter, page }),
    `${search}|${roleFilter}`,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [accountRole, setAccountRole] = useState("staff");
  const [isActive, setIsActive] = useState(true);
  const [password, setPassword] = useState("");

  const roleOptions: { value: string; label: string }[] = [
    { value: "customer", label: "Customer" },
    { value: "staff", label: "Staff" },
    { value: "admin", label: "Admin" },
  ];
  if (role === "superadmin") {
    roleOptions.push({ value: "superadmin", label: "Superadmin" });
  }

  function cannotManage(row: StaffUser): boolean {
    if (role === "superadmin") return false;
    if (row.role === "superadmin") return true;
    if (row.role === "admin" && row.email !== staff?.email) return true;
    return false;
  }

  function openCreate() {
    setEditing(null);
    setUsername("");
    setEmail("");
    setFirstName("");
    setLastName("");
    setAccountRole("staff");
    setIsActive(true);
    setPassword("");
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(row: StaffUser) {
    setEditing(row);
    setUsername(row.username);
    setEmail(row.email);
    setFirstName(row.first_name);
    setLastName(row.last_name);
    setAccountRole(row.role);
    setIsActive(row.is_active);
    setPassword("");
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
    if (!username.trim() || !email.trim()) {
      setFormError("Username and email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        username: username.trim(),
        email: email.trim(),
        first_name: firstName,
        last_name: lastName,
        role: accountRole,
        is_active: isActive,
        ...(password ? { password } : {}),
      };
      if (editing) {
        await updateStaffUser(editing.id, payload);
      } else {
        await createStaffUser(payload);
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

  const columns: AdminColumn<StaffUser>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) =>
        [row.first_name, row.last_name].filter(Boolean).join(" ") || "—",
    },
    {
      key: "email",
      header: "Email",
      render: (row) => row.email,
    },
    {
      key: "username",
      header: "Username",
      render: (row) => <span className="ws-dash-muted">{row.username}</span>,
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <StatusBadge label={roleName(row.role)} tone={roleTone(row.role)} />
      ),
    },
    {
      key: "active",
      header: "Active",
      render: (row) => (
        <StatusBadge
          label={row.is_active ? "Active" : "Disabled"}
          tone={row.is_active ? "success" : "neutral"}
        />
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (row) => formatDate(row.date_joined),
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
          disabled={cannotManage(row)}
          title={
            cannotManage(row)
              ? "Only a Superadmin can manage this account."
              : undefined
          }
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Staff & users"
        description="Every account on the platform and the role that governs its access."
        actions={
          <button
            type="button"
            className="ws-dash-btn is-primary"
            onClick={openCreate}
          >
            New account
          </button>
        }
      />

      <div className="ws-dash-toolbar">
        <input
          className="ws-dash-input ws-dash-search"
          type="search"
          placeholder="Search by name, email or username…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="ws-dash-select"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="">All roles</option>
          <option value="customer">Customer</option>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <div className="ws-dash-toolbar-spacer" />
        <button type="button" className="ws-dash-btn" onClick={list.reload}>
          Refresh
        </button>
      </div>

      <AdminTable<StaffUser>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        emptyMessage="No accounts found."
        onRetry={list.reload}
      />

      <AdminPagination
        page={list.page}
        totalPages={list.totalPages}
        count={list.count}
        onPageChange={list.setPage}
        noun="accounts"
      />

      <AdminModal
        open={modalOpen}
        wide
        title={editing ? "Edit account" : "New account"}
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
          <Field label="Username">
            <input
              className="ws-dash-input"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              className="ws-dash-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="First name">
            <input
              className="ws-dash-input"
              type="text"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </Field>
          <Field label="Last name">
            <input
              className="ws-dash-input"
              type="text"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </Field>
          <Field label="Role">
            <select
              className="ws-dash-select"
              value={accountRole}
              onChange={(event) => setAccountRole(event.target.value)}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            <Field
              label="Password"
              hint={
                editing
                  ? "Leave blank to keep the current password."
                  : "Minimum 8 characters."
              }
            >
              <input
                className="ws-dash-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          </div>
        </div>
        {formError ? <p className="ws-dash-field-error">{formError}</p> : null}
        <p className="ws-dash-note">
          Admins can create and edit Staff and Customer accounts. Only a
          Superadmin can manage Admin and Superadmin accounts.
        </p>
      </AdminModal>
    </>
  );
}
