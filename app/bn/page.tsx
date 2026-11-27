import type { Metadata } from "next";
import PublicHome from "@/components/public-home";
import { getPublicHomeInitialData } from "@/lib/public-home-initial";
import { business, jsonLd, siteUrl } from "@/lib/site-info";
import "../public-home-v2.css";

export const metadata: Metadata = {
  title: { absolute: "ফেনিতে আর্কিটেকচার ও স্ট্রাকচারাল ডিজাইন | LAND VIEW" },
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
    title: "ফেনিতে আর্কিটেকচার ও স্ট্রাকচারাল ডিজাইন | LAND VIEW",
    description: "ফেনি থেকে বাংলাদেশজুড়ে উপযুক্ত প্রকল্পে সমন্বিত আর্কিটেকচার ও ইঞ্জিনিয়ারিং কনসালটেন্সি।",
    url: `${siteUrl}/bn`,
    siteName: business.name,
    locale: "bn_BD",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const dynamic = "force-dynamic";
export default async function BanglaPage(){
  const snapshot=await getPublicHomeInitialData();
  const pageSchema={"@context":"https://schema.org","@type":"WebPage",name:"LAND VIEW Engineers & Architects — বাংলা",url:`${siteUrl}/bn`,inLanguage:"bn-BD",about:{"@id":`${siteUrl}/#organization`}};
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(pageSchema)}}/><PublicHome {...(snapshot||{})} locale="bn"/></>;
}
