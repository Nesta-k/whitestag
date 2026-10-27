import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, CarFront, Headset, MapPin, Wrench } from "lucide-react";
import { PublicShell } from "@/components/site-shell";

const principles = [
  { number: "01", title: "Know what you are considering", description: "Clear product details, specifications, condition, and availability help make the shortlist more useful." },
  { number: "02", title: "Choose how to move forward", description: "Buy eligible items directly in the demo, or request a quote or preorder conversation for other listings." },
  { number: "03", title: "Get support beyond the listing", description: "Ask about vehicle fit, parts compatibility, or arrange a showroom visit with the WhiteStag team." },
];

export default function AboutPage() {
  return (
    <PublicShell>
      <main className="content-main about-page">
        <section className="about-hero">
          <div className="about-hero-image">
            <Image src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=2200&q=90" alt="A carefully presented vehicle at WhiteStag Automotive" fill priority sizes="100vw" />
          </div>
          <div className="about-hero-shade" />
          <div className="about-hero-content">
            <div className="eyebrow">About WhiteStag Automotive</div>
            <h1>Good roads<br />start with<br /><span>good choices.</span></h1>
            <p>We bring vehicles, electric mobility, tricycles, and genuine automotive parts together in one considered place in Accra.</p>
            <Link href="/catalog" className="button-primary">Explore the collection <ArrowUpRight size={16} /></Link>
          </div>
          <span className="about-image-credit">WhiteStag Automotive · Accra, Ghana</span>
        </section>

        <section className="section about-story">
          <div className="section-inner about-story-grid">
            <div><div className="eyebrow">Our point of view</div><h2>More than a place to browse.</h2></div>
            <div className="about-story-copy"><p className="about-lead">A vehicle is a big decision. The right information and a useful conversation should be part of it.</p><p>WhiteStag is built around a simple idea: make it easier to explore what moves you, understand the details, and choose a next step that feels right. Our catalogue brings together selected cars, electric vehicles, commercial tricycles, and parts for everyday ownership.</p><p>This site is a presentation prototype. Inventory and prices are fictional examples, and enquiries or showroom requests are stored locally for demonstration.</p></div>
          </div>
        </section>

        <section className="section about-principles">
          <div className="section-inner">
            <div className="section-head"><div><div className="eyebrow">The WhiteStag approach</div><h2>Clarity at every turn.</h2></div><p>Useful details. Considered choice. A real person when you need one.</p></div>
            <div className="about-principle-grid">{principles.map((principle) => <article className="about-principle" key={principle.number}><span>{principle.number}</span><h3>{principle.title}</h3><p>{principle.description}</p></article>)}</div>
          </div>
        </section>

        <section className="section about-location-section">
          <div className="section-inner about-location-grid">
            <div className="about-location-image"><Image src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=85" alt="Vehicle detail at the WhiteStag showroom" fill sizes="(max-width: 720px) 100vw, 50vw" /></div>
            <div className="about-location-copy"><div className="eyebrow">Find WhiteStag</div><h2>A showroom in Accra.</h2><p>Visit to take a closer look, talk through a vehicle, or ask about a part. Send a preferred date and time and the team can follow up.</p><div className="about-address"><MapPin size={18} /><div><strong>WhiteStag Automotive</strong><span>Accra, Ghana</span></div></div><div className="about-contact-links"><a href="mailto:hello@whitestag.demo"><Headset size={15} /> hello@whitestag.demo</a><a href="tel:+233200000000">+233 20 000 0000</a></div><div className="about-location-actions"><Link href="/visit" className="button-primary">Request a showroom visit <ArrowRight size={15} /></Link><a className="text-link" href="https://www.google.com/maps/search/?api=1&query=Accra%2C+Ghana" target="_blank" rel="noreferrer">Open Accra map <ArrowUpRight size={15} /></a></div><p className="about-demo-note"><BadgeCheck size={14} /> The location shown is city-level for this demo; no street address is configured.</p></div>
          </div>
        </section>

        <section className="section about-closing">
          <div className="section-inner about-closing-inner"><div><div className="eyebrow">Start exploring</div><h2>Your next step starts here.</h2></div><div className="about-closing-links"><Link href="/catalog" className="button-primary"><CarFront size={16} /> Browse inventory</Link><Link href="/visit" className="button-dark"><Wrench size={16} /> Plan a visit</Link></div></div>
        </section>
      </main>
    </PublicShell>
  );
}
