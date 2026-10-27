"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Boxes, CarFront, ClipboardList, FileText, Plus } from "lucide-react";
import { useApp } from "@/components/app-provider";
import { formatPrice } from "@/lib/format";

export default function AdminOverviewPage() {
  const { products, orders, enquiries } = useApp();
  const published = products.filter((product) => product.published).length;
  const pending = enquiries.filter((enquiry) => enquiry.status === "New").length;
  const stats = [
    { label: "Total products", value: products.length, note: "Across all categories", icon: Boxes, href: "/admin/products" },
    { label: "Published", value: published, note: `${products.length - published} drafts hidden`, icon: CarFront, href: "/admin/products" },
    { label: "Demo orders", value: orders.length, note: "Local prototype records", icon: ClipboardList, href: "/admin/orders" },
    { label: "Pending enquiries", value: pending, note: "Awaiting a status update", icon: FileText, href: "/admin/enquiries" },
  ];
  const activity = [
    ...orders.map((order) => ({ id: order.id, title: `Demo order ${order.id}`, detail: `${order.customerName} · ${formatPrice(order.total)}`, date: order.createdAt, tag: order.status })),
    ...enquiries.map((enquiry) => ({ id: enquiry.id, title: `${enquiry.type} enquiry`, detail: `${enquiry.name} · ${enquiry.email}`, date: enquiry.createdAt, tag: enquiry.status })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return (
    <div className="admin-page">
      <div className="admin-page-head"><div><div className="eyebrow">At a glance</div><h1>Good morning.</h1><p>Here’s the current shape of your demo storefront.</p></div><Link href="/admin/products/new" className="button-primary"><Plus size={16} /> Add product</Link></div>
      <div className="admin-stat-grid">{stats.map(({ label, value, note, icon: Icon, href }) => <Link className="admin-stat" href={href} key={label}><div className="admin-stat-top"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{note}</small></Link>)}</div>
      <div className="admin-overview-grid">
        <section className="admin-panel"><div className="admin-panel-head"><div><span className="panel-kicker">Latest activity</span><h2>Recent updates</h2></div><Activity size={16} /></div>
          {activity.length ? <div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.id}><span className="activity-mark" /><div><strong>{item.title}</strong><span>{item.detail}</span></div><small>{item.tag}</small></div>)}</div> : <div className="admin-empty"><p>Your enquiries and demo orders will appear here.</p><Link href="/catalog">View storefront <ArrowUpRight size={13} /></Link></div>}
        </section>
        <section className="admin-panel"><div className="admin-panel-head"><div><span className="panel-kicker">Order desk</span><h2>Latest demo orders</h2></div><Link href="/admin/orders" className="admin-inline-link">All orders <ArrowUpRight size={13} /></Link></div>
          {orders.length ? <div className="latest-orders">{orders.slice(0, 4).map((order) => <div className="latest-order" key={order.id}><div><strong>{order.customerName}</strong><span>{order.id} · {new Date(order.createdAt).toLocaleDateString()}</span></div><div><strong>{formatPrice(order.total)}</strong><span className="status-pill">{order.status}</span></div></div>)}</div> : <div className="admin-empty"><p>No demo orders yet.</p><Link href="/catalog">Explore catalogue <ArrowUpRight size={13} /></Link></div>}
        </section>
      </div>
      <div className="admin-footnote">Sample product records are fictional demo inventory. Dashboard data is stored in localStorage on this device.</div>
    </div>
  );
}