"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/app-provider";
import type { Enquiry } from "@/lib/types";

const statuses: Enquiry["status"][] = ["New", "Contacted", "In progress", "Resolved"];

export default function AdminEnquiriesPage() {
  const { enquiries, products, updateEnquiryStatus } = useApp();
  const [type, setType] = useState("All requests");
  const requestTypes = [{ label: "All requests", value: "All requests" }, { label: "Quote", value: "Quote" }, { label: "Preorder", value: "Preorder" }, { label: "Showroom visits", value: "Showroom visit" }];
  const results = useMemo(() => enquiries.filter((enquiry) => type === "All requests" || enquiry.type === type), [enquiries, type]);
  return (
    <div className="admin-page">
      <div className="admin-page-head"><div><div className="eyebrow">Customer requests</div><h1>Enquiries.</h1><p>Manage quote requests and preorder interest captured by the public prototype.</p></div><span className="admin-count-chip">{enquiries.length} total</span></div>
      <div className="inventory-tools"><div className="request-tabs" role="group" aria-label="Filter enquiries">{requestTypes.map((option) => <button type="button" className={type === option.value ? "active" : ""} key={option.value} onClick={() => setType(option.value)}>{option.label}</button>)}</div><span>{results.length} requests</span></div>
      {!results.length ? <div className="admin-panel admin-empty large"><h2>No requests yet.</h2><p>Quote, preorder, and showroom visit requests will appear here.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Request</th><th>Product / visit</th><th>Customer</th><th>Quantity</th><th>Message</th><th>Received</th><th>Status</th></tr></thead><tbody>
        {results.map((enquiry) => { const product = products.find((item) => item.id === enquiry.productId); const isVisit = enquiry.type === "Showroom visit"; return <tr key={enquiry.id}><td><strong className="order-id">{enquiry.id}</strong><span className={`request-type ${enquiry.type === "Preorder" ? "preorder-type" : ""}`}>{enquiry.type}</span></td><td><strong>{isVisit ? "WhiteStag showroom" : product?.name || "Removed product"}</strong><span className="table-subtext">{isVisit ? "Appointment request" : product?.brand || ""}</span></td><td><div className="table-customer"><strong>{enquiry.name}</strong><span>{enquiry.email}</span><span>{enquiry.phone}</span></div></td><td>{isVisit ? "Visit" : enquiry.quantity}</td><td className="message-cell">{enquiry.message || <span className="table-subtext">No message provided</span>}</td><td>{new Date(enquiry.createdAt).toLocaleDateString()}</td><td><select aria-label={`Update ${enquiry.id} status`} className="status-select" value={enquiry.status} onChange={(event) => updateEnquiryStatus(enquiry.id, event.target.value as Enquiry["status"])}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td></tr>; })}
      </tbody></table></div>}
      <div className="admin-footnote">Enquiries are stored only in this browser. The prototype does not send email or notifications.</div>
    </div>
  );
}