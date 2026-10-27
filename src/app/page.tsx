"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUpRight, BadgeCheck, Wrench, Headset } from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "@/components/app-provider";
import { PublicShell } from "@/components/site-shell";
import { ProductCard } from "@/components/product-card";
import type { Product, ProductCategory } from "@/lib/types";

const categories: { name: ProductCategory; image: string }[] = [
  { name: "Spare Parts", image: "photo-1486262715619-67b85e0b08d3" },
  { name: "Tricycles", image: "photo-1558981806-ec527fa84c39" },
  { name: "Cars", image: "photo-1519641471654-76ce0107ad1b" },
  { name: "Electric Vehicles", image: "photo-1617788138017-80ad40651399" },
];

export default function Home() {
  const { products } = useApp();
  const publishedProducts = products.filter((product) => product.published);
  const featured: Product[] = [];
  for (const category of ["Spare Parts", "Tricycles", "Spare Parts"] as const) {
    const product = publishedProducts.find((item) => item.category === category && !featured.some((featuredItem) => featuredItem.id === item.id));
    if (product) featured.push(product);
  }
  for (const product of publishedProducts) {
    if (featured.length === 3) break;
    if (!featured.some((featuredItem) => featuredItem.id === product.id)) featured.push(product);
  }
  return (
    <PublicShell><main className="content-main">
      <section className="hero">
        <div className="hero-image" aria-hidden="true" />
        <div className="hero-content">
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }}>
            <div className="eyebrow">WhiteStag Automotive · Parts & three-wheel mobility</div>
            <h1>Need am?<br /><span>We get am.</span></h1>
            <p className="hero-copy">Genuine auto spares and practical three-wheelers for drivers, workshops, and businesses in Ghana. Cars and EVs are here too.</p>
            <div className="hero-actions"><Link href="/catalog?category=Spare%20Parts" className="button-primary">Shop spare parts <ArrowUpRight size={16} /></Link><Link href="/catalog?category=Tricycles" className="button-secondary">Explore tricycles <ArrowDown size={15} /></Link></div>
            <div className="hero-meta"><span><Wrench size={14} /> Genuine parts</span><span><BadgeCheck size={14} /> Work-ready tricycles</span><span>Accra, Ghana</span></div>
          </motion.div>
        </div>
        <div className="hero-index">01 <span>/ 04</span></div>
      </section>

      <section className="section featured-section"><div className="section-inner">
        <div className="section-head"><div><div className="eyebrow">Parts & three-wheelers</div><h2>Ready for the work ahead.</h2><p>WhiteStag’s core range: dependable parts and practical tricycles.</p></div><Link className="text-link" href="/catalog?category=Spare%20Parts">Shop all spare parts <ArrowRight size={15} /></Link></div>
        <div className="product-grid">{featured.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}</div>
      </div></section>

      <section className="section category-section" id="categories"><div className="section-inner">
        <div className="section-head"><div><div className="eyebrow">What we specialise in</div><h2>Parts first. Mobility built for work.</h2><p>Explore genuine spares and tricycles, alongside cars and electric vehicles.</p></div></div>
        <div className="category-grid">{categories.map((category) => {
          const count = products.filter((product) => product.published && product.category === category.name).length;
          const unit = category.name === "Spare Parts" ? "parts" : category.name === "Tricycles" ? "models" : "vehicles";
          return <Link className="category-tile" key={category.name} href={`/catalog?category=${encodeURIComponent(category.name)}`}>
          <Image src={`https://images.unsplash.com/${category.image}?auto=format&fit=crop&w=900&q=80`} alt="" fill sizes="(max-width: 720px) 50vw, 25vw" />
          <div className="category-tile-copy"><div><h3>{category.name}</h3><span>{String(count).padStart(2, "0")} {unit}</span></div><ArrowUpRight size={19} color="var(--accent)" /></div>
        </Link>;
        })}</div>
      </div></section>

      <section className="section standard-section" id="about"><div className="section-inner standard-grid">
        <div className="standard-intro"><div className="eyebrow">The WhiteStag standard</div><h2>Good choices.<br />Better journeys.</h2><p>Every detail should make the next step feel right. We bring clarity to the search, care to the selection, and a real person to the conversation.</p><Link className="text-link" href="/catalog">Explore the collection <ArrowRight size={15} /></Link></div>
        <div className="standard-list">
          <div className="standard-item"><span className="standard-number">01</span><div><h3>Parts with provenance</h3><p>Genuine and carefully sourced parts, with compatibility guidance before you buy.</p></div></div>
          <div className="standard-item"><span className="standard-number">02</span><div><h3>Three-wheelers for work</h3><p>Practical tricycles suited to deliveries, trade, and everyday business needs.</p></div></div>
          <div className="standard-item"><span className="standard-number">03</span><div><h3>Vehicles when you need them</h3><p>Cars and electric vehicles round out a catalogue built around getting you moving.</p></div></div>
        </div>
      </div></section>

      <section className="section" style={{ paddingTop: 0, background: "var(--ink)" }}><div className="section-inner contact-band"><div><p>Need a part or work vehicle?</p><h2>Let’s find the right fit.</h2></div><div className="home-contact-actions"><Link href="/visit" className="button-dark">Book a showroom visit <Headset size={16} /></Link><Link href="/catalog?category=Spare%20Parts" className="text-link">Browse parts <ArrowRight size={15} /></Link></div></div></section>
    </main></PublicShell>
  );
}
