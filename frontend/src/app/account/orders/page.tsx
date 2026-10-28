"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getOrders } from "@/lib/api/orders";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/store/auth-context";
import type { Order } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersPage() {
  const { customer, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getOrders(page);
      setOrders(response.results);
      setCount(response.count);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Could not load your orders.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (authLoading) return;
    if (!customer) {
      setLoading(false);
      return;
    }
    void loadOrders();
  }, [authLoading, customer, loadOrders]);

  if (loading || authLoading) return <div className="page-container section-space"><Skeleton className="orders-skeleton" /></div>;
  if (!customer) return <div className="page-container section-space"><EmptyState title="Sign in to view your orders" description="Your order history is private to your account." action={<Button href="/account?next=%2Faccount%2Forders">Sign in</Button>} /></div>;
  if (error) return <div className="page-container section-space"><ErrorState message={error} onRetry={() => void loadOrders()} /></div>;
  if (orders.length === 0) return <div className="page-container section-space"><EmptyState title="No orders yet" description="Your orders will appear here after you complete checkout." action={<Button href="/products">Browse parts</Button>} /></div>;

  return (
    <div className="page-container section-space">
      <div className="page-heading"><div><p className="eyebrow">Your account</p><h1>Order history</h1></div><Link className="text-link" href="/products">Shop parts</Link></div>
      <div className="order-list">
        {orders.map((order) => (
          <Link className="order-row" href={`/account/orders/${encodeURIComponent(order.public_reference)}`} key={order.public_reference}>
            <div><span className="order-reference">#{order.public_reference.slice(0, 8).toUpperCase()}</span><small>{new Date(order.created_at).toLocaleDateString("en-GH", { dateStyle: "medium" })}</small></div>
            <span>{order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
            <div className="order-statuses">
              <Badge>{order.status.replaceAll("_", " ")}</Badge>
              <Badge>{order.payment_status.replaceAll("_", " ")}</Badge>
            </div>
            <strong>{new Intl.NumberFormat("en-GH", { style: "currency", currency: order.currency }).format(Number(order.total))}</strong>
          </Link>
        ))}
      </div>
      {count > 20 ? (
        <nav className="pagination" aria-label="Order history pages">
          <Button type="button" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
          <span>Page {page} of {Math.ceil(count / 20)}</span>
          <Button type="button" variant="outline" disabled={page >= Math.ceil(count / 20) || loading} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </nav>
      ) : null}
    </div>
  );
}
