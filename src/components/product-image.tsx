"use client";

import { useState } from "react";
import Image from "next/image";

const fallbackImage = "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1400&q=80";

export function ProductImage({ src, alt, className = "", priority = false }: { src?: string; alt: string; className?: string; priority?: boolean }) {
    const [failed, setFailed] = useState(false);
    return (
        <div className={`product-media ${className}`}>
            <Image src={failed ? fallbackImage : src || fallbackImage} alt={alt} fill priority={priority} sizes="(max-width: 720px) 100vw, 50vw" onError={() => setFailed(true)} />
            {failed && <span className="image-fallback-label">WhiteStag inventory</span>}
        </div>
    );
}