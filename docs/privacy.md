# Gitufy — Privacy summary

Everything Gitufy stores stays **on your device**. There is no Gitufy backend and
no analytics server.

- **What is stored**: your GitHub access token (encrypted, see `security.md`), the
  non-secret profile mirror (username, avatar URL) for instant cold-start, and your
  app settings.
- **What leaves the device**: only requests to `github.com` / `api.github.com`
  made with your token, and (if you opt in) anonymous, PII-free funnel counters.
- **What is never stored**: no plaintext token, no client secret in the primary
  flow, no token in logs, crash reports, backups, clipboard history (device codes
  are marked sensitive and auto-cleared), or URLs.
- **Logout** wipes every token, cached profile and local data, and offers a shortcut
  to also remove Gitufy's access on GitHub.
- **Permissions**: only `read:user` and `repo` are requested at first login; extra
  scopes are requested just-in-time when you use the matching feature.
