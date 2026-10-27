"use client";

import { useApp } from "@/components/app-provider";
import { formatPrice } from "@/lib/format";
import type { DemoOrder } from "@/lib/types";

const statuses: DemoOrder["status"][] = ["Pending", "Confirmed", "Ready for collection", "Completed", "Cancelled"];

export default function AdminOrdersPage() {
  const { orders, products, updateOrderStatus } = useApp();
  return (
    <div className="admin-page">
      <div className="admin-page-head"><div><div className="eyebrow">Order desk</div><h1>Demo orders.</h1><p>Orders created by the simulated checkout in this browser.</p></div><span className="admin-count-chip">{orders.length} total</span></div>
      {!orders.length ? <div className="admin-panel admin-empty large"><h2>No demo orders yet.</h2><p>Buy Now checkout submissions will be listed here.</p></div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment selection</th><th>Date</th><th>Status</th></tr></thead><tbody>
        {orders.map((order) => <tr key={order.id}><td><strong className="order-id">{order.id}</strong></td><td><div className="table-customer"><strong>{order.customerName}</strong><span>{order.email}</span><span>{order.phone}</span></div></td><td>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items<div className="table-subtext">{order.items.map((item) => products.find((product) => product.id === item.productId)?.name || "Removed item").join(", ")}</div></td><td>{formatPrice(order.total)}</td><td><span className="simulation-tag">{order.paymentMethod}</span></td><td>{new Date(order.createdAt).toLocaleDateString()}</td><td><select aria-label={`Update ${order.id} status`} className="status-select" value={order.status} onChange={(event) => updateOrderStatus(order.id, event.target.value as DemoOrder["status"])}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}
      </tbody></table></div>}
      <div className="admin-footnote">All orders are local demo records. No payment or fulfilment process is connected.</div>
    </div>
  );
}