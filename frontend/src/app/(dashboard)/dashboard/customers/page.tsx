"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/ui";
import {
  AdminTable,
  AdminPagination,
  type AdminColumn,
} from "@/components/admin/table";
import { useAdminList } from "@/components/admin/hooks";
import { listStaffCustomers } from "@/lib/api/admin/customers";
import type { StaffCustomer } from "@/types/admin";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const list = useAdminList(
    (page) => listStaffCustomers({ search, page }),
    search,
  );

  const columns: AdminColumn<StaffCustomer>[] = [
    {
      key: "email",
      header: "Email",
      render: (row) => row.email,
    },
    {
      key: "id",
      header: "Customer ID",
      align: "right",
      render: (row) => row.id,
    },
    {
      key: "joined",
      header: "Joined",
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Customers"
        description="Registered storefront accounts that can place orders."
      />

      <div className="ws-dash-toolbar">
        <input
          className="ws-dash-input ws-dash-search"
          type="search"
          placeholder="Search by email…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="ws-dash-toolbar-spacer" />
        <button type="button" className="ws-dash-btn" onClick={list.reload}>
          Refresh
        </button>
      </div>

      <AdminTable<StaffCustomer>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        error={list.error}
        emptyMessage="No customers yet."
        onRetry={list.reload}
      />

      <AdminPagination
        page={list.page}
        totalPages={list.totalPages}
        count={list.count}
        onPageChange={list.setPage}
        noun="customers"
      />
    </>
  );
}
