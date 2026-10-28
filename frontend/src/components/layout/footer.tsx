import Link from "next/link";
import Image from "next/image";

export function Footer() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  return (
    <footer className="site-footer">
      <div className="page-container footer-grid">
        <div className="footer-brand">
          <Link className="brand-lockup brand-lockup-light" href="/">
            <Image
              className="brand-logo brand-logo-light"
              src="/whitestag%20logo.svg"
              alt="WhiteStag"
              width={119}
              height={74}
            />
          </Link>
          <p>Reliable automotive parts and a better way to keep Ghana moving.</p>
        </div>
        <div>
          <h2>Shop</h2>
          <Link href="/products">Browse parts</Link>
          <Link href="/products">Categories</Link>
          <Link href="/vehicles">Vehicles</Link>
          <Link href="/promotions">Promotions</Link>
        </div>
        <div>
          <h2>Your account</h2>
          <Link href="/account">Sign in or register</Link>
          <Link href="/account/orders">Order history</Link>
          <Link href="/cart">Shopping cart</Link>
        </div>
        <div className="footer-note">
          <h2>Here to help</h2>
          <p>Need help finding the right part? Browse the published catalogue or contact our sales team.</p>
          {contactEmail ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : <small>Sales contact details are being configured.</small>}
        </div>
      </div>
      <div className="footer-bottom">
        <div className="page-container">
          <span>WhiteStag · Ghana</span>
          <span>Built for the road ahead.</span>
        </div>
      </div>
    </footer>
  );
}
