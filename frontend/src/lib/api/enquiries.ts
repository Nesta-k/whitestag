import { apiPost } from "./client";
import type { VehicleEnquiryPayload } from "@/types/api";

export function submitVehicleEnquiry(
  payload: VehicleEnquiryPayload
): Promise<{ id: number }> {
  return apiPost<{ id: number }>(
    "/api/enquiries/vehicle-enquiries/",
    payload
  );
}

