import { adminFetch, adminGet, buildQuery, newIdempotencyKey } from "./client";
import type { PaginatedResponse } from "@/types/api";
import type {
  InventoryRecord,
  StockMovement,
  StockOperationInput,
  StockOperationResult,
} from "@/types/admin";

export function listInventory(params: {
  search?: string;
  page?: number;
} = {}): Promise<PaginatedResponse<InventoryRecord>> {
  return adminGet<PaginatedResponse<InventoryRecord>>(
    `/api/inventory/${buildQuery({ ...params })}`,
  );
}

export function getInventory(productId: number): Promise<InventoryRecord> {
  return adminGet<InventoryRecord>(`/api/inventory/${productId}/`);
}

export function listStockMovements(
  productId: number,
  params: { page?: number } = {},
): Promise<PaginatedResponse<StockMovement>> {
  return adminGet<PaginatedResponse<StockMovement>>(
    `/api/inventory/${productId}/movements/${buildQuery({ ...params })}`,
  );
}

export type StockOperationName =
  | "receive"
  | "adjust"
  | "reserve"
  | "release"
  | "sale"
  | "return";

function runStockOperation(
  productId: number,
  operation: StockOperationName,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  return adminFetch<StockOperationResult>(
    `/api/inventory/${productId}/${operation}/`,
    {
      method: "POST",
      body: {
        quantity: input.quantity,
        reason: input.reason ?? "",
        reference: input.reference ?? "",
      },
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

export function receiveStock(
  productId: number,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  return runStockOperation(productId, "receive", input);
}

export function adjustStock(
  productId: number,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  return runStockOperation(productId, "adjust", input);
}

export function reserveStock(
  productId: number,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  return runStockOperation(productId, "reserve", input);
}

export function releaseStock(
  productId: number,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  return runStockOperation(productId, "release", input);
}

export function recordSale(
  productId: number,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  return runStockOperation(productId, "sale", input);
}

export function recordReturn(
  productId: number,
  input: StockOperationInput,
): Promise<StockOperationResult> {
  return runStockOperation(productId, "return", input);
}
