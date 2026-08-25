"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PublicHeader from "@/components/public-header";

type PublicTeamMember = {
  name?: string;
  title?: string;
  designation?: string;
  position?: string;
  department?: string;
  degree?: string;
  degrees?: string;
  speciality?: string;
  specialities?: string;
  bio?: string;
  photoUrl?: string;
  linkedInUrl?: string;
};

type PublicProject = {
  projectId?: string;
  title?: string;
  category?: string;
  coverImageUrl?: string;
};

const PUBLIC_POSITION_PREFIX = "__POSITION__:";

function imageUrl(url?: string, size = "w1600") {
  const value = String(url || "").trim();
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=${size}`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=${size}`;
    }
  } catch {}
  return value;
}

function isDegreeLine(value: string) {
  return /^(ph\.?d|doctorate|m\.?\s*sc|m\.?\s*s\.?c|b\.?\s*sc|b\.?\s*s\.?c|m\.?\s*arch|b\.?\s*arch|m\.?\s*eng|b\.?\s*eng|mba|bba|diploma|associate degree|master|bachelor)/i.test(value.trim());
}

function splitCredentialText(value?: string) {
  return String(value || "")
    .split(/\r?\n|\s*[•|]\s*|\s+-\s+(?=(?:Ph\.?D|Doctorate|M\.?\s*Sc|M\.?\s*S\.?c|B\.?\s*Sc|B\.?\s*S\.?c|M\.?\s*Arch|B\.?\s*Arch|M\.?\s*Eng|B\.?\s*Eng|MBA|BBA|Diploma|Associate Degree|Master|Bachelor)\b)/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitBio(value?: string) {
  let position = "";
  const contentLines: string[] = [];
  String(value || "").split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(PUBLIC_POSITION_PREFIX)) position = trimmed.slice(PUBLIC_POSITION_PREFIX.length).trim();
    else if (trimmed) contentLines.push(trimmed);
  });
  const degrees: string[] = [];
  const specialities: string[] = [];
  splitCredentialText(contentLines.join("\n")).forEach((item) => {
    if (isDegreeLine(item)) degrees.push(item);
    else specialities.push(item);
  });
  return { position, degrees, specialities };
}

