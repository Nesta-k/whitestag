import { adminDelete, adminGet, adminPatch, buildQuery } from "./client";
import type { PaginatedResponse } from "@/types/api";
import type { VehicleEnquiry, VehicleEnquiryStatus } from "@/types/admin";

const BASE = "/api/enquiries/vehicle-enquiries";

export function listVehicleEnquiries(params: {
  search?: string;
  status?: VehicleEnquiryStatus | "";
  page?: number;
} = {}): Promise<PaginatedResponse<VehicleEnquiry>> {
  return adminGet<PaginatedResponse<VehicleEnquiry>>(
    `${BASE}/${buildQuery({ ...params })}`,
  );
}

export function getVehicleEnquiry(id: number): Promise<VehicleEnquiry> {
  return adminGet<VehicleEnquiry>(`${BASE}/${id}/`);
}

export function updateVehicleEnquiry(
  id: number,
  payload: { status?: VehicleEnquiryStatus; message?: string },
): Promise<VehicleEnquiry> {
  return adminPatch<VehicleEnquiry>(`${BASE}/${id}/`, payload);
}

export function deleteVehicleEnquiry(id: number): Promise<void> {
  return adminDelete(`${BASE}/${id}/`);
}
