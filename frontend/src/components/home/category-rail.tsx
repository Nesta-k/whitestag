import Image from "next/image";
import Link from "next/link";
import type { Category, HomepageSettings } from "@/types/api";

export default function CategoryRail({
  settings,
  categories,
}: {
  settings: HomepageSettings;
  categories: Category[];
}) {
  if (categories.length === 0) return null;

  return (
    <section className="ws-section ws-categories-section" id="categories">
      <div className="ws-section-head">
        <p className="eyebrow">{settings.categories_eyebrow}</p>
        <h2>{settings.categories_heading}</h2>
      </div>

      <ul className="ws-cat-rail">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              className="ws-cat-card"
              href={`/products?category=${encodeURIComponent(category.slug)}`}
            >
              <span className="ws-cat-media">
                {category.image_url ? (
                  <Image
                    src={category.image_url}
                    alt={category.name}
                    fill
                    sizes="180px"
                    unoptimized
                  />
                ) : (
                  <span className="ws-cat-placeholder" aria-hidden="true">
                    {category.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="ws-cat-name">{category.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
