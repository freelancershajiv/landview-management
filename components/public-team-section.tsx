"use client";

import { useEffect, useState } from "react";

type PublicTeamMember = {
  name?: string;
  title?: string;
  department?: string;
  bio?: string;
  photoUrl?: string;
  linkedInUrl?: string;
};

function getPublicImageUrl(url?: string) {
  const value = String(url || "").trim();

  if (!value) return "";

  const fileMatch = value.match(
    /drive\.google\.com\/file\/d\/([^/?#]+)/i
  );

  if (fileMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
      fileMatch[1]
    )}&sz=w1000`;
  }

  try {
    const parsed = new URL(value);

    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");

      if (id) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
          id
        )}&sz=w1000`;
      }
    }
  } catch {
    // Leave non-standard URLs unchanged.
  }

  return value;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "LV"
  );
}

function bioLines(value?: string) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function PublicTeamSection() {
  const [team, setTeam] = useState<PublicTeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    fetch(`/api/public/team?t=${Date.now()}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const json = await response.json();

        if (!response.ok || !json?.success) {
          throw new Error("Unable to load team");
        }

        return Array.isArray(json.data) ? json.data : [];
      })
      .then((rows) => {
        if (active) setTeam(rows);
      })
      .catch(() => {
        if (active) setTeam([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="public-section public-team" id="team">
      <div className="public-container">
        <div className="public-section-head">
          <div>
            <span className="public-section-kicker">OUR TEAM</span>
            <h2>The people behind LAND VIEW.</h2>
          </div>

          <p>
            Architects, engineers and project professionals working together to
            carry design decisions through to practical delivery.
          </p>
        </div>

        {loading ? (
          <div className="public-team-empty">
            Loading team profiles…
          </div>
        ) : team.length ? (
          <div className="public-team-grid">
            {team.map((member, index) => {
              const name = String(member.name || "LAND VIEW Team");
              const lines = bioLines(member.bio);

              return (
                <article
                  className="public-team-card"
                  key={`${name}-${index}`}
                >
                  <div className="public-team-photo">
                    {member.photoUrl ? (
                      <img
                        src={getPublicImageUrl(member.photoUrl)}
                        alt={name}
                        loading="lazy"
                      />
                    ) : (
                      <span>{initials(name)}</span>
                    )}
                  </div>

                  <div className="public-team-copy">
                    <span className="public-team-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <h3>{name}</h3>

                    <strong>
                      {member.title ||
                        member.department ||
                        "Team Member"}
                    </strong>

                    {member.department &&
                    member.department !== member.title ? (
                      <small>{member.department}</small>
                    ) : null}

                    {lines.length ? (
                      <div className="public-team-bio">
                        {lines.map((line, lineIndex) => (
                          <span
                            className="public-team-bio-line"
                            key={`${name}-bio-${lineIndex}`}
                          >
                            {line}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {member.linkedInUrl ? (
                      <a
                        href={member.linkedInUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Professional profile <span>↗</span>
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="public-team-empty">
            Team profiles are being prepared. LAND VIEW administrators can
            publish employees from the Employees page.
          </div>
        )}
      </div>
    </section>
  );
}