function TeamCard({ member, index }: { member: PublicTeamMember; index: number }) {
  const parsedBio = splitBio(member.bio);
  const designation = member.designation || member.title || "";
  const position = member.position || parsedBio.position || "";
  const department = member.department || "";
  const explicitDegrees = splitCredentialText(member.degrees || member.degree || "");
  const degrees = explicitDegrees.length ? explicitDegrees : parsedBio.degrees;
  const specialityValue = member.specialities || member.speciality || "";
  const specialities = specialityValue ? splitCredentialText(specialityValue) : parsedBio.specialities;
  const initials = String(member.name || "LV").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();

  return (
    <article className="public-team-card lv-team-card">
      <div className="public-team-photo">
        {member.photoUrl ? <img src={imageUrl(member.photoUrl, "w1000")} alt={member.name || "LAND VIEW team member"} /> : <span>{initials}</span>}
      </div>
      <div className="public-team-copy">
        <span className="public-team-index">{String(index + 1).padStart(2, "0")}</span>
        <h3>
          {designation ? <><span className="public-team-designation">{designation}</span>{" "}</> : null}
          <span className="public-team-name">{member.name}</span>
        </h3>
        {position ? <div className="public-team-info-block"><span className="public-team-label">POSITION</span><strong>{position}</strong></div> : null}
        {department ? <div className="public-team-info-block"><span className="public-team-label">DEPARTMENT</span><strong>{department}</strong></div> : null}
        {degrees.length || specialities.length ? (
          <div className="public-team-info-block public-team-credentials">
            <span className="public-team-label">DEGREES &amp; SPECIALITIES</span>
            {degrees.length ? <div className="public-team-degrees">{degrees.map((item, i) => <small className="public-team-degree" key={`${item}-${i}`}>{item}</small>)}</div> : null}
            {specialities.length ? <div className="public-team-specialities">{specialities.map((item, i) => <span key={`${item}-${i}`}>{item}</span>)}</div> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

const TEAM_GROUPS = [
  {
    key: "structural",
    title: "Structural Engineers",
    description: "Structural engineering, civil engineering and building-structure design.",
    matches: ["structural", "structure", "civil engineering", "civil engineer"],
  },
  {
    key: "architects",
    title: "Architects",
    description: "Architecture, planning, visualization and architectural design.",
    matches: ["architecture", "architectural", "architect"],
  },
  {
    key: "electrical",
    title: "Electrical Engineers",
    description: "Electrical design, power, lighting and coordinated building services.",
    matches: ["electrical", "electric"],
  },
] as const;

function teamSearchText(member: PublicTeamMember) {
  return [member.department, member.position, member.designation, member.title, member.speciality, member.specialities]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function PublicTeamSection() {
  const [team, setTeam] = useState<PublicTeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadTeam() {
      try {
        const response = await fetch("/api/public/team", { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;
        const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.team) ? data.team : Array.isArray(data?.employees) ? data.employees : Array.isArray(data) ? data : [];
        setTeam(rows);
      } catch {
        if (!cancelled) setTeam([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTeam();
    return () => { cancelled = true; };
  }, []);

  const groupedTeam = TEAM_GROUPS.map((group) => ({
    ...group,
    members: team.filter((member) => {
      const text = teamSearchText(member);
      return group.matches.some((match) => text.includes(match));
    }),
  }));

  const categorizedMembers = new Set(groupedTeam.flatMap((group) => group.members));
  const otherMembers = team.filter((member) => !categorizedMembers.has(member));

  return (
    <section className="lv-section lv-team-section" id="team">
      <div className="public-container">
        <div className="lv-section-head">
          <div><span>OUR TEAM</span><h2>The people behind LAND VIEW.</h2></div>
          <p>Engineers and architects working together across design, technical coordination and project delivery.</p>
        </div>
        {loading ? (
          <div className="lv-empty">Loading team members...</div>
        ) : team.length ? (
          <div className="lv-team-groups">
            {groupedTeam.map((group) => (
              <section className="lv-team-group" key={group.key}>
                <div className="lv-team-group-head">
                  <div>
                    <span>LAND VIEW TEAM</span>
                    <h3>{group.title}</h3>
                  </div>
                  <p>{group.description}</p>
                </div>
                {group.members.length ? (
                  <div className="public-team-grid lv-team-grid">
                    {group.members.map((member, index) => <TeamCard key={`${group.key}-${member.name || "team"}-${index}`} member={member} index={index} />)}
                  </div>
                ) : (
                  <div className="lv-team-group-empty">Team members will appear here when assigned to this department.</div>
                )}
              </section>
            ))}
            {otherMembers.length ? (
              <section className="lv-team-group">
                <div className="lv-team-group-head"><div><span>LAND VIEW TEAM</span><h3>Other Team Members</h3></div><p>Additional professionals supporting LAND VIEW projects and delivery.</p></div>
                <div className="public-team-grid lv-team-grid">{otherMembers.map((member, index) => <TeamCard key={`other-${member.name || "team"}-${index}`} member={member} index={index} />)}</div>
              </section>
            ) : null}
          </div>
        ) : (
          <div className="lv-empty">No team members are available right now.</div>
        )}
      </div>
    </section>
  );
}

function Hero() {
  const [project, setProject] = useState<PublicProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadProject() {
      try {
        const response = await fetch("/api/public/projects", { cache: "no-store" });
        const data = await response.json();
        const rows: PublicProject[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        const featured = rows.find((item) => item.coverImageUrl) || rows[0] || null;
        if (!cancelled) setProject(featured);
      } catch {}
    }
    loadProject();
    return () => { cancelled = true; };
  }, []);

  const cover = imageUrl(project?.coverImageUrl);
  return (
    <section className="lv-hero" id="home">
      <div className="lv-hero-noise" />
      <div className="public-container lv-hero-grid">
        <div className="lv-hero-copy">
          <span className="lv-eyebrow">LAND VIEW ENGINEERS &amp; ARCHITECTS</span>
          <h1>DESIGNING BETTER.<br /><em>BUILDING SAFER.</em></h1>
          <div className="lv-gold-rule" />
          <p>LAND VIEW Engineers &amp; Architects delivers coordinated architectural, structural and technical design solutions focused on safety, clarity and practical construction.</p>
          <div className="lv-hero-actions">
            <a href="#services" className="lv-btn lv-btn-gold">Our Services</a>
            <Link href="/projects" className="lv-btn lv-btn-outline">View Projects</Link>
          </div>
        </div>
        <div className={`lv-hero-visual ${cover ? "has-photo" : ""}`} style={cover ? { backgroundImage: `linear-gradient(90deg, rgba(8,15,23,.26), rgba(8,15,23,.05)), url(${cover})` } : undefined}>
          {!cover && <><div className="lv-building"><span /><span /><span /><span /><span /></div><div className="lv-building-glow" /></>}
          <div className="lv-project-badge"><small>FEATURED WORK</small><strong>{project?.title || "Architecture & Engineering"}</strong><span>{project?.category || "LAND VIEW PROJECT"}</span></div>
        </div>
      </div>
      <div className="public-container lv-hero-services">
        <article><b>▥</b><div><strong>Architectural Design</strong><span>Creative &amp; functional design solutions.</span></div></article>
        <article><b>⌗</b><div><strong>Structural Design</strong><span>Safe, durable &amp; efficient structures.</span></div></article>
        <article><b>▣</b><div><strong>Project Coordination</strong><span>Quality control &amp; clear project delivery.</span></div></article>
        <article><b>⌂</b><div><strong>Site Supervision</strong><span>On-site monitoring for quality &amp; safety.</span></div></article>
      </div>
    </section>
  );
}

const services = [
  ["01", "Architectural Design", "Building planning, floor plans, elevations and architectural drawing packages developed around the site and client requirements.", "▥"],
  ["02", "Structural Design", "Structural analysis, reinforced-concrete design and detailing focused on safety, efficiency and practical construction.", "⌗"],
  ["03", "3D Design - Exterior", "Exterior 3D modeling and visualization to communicate building form, facade, materials and overall architectural character.", "◇"],
  ["04", "3D Design - Interior", "Interior 3D design and visualization for spatial planning, finishes, furniture concepts and presentation-ready views.", "◫"],
  ["05", "Electrical Design", "Electrical layouts for lighting, power points, distribution and coordinated building-service planning.", "⚡"],
  ["06", "Plumbing Design", "Water-supply, sanitary and drainage layouts coordinated with the architectural and structural design.", "≈"],
  ["07", "Estimate & Costing", "Quantity takeoff, BOQ preparation and project cost estimation to support budgeting and construction decisions.", "∑"],
  ["08", "Plan Approval", "Preparation and coordination of drawings and documents required for the building plan approval process.", "✓"],
  ["09", "Digital Survey", "Digital site and land survey support for accurate measurements, existing-condition information and project planning.", "⌖"],
  ["10", "Soil Test", "Soil investigation and testing support to provide geotechnical information for safe and appropriate foundation decisions.", "◉"],
];

const homeCss = `
  .public-site {
    --lv-gold: #d79a17;
    --lv-gold-light: #efb733;
    --lv-navy: #07101a;
    --lv-navy-2: #0b1621;
    --lv-panel: #101a24;
    --lv-line: rgba(255,255,255,.11);
    --lv-copy: #d8dde2;
    min-height: 100vh;
    overflow: hidden;
    background: var(--lv-navy);
    color: #fff;
  }
  .public-container { width: min(100% - 44px, 1320px); margin: 0 auto; }
  .lv-hero { position: relative; padding: 0 0 34px; overflow: hidden; background: radial-gradient(circle at 78% 30%, rgba(215,154,23,.12), transparent 30%), linear-gradient(115deg,#07111b,#0b1620 48%,#050a0f); }
  .lv-hero-noise { position: absolute; inset: 0; opacity: .18; pointer-events: none; background-image: linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px); background-size: 54px 54px; }
  .lv-hero-grid { position: relative; z-index: 2; min-height: 520px; display: grid; grid-template-columns: .92fr 1.08fr; align-items: stretch; }
  .lv-hero-copy { align-self: center; max-width: 610px; padding: 70px 48px 70px 0; }
  .lv-eyebrow { display: block; margin-bottom: 20px; color: #9aa5ae; font-size: 8px; font-weight: 900; letter-spacing: .22em; }
  .lv-hero h1 { margin: 0; color: #fff; font: 500 clamp(42px,5vw,68px)/.98 Georgia,"Times New Roman",serif; letter-spacing: .025em; text-shadow: 0 4px 18px rgba(0,0,0,.28); }
  .lv-hero h1 em { color: var(--lv-gold-light); font-style: normal; }
  .lv-gold-rule { width: 88px; height: 3px; margin: 24px 0 20px; background: var(--lv-gold); }
  .lv-hero-copy p { max-width: 580px; margin: 0; color: #d5dbe0; font-size: 14px; line-height: 1.8; }
  .lv-hero-actions { display: flex; gap: 12px; margin-top: 28px; }
  .lv-btn { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; padding: 0 24px; border-radius: 6px; font-size: 9px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; transition: .18s ease; }
  .lv-btn:hover { transform: translateY(-2px); }
  .lv-btn-gold { border: 1px solid var(--lv-gold-light); background: linear-gradient(180deg,#e9ae29,#c88709); color: #111820; box-shadow: 0 10px 25px rgba(0,0,0,.23); }
  .lv-btn-outline { border: 1px solid rgba(215,154,23,.78); background: rgba(3,9,14,.18); color: #fff; }
  .lv-hero-visual { position: relative; overflow: hidden; min-height: 500px; background: linear-gradient(160deg,#152331 0%,#0b141d 46%,#060b10 100%); background-size: cover; background-position: center; }
  .lv-hero-visual::before { content:""; position:absolute; inset:0; background: linear-gradient(90deg,#07101a 0%,rgba(7,16,26,.55) 12%,transparent 42%),linear-gradient(0deg,rgba(3,8,12,.7),transparent 42%); z-index:1; }
  .lv-building { position:absolute; right:8%; bottom:4%; width:72%; height:78%; border:1px solid rgba(255,255,255,.18); transform:perspective(700px) rotateY(-8deg); background:linear-gradient(90deg,rgba(215,154,23,.08),transparent 2%),linear-gradient(120deg,#1d2b36,#0d161e); box-shadow:0 25px 50px rgba(0,0,0,.4); }
  .lv-building::before { content:""; position:absolute; inset:8% 7% 12%; background:repeating-linear-gradient(90deg,rgba(255,255,255,.07) 0 2px,transparent 2px 14%),repeating-linear-gradient(0deg,rgba(255,255,255,.06) 0 2px,transparent 2px 25%); }
  .lv-building::after { content:""; position:absolute; left:-20%; bottom:-1px; width:42%; height:54%; border:1px solid rgba(255,255,255,.15); background:#111d27; }
  .lv-building span { position:absolute; width:26%; height:3px; background:var(--lv-gold); box-shadow:0 0 18px rgba(215,154,23,.8); }
  .lv-building span:nth-child(1){left:12%;top:25%}.lv-building span:nth-child(2){left:46%;top:25%}.lv-building span:nth-child(3){left:12%;top:54%}.lv-building span:nth-child(4){left:46%;top:54%}.lv-building span:nth-child(5){left:46%;top:80%}
  .lv-building-glow { position:absolute; right:14%; bottom:7%; width:60%; height:24%; background:radial-gradient(ellipse,rgba(215,154,23,.2),transparent 65%); filter:blur(8px); }
  .lv-project-badge { position:absolute; z-index:3; right:22px; bottom:22px; max-width:270px; padding:16px 18px; border-left:3px solid var(--lv-gold); background:rgba(5,12,18,.86); backdrop-filter:blur(8px); }
  .lv-project-badge small,.lv-project-badge strong,.lv-project-badge span{display:block}.lv-project-badge small{color:var(--lv-gold-light);font-size:7px;font-weight:900;letter-spacing:.15em}.lv-project-badge strong{margin-top:6px;font:500 17px/1.15 Georgia,"Times New Roman",serif}.lv-project-badge span{margin-top:5px;color:#8d98a2;font-size:7px;letter-spacing:.08em}
  .lv-hero-services { position:relative; z-index:4; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border:1px solid rgba(255,255,255,.22); border-radius:14px; overflow:hidden; background:rgba(8,15,22,.92); box-shadow:0 18px 40px rgba(0,0,0,.28); }
  .lv-hero-services article { min-height:102px; display:flex; align-items:center; gap:16px; padding:20px 24px; border-right:1px solid rgba(255,255,255,.14); }
  .lv-hero-services article:last-child{border-right:0}.lv-hero-services b{width:44px;flex:0 0 44px;color:var(--lv-gold-light);font-size:28px;text-align:center}.lv-hero-services strong,.lv-hero-services span{display:block}.lv-hero-services strong{font-size:11px;text-transform:uppercase;letter-spacing:.03em}.lv-hero-services span{margin-top:7px;color:#c3c9cf;font-size:10px;line-height:1.5}
  .lv-section { padding:92px 0; background:#0a121b; color:#fff; }
  .lv-section:nth-of-type(even){background:#0d1721}.lv-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:50px;margin-bottom:40px}.lv-section-head>div{max-width:720px}.lv-section-head>div>span{display:block;margin-bottom:12px;color:var(--lv-gold-light);font-size:8px;font-weight:900;letter-spacing:.2em}.lv-section-head h2{margin:0;font:500 clamp(34px,4vw,54px)/1 Georgia,"Times New Roman",serif;letter-spacing:-.025em}.lv-section-head>p{max-width:400px;margin:0;color:#9ba5ae;font-size:11px;line-height:1.75}
  .lv-services-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid var(--lv-line);border-left:1px solid var(--lv-line)}.lv-service-card{position:relative;min-height:260px;padding:24px;border-right:1px solid var(--lv-line);border-bottom:1px solid var(--lv-line);background:#101b25;transition:.2s ease}.lv-service-card:hover{z-index:2;transform:translateY(-4px);background:#142330;box-shadow:0 18px 36px rgba(0,0,0,.25)}.lv-service-top{display:flex;align-items:center;justify-content:space-between}.lv-service-top span{color:#667482;font-size:8px;font-weight:900}.lv-service-top b{width:40px;height:40px;display:grid;place-items:center;border:1px solid #33404b;color:var(--lv-gold-light);font-size:18px}.lv-service-card h3{margin:38px 0 0;font:500 20px/1.12 Georgia,"Times New Roman",serif}.lv-service-card p{margin:14px 0 0;color:#96a2ac;font-size:10px;line-height:1.72}.lv-service-card a{position:absolute;left:24px;bottom:22px;color:var(--lv-gold-light);font-size:7px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
  .lv-about{position:relative;overflow:hidden;padding:100px 0;background:linear-gradient(120deg,#07101a,#111d28);color:#fff}.lv-about::after{content:"";position:absolute;inset:0;opacity:.18;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:58px 58px}.lv-about-grid{position:relative;z-index:2;display:grid;grid-template-columns:1.15fr .85fr;gap:70px;align-items:center}.lv-about-copy>span{color:var(--lv-gold-light);font-size:8px;font-weight:900;letter-spacing:.2em}.lv-about-copy h2{margin:14px 0 0;font:500 clamp(36px,4.4vw,58px)/1 Georgia,"Times New Roman",serif}.lv-about-copy p{max-width:650px;margin:20px 0 0;color:#abb5be;font-size:12px;line-height:1.82}.lv-about-card{padding:28px;border:1px solid rgba(215,154,23,.35);border-top:5px solid var(--lv-gold);background:#0c1721;box-shadow:0 20px 42px rgba(0,0,0,.3)}.lv-about-card>span{display:block;margin-bottom:8px;color:var(--lv-gold-light);font-size:8px;font-weight:900;letter-spacing:.14em}.lv-about-row{display:grid;grid-template-columns:42px 1fr;gap:14px;padding:19px 0;border-top:1px solid var(--lv-line)}.lv-about-row>b{color:#596773;font-size:9px}.lv-about-row strong,.lv-about-row small{display:block}.lv-about-row strong{font:500 18px Georgia,"Times New Roman",serif}.lv-about-row small{margin-top:7px;color:#8f9ba5;font-size:9px;line-height:1.6}
  .lv-team-section{background:#0b141d}.lv-team-groups{display:grid;gap:58px}.lv-team-group{display:grid;gap:22px}.lv-team-group-head{display:flex;align-items:end;justify-content:space-between;gap:30px;padding-bottom:16px;border-bottom:1px solid #2b3843}.lv-team-group-head>div>span{display:block;margin-bottom:7px;color:var(--lv-gold-light);font-size:7px;font-weight:900;letter-spacing:.18em}.lv-team-group-head h3{margin:0;font:500 clamp(24px,3vw,34px)/1.05 Georgia,"Times New Roman",serif}.lv-team-group-head>p{max-width:390px;margin:0;color:#89959f;font-size:10px;line-height:1.65;text-align:right}.lv-team-group-empty{padding:24px;border:1px dashed #34414c;color:#77838c;font-size:10px;text-align:center}.lv-team-grid{display:flex!important;flex-wrap:wrap;justify-content:center;gap:18px!important}.lv-team-grid>.lv-team-card{flex:0 1 calc((100% - 54px)/4);max-width:calc((100% - 54px)/4);width:100%}.lv-team-card{border:1px solid #2b3843!important;background:#101a24!important;color:#fff!important;box-shadow:0 14px 34px rgba(0,0,0,.22)!important}.lv-team-card .public-team-designation,.lv-team-card .public-team-label{color:var(--lv-gold-light)!important}.lv-team-card .public-team-name,.lv-team-card .public-team-info-block strong,.lv-team-card .public-team-degree{color:#fff!important}.lv-team-card .public-team-specialities,.lv-team-card .public-team-specialities span{color:#99a5ae!important}.lv-team-card .public-team-info-block{border-color:#2b3843!important}.lv-team-card .public-team-photo{border-color:var(--lv-gold)!important}.lv-team-card .public-team-photo span{background:#07101a!important}.lv-empty{padding:38px;border:1px solid #2b3843;background:#101a24;color:#aab4bc;text-align:center}
  .lv-projects{background:#07101a}.lv-projects-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.lv-project-card{min-height:250px;display:flex;flex-direction:column;padding:26px;border:1px solid #2a3640;background:linear-gradient(145deg,#12202b,#0b141d);transition:.2s ease}.lv-project-card:hover{transform:translateY(-4px);border-color:#6d5624;box-shadow:0 18px 35px rgba(0,0,0,.24)}.lv-project-card>span{color:var(--lv-gold-light);font-size:8px;font-weight:900;letter-spacing:.15em}.lv-project-card h3{margin:48px 0 0;font:500 25px/1.1 Georgia,"Times New Roman",serif}.lv-project-card p{margin:13px 0 0;color:#94a1ab;font-size:10px;line-height:1.7}.lv-project-card a{margin-top:auto;padding-top:24px;color:var(--lv-gold-light);font-size:8px;font-weight:900;letter-spacing:.06em}
  .lv-process{background:#0d1721}.lv-process-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid #34414c;border-left:1px solid #34414c}.lv-process-grid article{min-height:210px;padding:26px;border-right:1px solid #34414c;border-bottom:1px solid #34414c;background:#101b25}.lv-process-grid span{color:var(--lv-gold-light);font-size:8px;font-weight:900}.lv-process-grid h3{margin:42px 0 0;font:500 23px Georgia,"Times New Roman",serif}.lv-process-grid p{margin:12px 0 0;color:#8f9ba5;font-size:10px;line-height:1.7}
  .lv-contact{padding:88px 0;background:linear-gradient(125deg,#101b25,#07101a);border-top:1px solid rgba(215,154,23,.25);color:#fff}.lv-contact-grid{display:grid;grid-template-columns:1fr .85fr;gap:70px;align-items:center}.lv-contact-copy>span{color:var(--lv-gold-light);font-size:8px;font-weight:900;letter-spacing:.2em}.lv-contact h2{margin:14px 0 0;font:500 clamp(35px,4vw,54px)/1 Georgia,"Times New Roman",serif}.lv-contact p{max-width:580px;margin:18px 0 26px;color:#9ba6af;font-size:11px;line-height:1.75}.lv-contact-card{padding:24px 28px;border:1px solid #34414c;background:#0b151e}.lv-contact-card>div{padding:16px 0;border-top:1px solid #2c3944}.lv-contact-card>div:first-child{border-top:0}.lv-contact-card span{display:block;margin-bottom:6px;color:var(--lv-gold-light);font-size:7px;font-weight:900;letter-spacing:.12em}.lv-contact-card strong,.lv-contact-card a{color:#fff;font-size:11px}.lv-contact-card p{margin:5px 0 0;font-size:9px}
  .lv-footer{padding:36px 0;border-top:1px solid #25313b;background:#050a0f;color:#fff}.lv-footer-grid{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:30px}.lv-footer-brand{display:flex;align-items:center;gap:12px}.lv-footer-brand img{width:54px;height:54px}.lv-footer-brand strong,.lv-footer-brand span{display:block}.lv-footer-brand strong{font-family:Georgia,"Times New Roman",serif;font-size:15px;letter-spacing:.1em}.lv-footer-brand span{margin-top:5px;color:#77838c;font-size:6px;letter-spacing:.17em}.lv-footer-links{display:flex;gap:18px}.lv-footer-links a{color:#9ca6ae;font-size:8px;font-weight:800;text-transform:uppercase}.lv-footer-links a:hover{color:var(--lv-gold-light)}.lv-footer-copy{text-align:right}.lv-footer-copy span,.lv-footer-copy small{display:block}.lv-footer-copy span{font-size:8px;color:#9ca6ae}.lv-footer-copy small{margin-top:5px;color:#59656e;font-size:7px}
  html[data-public-theme="light"] .public-site{background:#f3f1eb;color:#17202a}.public-site[data-x]{display:block}html[data-public-theme="light"] .lv-section,html[data-public-theme="light"] .lv-team-section,html[data-public-theme="light"] .lv-projects{background:#f3f1eb;color:#17202a}html[data-public-theme="light"] .lv-service-card,html[data-public-theme="light"] .lv-team-card,html[data-public-theme="light"] .lv-project-card,html[data-public-theme="light"] .lv-process-grid article,html[data-public-theme="light"] .lv-empty{background:#fff!important;color:#17202a!important;border-color:#d8d4ca!important}html[data-public-theme="light"] .lv-section-head>p,html[data-public-theme="light"] .lv-service-card p,html[data-public-theme="light"] .lv-project-card p,html[data-public-theme="light"] .lv-process-grid p{color:#6f7478}html[data-public-theme="light"] .lv-team-card .public-team-name,html[data-public-theme="light"] .lv-team-card .public-team-info-block strong,html[data-public-theme="light"] .lv-team-card .public-team-degree{color:#17202a!important}html[data-public-theme="light"] .lv-team-group-head{border-color:#d8d4ca}html[data-public-theme="light"] .lv-team-group-head>p{color:#6f7478}html[data-public-theme="light"] .lv-team-group-empty{border-color:#d8d4ca;color:#777}
  @media(max-width:1100px){.lv-services-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.lv-team-grid>.lv-team-card{flex-basis:calc((100% - 18px)/2);max-width:calc((100% - 18px)/2)}.lv-hero-services{grid-template-columns:repeat(2,minmax(0,1fr))}.lv-hero-services article:nth-child(2){border-right:0}.lv-hero-services article:nth-child(-n+2){border-bottom:1px solid rgba(255,255,255,.14)}}
  @media(max-width:850px){.lv-hero-grid{grid-template-columns:1fr}.lv-hero-copy{padding:58px 0 42px}.lv-hero-visual{min-height:360px}.lv-about-grid,.lv-contact-grid{grid-template-columns:1fr}.lv-section-head{align-items:flex-start;flex-direction:column;gap:18px}.lv-team-group-head{align-items:flex-start;flex-direction:column;gap:10px}.lv-team-group-head>p{text-align:left}.lv-projects-grid{grid-template-columns:1fr}.lv-process-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lv-footer-grid{grid-template-columns:1fr;text-align:center}.lv-footer-brand,.lv-footer-links{justify-content:center}.lv-footer-copy{text-align:center}}
  @media(max-width:620px){.public-container{width:min(100% - 28px,1320px)}.lv-hero h1{font-size:42px}.lv-hero-services{grid-template-columns:1fr}.lv-hero-services article{border-right:0;border-bottom:1px solid rgba(255,255,255,.14)}.lv-hero-services article:last-child{border-bottom:0}.lv-services-grid{grid-template-columns:1fr}.lv-team-grid>.lv-team-card{flex-basis:100%;max-width:100%}.lv-team-groups{gap:42px}.lv-process-grid{grid-template-columns:1fr}.lv-section{padding:68px 0}.lv-about{padding:72px 0}.lv-hero-actions{flex-direction:column}.lv-btn{width:100%}}
`;

export default function PublicHomePage() {
  return (
    <main className="public-site">
      <style dangerouslySetInnerHTML={{ __html: homeCss }} />
      <PublicHeader />
      <Hero />

      <section className="lv-section" id="services">
        <div className="public-container">
          <div className="lv-section-head"><div><span>WHAT WE DO</span><h2>Complete building design and technical services.</h2></div><p>One coordinated consultancy for architecture, structure, visualization, building services, costing, approval, survey and soil investigation.</p></div>
          <div className="lv-services-grid">{services.map(([number,title,text,icon]) => <article className="lv-service-card" key={number}><div className="lv-service-top"><span>{number}</span><b>{icon}</b></div><h3>{title}</h3><p>{text}</p><a href="#contact">Discuss your project →</a></article>)}</div>
        </div>
      </section>

      <section className="lv-about" id="about"><div className="public-container lv-about-grid"><div className="lv-about-copy"><span>ABOUT LAND VIEW</span><h2>Designing better. Building safer.</h2><p>LAND VIEW Engineers &amp; Architects approaches each project as one coordinated design problem—not separate architectural, structural and technical tasks.</p><p>Our goal is a clearer path from concept to drawings to site, with technical decisions considered early and communicated clearly.</p><div className="lv-hero-actions"><a href="#contact" className="lv-btn lv-btn-gold">Work with LAND VIEW</a></div></div><div className="lv-about-card"><span>OUR APPROACH</span><div className="lv-about-row"><b>01</b><div><strong>Integrated</strong><small>Architecture and engineering coordinated together.</small></div></div><div className="lv-about-row"><b>02</b><div><strong>Practical</strong><small>Solutions shaped for real construction conditions.</small></div></div><div className="lv-about-row"><b>03</b><div><strong>Accountable</strong><small>Clear documentation and project follow-through.</small></div></div></div></div></section>

      <PublicTeamSection />

      <section className="lv-section lv-projects" id="projects"><div className="public-container"><div className="lv-section-head"><div><span>FEATURED WORK</span><h2>Designed for the way projects are actually built.</h2></div><p>Explore LAND VIEW architectural and engineering work selected for public display.</p></div><div className="lv-projects-grid"><article className="lv-project-card"><span>ARCHITECTURE</span><h3>Residential Design</h3><p>Efficient homes planned around daylight, circulation, privacy and buildable detailing.</p><Link href="/projects">View Projects →</Link></article><article className="lv-project-card"><span>ENGINEERING</span><h3>Structural Design</h3><p>Coordinated structural systems developed for safety, economy and construction practicality.</p><Link href="/projects">View Projects →</Link></article><article className="lv-project-card"><span>DELIVERY</span><h3>Site &amp; Project Support</h3><p>Design-to-site coordination with supervision, documentation and professional follow-through.</p><Link href="/projects">View Projects →</Link></article></div></div></section>

      <section className="lv-section lv-process" id="process"><div className="public-container"><div className="lv-section-head"><div><span>HOW WE WORK</span><h2>A clear path from brief to delivery.</h2></div></div><div className="lv-process-grid"><article><span>01</span><h3>Brief</h3><p>Understand the site, requirements, budget and project goals.</p></article><article><span>02</span><h3>Design</h3><p>Develop coordinated architectural and engineering solutions.</p></article><article><span>03</span><h3>Documentation</h3><p>Prepare drawings and technical information for execution.</p></article><article><span>04</span><h3>Delivery</h3><p>Support construction with supervision and project coordination.</p></article></div></div></section>

      <section className="lv-contact" id="contact"><div className="public-container lv-contact-grid"><div className="lv-contact-copy"><span>START A CONVERSATION</span><h2>Planning a building or engineering project?</h2><p>Tell us what you are planning. LAND VIEW can help define the right architectural, structural and technical service scope.</p><a href="mailto:landviewcivil@gmail.com" className="lv-btn lv-btn-gold">Email LAND VIEW</a></div><div className="lv-contact-card"><div><span>OFFICE</span><strong>F. Rahman AC Market (2nd Floor)</strong><p>S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</p></div><div><span>EMAIL</span><a href="mailto:landviewcivil@gmail.com">landviewcivil@gmail.com</a></div><div><span>ENGINEERING</span><a href="tel:+8801408080400">+88 0140 8080 400</a></div><div><span>ARCHITECTURE</span><a href="tel:+8801902500400">+88 01902 500 400</a></div></div></div></section>

      <footer className="lv-footer"><div className="public-container lv-footer-grid"><div className="lv-footer-brand"><img src="/land-view-logo.svg" alt="LAND VIEW" /><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div></div><div className="lv-footer-links"><a href="#about">About</a><a href="#services">Services</a><Link href="/projects">Projects</Link><a href="#team">Team</a><a href="#contact">Contact</a></div><div className="lv-footer-copy"><span>© 2026 LAND VIEW</span><small>Designing Better. Building Safer.</small></div></div></footer>
    </main>
  );
}
