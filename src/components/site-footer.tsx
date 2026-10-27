import Link from "next/link";
import { ArrowUpRight, Camera, Play, Users } from "lucide-react";

export function SiteFooter() {
    return (
        <footer className="site-footer">
            <div className="footer-main">
                <div>
                    <Link href="/" className="brand-mark footer-brand"><span className="brand-symbol">W</span><span className="brand-name">WhiteStag<span> AUTOMOTIVE</span></span></Link>
                    <p>Considered vehicles. Genuine parts.<br />A better way to move.</p>
                    <nav className="footer-socials" aria-label="WhiteStag social media">
                        <a href="https://www.instagram.com/whitestagautomotive/" target="_blank" rel="noreferrer" aria-label="WhiteStag on Instagram" title="Instagram"><Camera size={17} /></a>
                        <a href="https://www.facebook.com/whitestagautomotive/" target="_blank" rel="noreferrer" aria-label="WhiteStag on Facebook" title="Facebook"><Users size={17} /></a>
                        <a href="https://www.youtube.com/@whitestagautomotive" target="_blank" rel="noreferrer" aria-label="WhiteStag on YouTube" title="YouTube"><Play size={17} /></a>
                    </nav>
                </div>
                <div className="footer-links"><span>Explore</span><Link href="/catalog">Full inventory</Link><Link href="/about">About WhiteStag</Link><Link href="/visit">Book a showroom visit</Link><Link href="/#categories">Categories</Link><Link href="/admin">Owner dashboard</Link></div>
                <div className="footer-contact"><span>Start a conversation</span><a href="mailto:hello@whitestag.demo">hello@whitestag.demo <ArrowUpRight size={15} /></a><a href="tel:+233200000000">+233 20 000 0000</a><small>Accra, Ghana</small></div>
            </div>
            <div className="footer-bottom"><span>© 2026 WhiteStag Automotive. Fictional demo inventory.</span><span>Built for the road ahead.</span></div>
        </footer>
    );
}