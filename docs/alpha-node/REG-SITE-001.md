# REG-SITE-001 — Estate Site Federation

Status: `ALPHA-RELEASE-003 / FIRST-SLICE`
Scope: Believers Common (BC), Creators Common (CC), Virtual Silk Road (VSR)
Containing node: `ALPHA-NODE-001`
Authority boundary: `WARDEN`

## Purpose

Connect the three public web surfaces without creating three competing identity, authority or Registry systems.

```text
Believers Common  <---- site navigation ---->  Creators Common
       \                                      /
        \                                    /
         +-------- Virtual Silk Road --------+
                         |
                         v
                 REG-SITE-001 / Alpha
                         |
                         v
                 Registry + Warden
```

## Canonical site roles

- **BC** — governance-and-participation entry surface.
- **CC** — creator-and-shared-commons surface.
- **VSR** — front-gate-and-participation-network surface.

These are projections/surfaces. They do not become separate sources of authority or separate identity truths.

## Connection contract

Every site must expose or consume the same minimal federation metadata:

- site id (`bc`, `cc`, `vsr`)
- canonical URL
- Alpha node id
- Registry object (`REG-SITE-001`)
- Warden authority boundary
- links to the other two sites
- central public read-only registry endpoint

Central endpoint:

- `/sites`
- `/.well-known/estate-sites`

## Identity/session boundary

Do not attempt to preserve DigitalMe continuity by sharing browser cookies across the three top-level domains.

The first slice uses public site federation only. A later authentication slice must use a Warden-issued, short-lived, audience-bound handoff artifact with replay protection and explicit return URL validation.

Therefore:

`SITE NAVIGATION != AUTHORIZATION`

and:

`CROSS-SITE SESSION != SHARED COOKIE`

## Failure rules

1. If the central site registry cannot be reached, each site must retain local static links to the other sites.
2. A site-registry outage must not prevent the local site from rendering.
3. A website may request a Warden flow but cannot self-issue authority.
4. Unknown site ids are rejected rather than guessed.
5. No site may silently rewrite another site's canonical identity.

## Next slice

After all three source sites carry this contract and their deployments/domains are verified, implement `REG-SITE-HANDOFF-001`:

`DigitalMe -> source site -> Warden handoff grant -> destination site -> replay check -> scoped session -> River evidence`

That handoff is deliberately not part of this public-linking slice.
