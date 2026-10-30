import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <Link className="wordmark footer-wordmark" href="/">
        <Image
          alt=""
          className="wordmark-mark"
          height={74}
          src="/logo.svg"
          unoptimized
          width={119}
        />
        <span>WHITESTAG</span>
      </Link>
      <nav className="footer-nav" aria-label="Footer navigation">
        <Link href="/products">Parts</Link>
        <Link href="/vehicles">Vehicles</Link>
        <Link href="/promotions">Offers</Link>
        <Link href="/account">Account</Link>
      </nav>
      <p>Find what moves you.</p>
      <span>© {new Date().getFullYear()} WhiteStag</span>
    </footer>
  );
}

