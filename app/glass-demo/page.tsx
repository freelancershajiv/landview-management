"use client";

import Link from "next/link";
import { useState } from "react";

const actions = [
  { icon: "⌂", label: "Home", hint: "Back to the beginning" },
  { icon: "▥", label: "Services", hint: "Architecture & engineering" },
  { icon: "◇", label: "Projects", hint: "Explore selected work" },
  { icon: "◎", label: "Team", hint: "Meet LAND VIEW" },
];

export default function GlassDemoPage() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <main className="glass-demo">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="glass-nav">
        <Link href="/" className="brand"><span className="brand-mark">LV</span><span><b>LAND VIEW</b><small>ENGINEERS & ARCHITECTS</small></span></Link>
        <nav className="nav-pills">
          {actions.map((item, index) => (
            <button key={item.label} className="glass-pill" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}>
              <span className="glass-icon">{item.icon}</span><span>{item.label}</span>
              <span className={`hover-preview ${active === index ? "show" : ""}`}><i>{item.icon}</i><b>{item.label}</b><small>{item.hint}</small></span>
            </button>
          ))}
        </nav>
        <button className="contact-button"><span className="glass-icon">↗</span><span>Get in Touch</span></button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">LAND VIEW · FENI, BANGLADESH</span>
          <h1>DESIGNING<br/>BETTER.<br/><em>BUILDING SAFER.</em></h1>
          <p>Architecture and engineering shaped with clarity, technical discipline and a commitment to safer construction.</p>
          <div className="hero-actions">
            <button className="primary-glass"><span className="glass-icon">▥</span><span>Explore Services</span><span className="button-preview"><i>▥</i><b>Our Services</b><small>10 coordinated disciplines</small></span></button>
            <button className="secondary-glass"><span className="glass-icon">◇</span><span>View Projects</span><span className="button-preview"><i>◇</i><b>Selected Work</b><small>Architecture · Structure · 3D</small></span></button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="building">
            <div className="tower t1"/><div className="tower t2"/><div className="tower t3"/>
            <div className="grid-lines"/>
          </div>
          <div className="project-glass">
            <span>FEATURED WORK</span><strong>Residential Architecture</strong><small>Design · Engineering · Visualization</small>
          </div>
          <div className="floating-chip chip-a"><span>⌗</span>Structural</div>
          <div className="floating-chip chip-b"><span>◇</span>3D Exterior</div>
        </div>
      </section>

      <section className="service-dock">
        {[
          ["▥","Architectural Design","Creative & functional planning"],
          ["⌗","Structural Design","Safe & efficient structures"],
          ["▣","Project Coordination","Clear technical delivery"],
          ["⌂","Site Supervision","Quality & safety on site"],
        ].map(([icon,title,copy]) => <article key={title}><span className="dock-icon">{icon}</span><div><b>{title}</b><small>{copy}</small></div></article>)}
      </section>

      <style jsx>{`
        *{box-sizing:border-box}.glass-demo{min-height:100vh;overflow:hidden;background:#06101a;color:#f7f2e8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;padding:22px}.glass-demo:before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:52px 52px;mask-image:linear-gradient(to bottom,#000,transparent 88%);pointer-events:none}.ambient{position:absolute;border-radius:999px;filter:blur(90px);opacity:.28;pointer-events:none}.ambient-a{width:520px;height:520px;background:#c79025;right:-140px;top:40px}.ambient-b{width:460px;height:460px;background:#1f6d86;left:-180px;bottom:-120px}
        .glass-nav{width:min(1440px,calc(100vw - 44px));height:76px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:10px 12px 10px 18px;position:relative;z-index:20;border:1px solid rgba(255,255,255,.12);border-radius:25px;background:linear-gradient(135deg,rgba(255,255,255,.105),rgba(255,255,255,.035));box-shadow:inset 0 1px rgba(255,255,255,.18),0 18px 55px rgba(0,0,0,.28);backdrop-filter:blur(28px) saturate(155%);-webkit-backdrop-filter:blur(28px) saturate(155%)}
        .brand{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none}.brand-mark{width:45px;height:45px;display:grid;place-items:center;border-radius:14px;background:linear-gradient(145deg,#e2ad3b,#a96e0d);color:#07101a;font-family:Georgia,serif;font-weight:900;box-shadow:inset 0 1px rgba(255,255,255,.5),0 9px 28px rgba(215,154,23,.18)}.brand b{display:block;font-family:Georgia,serif;font-size:18px;letter-spacing:.08em}.brand small{display:block;margin-top:2px;font-size:8px;letter-spacing:.18em;color:#b8bec5}.nav-pills{display:flex;align-items:center;gap:7px}.glass-pill,.contact-button,.primary-glass,.secondary-glass{position:relative;border:1px solid rgba(255,255,255,.12);color:#f7f2e8;background:linear-gradient(145deg,rgba(255,255,255,.10),rgba(255,255,255,.035));box-shadow:inset 0 1px rgba(255,255,255,.16),0 8px 24px rgba(0,0,0,.2);backdrop-filter:blur(22px) saturate(150%);cursor:pointer;transition:transform .25s ease,border-color .25s ease,background .25s ease,box-shadow .25s ease}.glass-pill{height:44px;padding:0 15px 0 8px;border-radius:16px;display:flex;align-items:center;gap:8px}.glass-pill:hover,.secondary-glass:hover{transform:translateY(-2px);border-color:rgba(239,183,51,.38);background:linear-gradient(145deg,rgba(255,255,255,.15),rgba(215,154,23,.07));box-shadow:inset 0 1px rgba(255,255,255,.24),0 14px 34px rgba(0,0,0,.28)}.glass-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:10px;background:linear-gradient(145deg,rgba(255,255,255,.19),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.13);box-shadow:inset 0 1px rgba(255,255,255,.22),0 6px 14px rgba(0,0,0,.18);color:#efb733}.contact-button{height:50px;border-radius:17px;padding:0 17px 0 9px;display:flex;align-items:center;gap:9px;background:linear-gradient(145deg,rgba(225,166,39,.94),rgba(164,102,10,.86));color:#07101a;border-color:rgba(255,218,133,.46);font-weight:800}.contact-button .glass-icon{color:#07101a;background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.2)}
        .hover-preview,.button-preview{position:absolute;opacity:0;pointer-events:none;transform:translateY(8px) scale(.96);transition:.22s ease;z-index:50;border:1px solid rgba(255,255,255,.16);background:linear-gradient(145deg,rgba(20,31,42,.86),rgba(8,17,26,.72));box-shadow:inset 0 1px rgba(255,255,255,.18),0 22px 50px rgba(0,0,0,.42);backdrop-filter:blur(30px) saturate(170%);-webkit-backdrop-filter:blur(30px) saturate(170%)}.hover-preview{top:53px;left:50%;width:170px;margin-left:-85px;padding:15px;border-radius:20px;text-align:left}.hover-preview.show{opacity:1;transform:translateY(0) scale(1)}.hover-preview i,.button-preview i{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;font-style:normal;font-size:20px;color:#efb733;background:linear-gradient(145deg,rgba(255,255,255,.19),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.15);margin-bottom:10px}.hover-preview b,.hover-preview small,.button-preview b,.button-preview small{display:block}.hover-preview small,.button-preview small{color:#9fa9b2;font-size:11px;margin-top:4px;line-height:1.35}
        .hero{width:min(1440px,calc(100vw - 44px));min-height:610px;margin:20px auto 0;display:grid;grid-template-columns:.92fr 1.08fr;position:relative;z-index:5}.hero-copy{padding:68px 42px 54px 18px;align-self:center}.eyebrow{font-size:11px;letter-spacing:.22em;color:#d9a532;font-weight:800}.hero h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(58px,6vw,96px);line-height:.89;letter-spacing:-.045em;margin:23px 0 27px;font-weight:700}.hero h1 em{font-style:italic;color:#dca62e;font-weight:500}.hero-copy>p{max-width:620px;color:#aeb8c0;font-size:17px;line-height:1.75;border-left:2px solid #d59b22;padding-left:19px}.hero-actions{display:flex;gap:12px;margin-top:34px}.primary-glass,.secondary-glass{height:58px;padding:0 22px 0 11px;border-radius:19px;display:flex;align-items:center;gap:11px;font-weight:800;font-size:14px}.primary-glass{color:#07101a;background:linear-gradient(145deg,rgba(236,183,62,.98),rgba(174,111,14,.92));border-color:rgba(255,222,143,.48)}.primary-glass .glass-icon{color:#07101a;background:rgba(255,255,255,.2)}.button-preview{left:0;bottom:70px;width:210px;padding:16px;border-radius:22px;text-align:left;color:#fff}.primary-glass:hover .button-preview,.secondary-glass:hover .button-preview{opacity:1;transform:translateY(0) scale(1)}.button-preview{transform:translateY(8px) scale(.96)}
        .hero-visual{position:relative;min-height:610px;border-radius:32px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 72% 32%,rgba(216,163,47,.24),transparent 28%),linear-gradient(145deg,#15212b,#0b151f 60%,#071019);box-shadow:inset 0 1px rgba(255,255,255,.12),0 35px 80px rgba(0,0,0,.28)}.hero-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,rgba(255,255,255,.06),transparent 25%,transparent 70%,rgba(255,255,255,.025));pointer-events:none}.building{position:absolute;inset:60px 70px 0;filter:drop-shadow(0 35px 40px rgba(0,0,0,.45));transform:perspective(900px) rotateY(-8deg)}.tower{position:absolute;bottom:0;border:1px solid rgba(231,191,96,.35);background:repeating-linear-gradient(to bottom,rgba(255,215,124,.11) 0 2px,transparent 2px 38px),repeating-linear-gradient(to right,rgba(255,255,255,.08) 0 1px,transparent 1px 45px),linear-gradient(150deg,rgba(220,171,59,.17),rgba(7,15,23,.2));box-shadow:inset 0 0 45px rgba(215,154,23,.06)}.t1{left:4%;width:31%;height:72%}.t2{left:34%;width:38%;height:92%}.t3{right:0;width:29%;height:62%}.grid-lines{position:absolute;left:-20%;right:-20%;bottom:-3%;height:28%;background:repeating-linear-gradient(90deg,rgba(215,154,23,.16) 0 1px,transparent 1px 70px),repeating-linear-gradient(0deg,rgba(215,154,23,.12) 0 1px,transparent 1px 36px);transform:perspective(420px) rotateX(58deg);transform-origin:bottom}.project-glass{position:absolute;left:24px;bottom:24px;z-index:4;width:310px;padding:19px 20px;border-radius:22px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.045));backdrop-filter:blur(24px) saturate(150%);box-shadow:inset 0 1px rgba(255,255,255,.18),0 18px 50px rgba(0,0,0,.28)}.project-glass span{display:block;font-size:9px;letter-spacing:.2em;color:#e2ab31}.project-glass strong{display:block;font-family:Georgia,serif;font-size:22px;margin:6px 0}.project-glass small{color:#a9b2ba}.floating-chip{position:absolute;z-index:5;padding:8px 12px 8px 8px;border-radius:15px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.075);backdrop-filter:blur(20px);box-shadow:inset 0 1px rgba(255,255,255,.18),0 14px 30px rgba(0,0,0,.26);font-size:11px;font-weight:700}.floating-chip span{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:9px;background:rgba(255,255,255,.12);color:#efb733;margin-right:6px}.chip-a{right:22px;top:26%}.chip-b{right:8%;top:43%}
        .service-dock{width:min(1440px,calc(100vw - 44px));margin:18px auto 10px;position:relative;z-index:8;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.service-dock article{display:flex;align-items:center;gap:13px;min-height:82px;padding:14px;border-radius:22px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025));backdrop-filter:blur(20px);box-shadow:inset 0 1px rgba(255,255,255,.12),0 15px 35px rgba(0,0,0,.16)}.dock-icon{width:45px;height:45px;flex:0 0 45px;display:grid;place-items:center;border-radius:14px;color:#efb733;font-size:20px;background:linear-gradient(145deg,rgba(255,255,255,.15),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.1)}.service-dock b,.service-dock small{display:block}.service-dock b{font-family:Georgia,serif;font-size:15px}.service-dock small{color:#8f9aa4;margin-top:5px;line-height:1.3}
        @media(max-width:980px){.nav-pills{display:none}.hero{grid-template-columns:1fr}.hero-copy{padding:60px 12px}.hero-visual{min-height:480px}.service-dock{grid-template-columns:1fr 1fr}.glass-nav{width:calc(100vw - 28px)}.hero,.service-dock{width:calc(100vw - 28px)}}@media(max-width:600px){.glass-demo{padding:14px 0}.brand small{display:none}.contact-button>span:last-child{display:none}.contact-button{padding-right:9px}.hero h1{font-size:50px}.hero-actions{flex-direction:column;align-items:stretch}.primary-glass,.secondary-glass{justify-content:center}.hero-visual{min-height:400px}.building{inset:45px 24px 0}.project-glass{left:14px;right:14px;bottom:14px;width:auto}.floating-chip{display:none}.service-dock{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
