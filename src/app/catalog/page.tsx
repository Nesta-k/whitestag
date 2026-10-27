import { CatalogBrowser } from "@/components/catalog-browser";
import { PublicShell } from "@/components/site-shell";

export default function CatalogPage() {
    return (
        <PublicShell><main className="catalog-main">
            <div className="page-wrap">
                <header className="page-heading">
                    <div className="page-heading-row"><div><div className="eyebrow">The WhiteStag collection</div><h1 className="page-title">Find your fit.</h1></div><p className="page-subtitle">Explore carefully selected vehicles, electric mobility, commercial tricycles, and parts. All sample products are fictional demo inventory.</p></div>
                </header>
                <CatalogBrowser />
            </div>
        </main></PublicShell>
    );
}