from pathlib import Path


def patch_file(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if new in text:
        print(f"{label}: already patched")
        return
    if old not in text:
        raise SystemExit(f"{label}: anchor not found")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"{label}: patched")


# A login response can set the HttpOnly landview_session cookie and resolve before
# a client-side App Router transition finishes. Use a full navigation after a
# successful login so the next /employee request always starts with the freshly
# committed cookie and cannot reuse stale router state.
patch_file(
    "app/login/page.tsx",
    '      router.replace(portalPath(portal));',
    '      window.location.replace(portalPath(portal));',
    "login full navigation",
)

# This comment intentionally keeps the permission-rewrite pipeline retriggerable.
print("Employee login transition hardening applied")
