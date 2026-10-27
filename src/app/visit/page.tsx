"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Check, MapPin, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/site-shell";
import { useApp } from "@/components/app-provider";
import type { ProductCategory } from "@/lib/types";

const categories: ProductCategory[] = ["Cars", "Electric Vehicles", "Tricycles", "Spare Parts"];
const visitTimes = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30"];

export default function ShowroomVisitPage() {
  const { products, submitEnquiry } = useApp();
  const [earliestDate, setEarliestDate] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState(visitTimes[0]);
  const [category, setCategory] = useState<ProductCategory>("Cars");
  const [productId, setProductId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    startTransition(() => setEarliestDate(new Date().toISOString().slice(0, 10)));
  }, []);

  const visitProducts = products.filter((product) => product.published && product.category === category);

  function submitVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (phone.replace(/\D/g, "").length < 9 || !visitDate || (earliestDate && visitDate < earliestDate)) {
      setError("Enter a valid phone number and choose a future visit date.");
      return;
    }
    const selectedProduct = visitProducts.find((product) => product.id === productId);
    const interest = selectedProduct ? `${category}: ${selectedProduct.name}` : category;
    const details = [`Preferred date: ${visitDate}`, `Preferred time: ${visitTime}`, `Interested in: ${interest}`, notes.trim() && `Note: ${notes.trim()}`].filter(Boolean).join(". ");
    submitEnquiry({
      productId: selectedProduct?.id || "showroom-visit",
      type: "Showroom visit",
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      quantity: 1,
      message: details,
    });
    setSubmitted(true);
  }

  return (
    <PublicShell>
      <main className="content-main detail-page">
        <div className="page-wrap">
          <header className="page-heading">
            <div className="eyebrow">WhiteStag Automotive · Accra</div>
            <h1 className="page-title">See it in person.</h1>
            <p className="page-subtitle">Plan a visit to explore vehicles and parts with the WhiteStag team.</p>
          </header>
          <div className="detail-layout">
            <section className="visit-information">
              <div className="detail-description">
                <div className="eyebrow">Make time for a closer look</div>
                <h2>Visit the showroom.</h2>
                <p>Tell us what you would like to see and when you hope to visit. We’ll use your request as a local demo record to show the appointment workflow.</p>
                <div className="visit-location"><MapPin size={17} /><div><strong>WhiteStag showroom</strong><span>Accra, Ghana · Visit details are illustrative for this prototype.</span></div></div>
                <section className="visit-map-card" aria-label="Showroom map preview">
                  <div className="visit-map-heading"><strong>Map preview</strong><a href="https://www.openstreetmap.org/?mlat=5.6037&mlon=-0.1870#map=13/5.6037/-0.1870" target="_blank" rel="noreferrer">Open larger map <ArrowUpRight size={13} /></a></div>
                  <div className="visit-map-frame"><iframe title="Interactive map preview around Accra, Ghana" src="https://www.openstreetmap.org/export/embed.html?bbox=-0.240%2C5.575%2C-0.135%2C5.645&layer=mapnik&marker=5.6037%2C-0.1870" loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></div>
                  <p className="visit-map-caption">Approximate Accra city-center preview. The exact showroom address is not configured in this demo.</p>
                </section>
                <div className="visit-location"><CalendarDays size={17} /><div><strong>Choose a preferred time</strong><span>Requests are not confirmed appointments. The team would confirm availability in a production system.</span></div></div>
                <Link className="text-link" href="/catalog">Browse inventory first <ArrowUpRight size={15} /></Link>
              </div>
            </section>
            <aside className="detail-panel visit-panel">
              {submitted ? (
                <div className="visit-success">
                  <div className="success-icon"><Check size={19} /></div>
                  <div className="eyebrow">Request saved</div>
                  <h2>We’ve noted your visit.</h2>
                  <p>Your preferred time is stored in this browser’s demo dashboard. This is not a confirmed appointment and no message was sent.</p>
                  <Link href="/catalog" className="button-primary">Continue browsing <ArrowUpRight size={15} /></Link>
                </div>
              ) : (
                <>
                  <div className="detail-kicker">Showroom appointment request</div>
                  <h2 className="visit-form-title">Request a visit.</h2>
                  <form className="inquiry-form" onSubmit={submitVisit}>
                    <div className="form-field"><label htmlFor="visit-name">Full name</label><input id="visit-name" required minLength={2} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></div>
                    <div className="form-two"><div className="form-field"><label htmlFor="visit-phone">Phone</label><input id="visit-phone" required type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></div><div className="form-field"><label htmlFor="visit-email">Email</label><input id="visit-email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div></div>
                    <div className="form-two"><div className="form-field"><label htmlFor="visit-date">Preferred date</label><input id="visit-date" type="date" required min={earliestDate || undefined} value={visitDate} onChange={(event) => setVisitDate(event.target.value)} /></div><div className="form-field"><label htmlFor="visit-time">Preferred time</label><select id="visit-time" value={visitTime} onChange={(event) => setVisitTime(event.target.value)}>{visitTimes.map((time) => <option key={time} value={time}>{time}</option>)}</select></div></div>
                    <div className="form-two"><div className="form-field"><label htmlFor="visit-category">What would you like to see?</label><select id="visit-category" value={category} onChange={(event) => { setCategory(event.target.value as ProductCategory); setProductId(""); }}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="form-field"><label htmlFor="visit-product">Specific item <span>Optional</span></label><select id="visit-product" value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">No specific item</option>{visitProducts.map((product) => <option key={product.id} value={product.id}>{product.brand} · {product.name}</option>)}</select></div></div>
                    <div className="form-field"><label htmlFor="visit-notes">Anything else? <span>Optional</span></label><textarea id="visit-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Share any details that will help us prepare" /></div>
                    {error && <p className="form-error" role="alert">{error}</p>}
                    <button className="button-primary form-submit" type="submit">Request showroom visit <CalendarDays size={15} /></button>
                    <div className="visit-demo-note"><ShieldCheck size={14} /><span>Demo only. This saves a local request; it does not reserve a time or contact the showroom.</span></div>
                  </form>
                </>
              )}
            </aside>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}