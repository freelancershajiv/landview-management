import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { business, jsonLd, siteUrl } from "@/lib/site-info";

export const metadata: Metadata = {
  title: { absolute: "ইঞ্জিনিয়ারিং ও আর্কিটেকচার কনসালটেন্সি বাংলাদেশ | LAND VIEW" },
  description: "ফেনি ভিত্তিক LAND VIEW Engineers & Architects বাংলাদেশে আর্কিটেকচারাল ডিজাইন, স্ট্রাকচারাল ডিজাইন, 3D ডিজাইন, সাইট সুপারভিশন, এস্টিমেট, সার্ভে ও সয়েল টেস্ট সেবা প্রদান করে।",
  alternates: {
    canonical: `${siteUrl}/bn`,
    languages: {
      "en-BD": siteUrl,
      "bn-BD": `${siteUrl}/bn`,
      "x-default": siteUrl,
    },
  },
  openGraph: {
    title: "ইঞ্জিনিয়ারিং ও আর্কিটেকচার কনসালটেন্সি বাংলাদেশ | LAND VIEW",
    description: "ফেনি থেকে বাংলাদেশজুড়ে উপযুক্ত প্রকল্পে সমন্বিত আর্কিটেকচার ও ইঞ্জিনিয়ারিং কনসালটেন্সি।",
    url: `${siteUrl}/bn`,
    siteName: business.name,
    locale: "bn_BD",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const services = [
  ["আর্কিটেকচারাল ডিজাইন", "বিল্ডিং প্ল্যানিং, ফ্লোর প্ল্যান, এলিভেশন ও সমন্বিত আর্কিটেকচারাল ড্রয়িং।", "/services/architectural-design"],
  ["স্ট্রাকচারাল ডিজাইন", "স্ট্রাকচারাল অ্যানালাইসিস, আরসিসি ডিজাইন, ফাউন্ডেশন ডিজাইন ও রিইনফোর্সমেন্ট ডিটেইলিং।", "/services/structural-design"],
  ["3D এক্সটেরিয়র ডিজাইন", "বিল্ডিং ফর্ম, ফ্যাসাড, ম্যাটেরিয়াল ও বাহ্যিক ভিজ্যুয়ালাইজেশন।", "/services/3d-exterior-design"],
  ["3D ইন্টেরিয়র ডিজাইন", "ইন্টেরিয়র লে-আউট, ফিনিশ, ফার্নিচার ধারণা ও 3D ভিজ্যুয়ালাইজেশন।", "/services/3d-interior-design"],
  ["ইলেকট্রিক্যাল ডিজাইন", "লাইটিং, পাওয়ার পয়েন্ট ও বিল্ডিং ইলেকট্রিক্যাল লে-আউট সমন্বয়।", "/services/electrical-design"],
  ["প্লাম্বিং ডিজাইন", "পানি সরবরাহ, স্যানিটারি ও ড্রেনেজ লে-আউট।", "/services/plumbing-design"],
  ["এস্টিমেট ও কস্টিং", "কোয়ান্টিটি টেক-অফ, BOQ ও নির্মাণ ব্যয়ের প্রাক্কলন।", "/services/estimate-costing"],
  ["প্ল্যান অনুমোদন সহায়তা", "প্রযোজ্য কর্তৃপক্ষের জন্য ড্রয়িং ও টেকনিক্যাল ডকুমেন্ট প্রস্তুতি ও সমন্বয়।", "/services/plan-approval"],
  ["ডিজিটাল সার্ভে", "সাইট ও ভূমির মাপ, বিদ্যমান অবস্থা এবং ডিজাইনের জন্য জরিপ তথ্য।", "/services/digital-survey"],
  ["সয়েল টেস্ট", "সাব-সয়েল ইনভেস্টিগেশন ও ফাউন্ডেশন সিদ্ধান্তের জন্য জিওটেকনিক্যাল তথ্য সংগ্রহে সমন্বয়।", "/services/soil-test"],
  ["সাইট সুপারভিশন", "নির্ধারিত সাইট ভিজিট, নির্মাণ পর্যবেক্ষণ এবং ড্রয়িং-টু-সাইট সমন্বয়।", "/services/site-supervision"],
] as const;

const css = `
.bn-page{min-height:100vh;background:#07101a;color:#fff}.bn-wrap{width:min(100% - 44px,1160px);margin:0 auto}.bn-hero{padding:78px 0 64px;border-bottom:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 82% 15%,rgba(214,31,38,.14),transparent 28%),#07101a}.bn-kicker{display:block;margin-bottom:16px;color:#ef4a50;font-size:12px;font-weight:900;letter-spacing:.08em}.bn-hero h1{max-width:980px;margin:0;font:600 clamp(40px,6vw,72px)/1.08 system-ui,"Noto Sans Bengali","Nirmala UI",sans-serif;letter-spacing:-.035em}.bn-hero p{max-width:820px;margin:24px 0 0;color:#cbd3d9;font-size:17px;line-height:1.9}.bn-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.bn-btn{min-height:46px;display:inline-flex;align-items:center;justify-content:center;padding:0 20px;border-radius:7px;font-size:13px;font-weight:800}.bn-primary{background:#d61f26;color:#fff}.bn-outline{border:1px solid rgba(239,74,80,.7);color:#fff}.bn-section{padding:68px 0}.bn-section h2{margin:0;font:600 clamp(30px,4vw,46px)/1.2 system-ui,"Noto Sans Bengali","Nirmala UI",sans-serif}.bn-section>div>p{max-width:820px;color:#aeb8c0;font-size:16px;line-height:1.9}.bn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:30px}.bn-card{display:flex;min-height:210px;flex-direction:column;padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0d1721;color:#fff}.bn-card strong{font-size:20px;line-height:1.35}.bn-card p{margin:14px 0 0;color:#aeb8c0;font-size:14px;line-height:1.8}.bn-card span{margin-top:auto;padding-top:22px;color:#ef4a50;font-size:12px;font-weight:900}.bn-local{background:#0d1721;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}.bn-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:28px}.bn-fact{padding:22px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#0a131c}.bn-fact small{display:block;color:#ef4a50;font-weight:900;margin-bottom:8px}.bn-fact strong{font-size:15px;line-height:1.7}@media(max-width:860px){.bn-grid,.bn-facts{grid-template-columns:1fr 1fr}}@media(max-width:620px){.bn-wrap{width:min(100% - 28px,1160px)}.bn-grid,.bn-facts{grid-template-columns:1fr}.bn-hero{padding:54px 0 48px}}
`;

export default function BanglaPage() {
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "LAND VIEW Engineers & Architects — বাংলা",
    url: `${siteUrl}/bn`,
    inLanguage: "bn-BD",
    about: { "@id": `${siteUrl}/#organization` },
  };

  return <main className="bn-page" lang="bn-BD">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageSchema) }} />
    <PublicHeader />
    <section className="bn-hero"><div className="bn-wrap">
      <span className="bn-kicker">LAND VIEW ENGINEERS &amp; ARCHITECTS · ফেনি, বাংলাদেশ</span>
      <h1>বাংলাদেশে আর্কিটেকচার ও ইঞ্জিনিয়ারিং কনসালটেন্সি</h1>
      <p>LAND VIEW ভবন পরিকল্পনা, আর্কিটেকচারাল ডিজাইন, স্ট্রাকচারাল ডিজাইন, 3D ভিজ্যুয়ালাইজেশন, বিল্ডিং সার্ভিস ডিজাইন, এস্টিমেট, জরিপ, সয়েল টেস্ট সমন্বয় এবং সাইট সুপারভিশনের মাধ্যমে একটি সমন্বিত কনসালটেন্সি অভিজ্ঞতা দিতে কাজ করে। আমাদের অফিস ফেনি সদরে।</p>
      <div className="bn-actions"><Link className="bn-btn bn-primary" href="/contact">প্রকল্প নিয়ে কথা বলুন</Link><Link className="bn-btn bn-outline" href="/projects">প্রকল্প দেখুন</Link><Link className="bn-btn bn-outline" href="/">English</Link></div>
    </div></section>

    <section className="bn-section"><div className="bn-wrap">
      <h2>আমাদের প্রধান সেবাসমূহ</h2>
      <p>প্রতিটি কাজের পরিধি প্রকল্পের ধরন, অবস্থান এবং প্রয়োজন অনুযায়ী নির্ধারণ করা হয়। বিস্তারিত ইংরেজি সার্ভিস পেজে কাজের ফোকাস, সম্ভাব্য ডেলিভারেবল এবং প্রস্তুতির তথ্য দেওয়া আছে।</p>
      <div className="bn-grid">{services.map(([name, description, href]) => <Link href={href} className="bn-card" key={href}><strong>{name}</strong><p>{description}</p><span>বিস্তারিত দেখুন →</span></Link>)}</div>
    </div></section>

    <section className="bn-section bn-local"><div className="bn-wrap">
      <h2>ফেনি থেকে বাংলাদেশজুড়ে উপযুক্ত প্রকল্পে সেবা</h2>
      <p>দূরের প্রকল্পে কাজের ধরন, ডিজাইন সমন্বয়, সাইট ভিজিট এবং ভ্রমণ প্রয়োজন আগে আলোচনা করে সেবার পরিধি নির্ধারণ করা হয়।</p>
      <div className="bn-facts">
        <div className="bn-fact"><small>অফিস</small><strong>F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900</strong></div>
        <div className="bn-fact"><small>ইঞ্জিনিয়ারিং</small><strong>+88 0140 8080 400</strong></div>
        <div className="bn-fact"><small>আর্কিটেকচার</small><strong>+88 01902 500 400</strong></div>
      </div>
      <div className="bn-actions"><Link className="bn-btn bn-primary" href="/team">টিম দেখুন</Link><Link className="bn-btn bn-outline" href="/services">সব সার্ভিস</Link></div>
    </div></section>
  </main>;
}
