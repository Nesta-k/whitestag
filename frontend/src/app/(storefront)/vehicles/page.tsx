import type { Metadata } from "next";
import ProductCard from "@/components/catalogue/product-card";
import { getProducts } from "@/lib/api/catalogue";
import { ApiError } from "@/lib/api/client";
import type { Product } from "@/types/api";

export const metadata: Metadata = {
  title: "Vehicles | WhiteStag",
  description: "Browse cars, electric vehicles, tricycles, motorcycles, and bikes.",
};

const vehicleTypes = [
  "car",
  "electric_vehicle",
  "tricycle",
  "motorcycle_bike",
] as const;

export default async function VehiclesPage() {
  let vehicles: Product[] = [];
  let errorMessage = "";

  try {
    const responses = await Promise.all(
      vehicleTypes.map((product_type) =>
        getProducts({ product_type, sales_method: "direct_purchase" }),
      ),
    );
    vehicles = responses
      .flatMap((response) => response.results)
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    errorMessage =
      error instanceof ApiError
        ? `The catalogue service returned an error (${error.status}).`
        : error instanceof Error
          ? `We could not reach the catalogue: ${error.message}`
          : "We could not load vehicles. Please try again shortly.";
  }

  return (
    <section className="catalogue-page">
      <div className="catalogue-heading">
        <p className="eyebrow">GO FURTHER</p>
        <h1>Vehicles for the journey.</h1>
        <p>Explore cars, electric vehicles, tricycles, motorcycles, and bikes.</p>
      </div>
      {errorMessage ? (
        <div className="catalogue-message" role="alert">
          <h2>Vehicle catalogue unavailable</h2>
          <p>{errorMessage}</p>
          <p>Check that the Django API is running and try again.</p>
        </div>
      ) : vehicles.length ? (
        <div className="product-grid">
          {vehicles.map((vehicle) => (
            <ProductCard key={vehicle.id} product={vehicle} />
          ))}
        </div>
      ) : (
        <div className="catalogue-message">
          <h2>No vehicles listed yet</h2>
          <p>Please check back soon or browse the full catalogue.</p>
        </div>
      )}
    </section>
  );
}
