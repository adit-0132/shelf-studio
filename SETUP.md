# Setup guide

Step-by-step setup for Product Studio, written so that a person can follow it by hand and a coding agent can follow
it on someone's behalf. Each step has a check with the expected result, so you always know whether it worked.

Tested on Fedora Linux 43 with Node.js 22 and Codex CLI 0.156.1. macOS should work the same way (untested). Windows is
untested.

## Checklist

1. [Node.js 22+](#1-nodejs-22) is installed.
2. [Codex CLI](#2-codex-cli) is installed.
3. Codex is [signed in with ChatGPT](#3-sign-in-to-codex).
4. Codex [offers its built-in image tool](#4-confirm-the-image-tool) (`image_gen__imagegen`).
5. The app is [cloned, tested and running](#5-get-and-start-the-app), and its header says **Connected to Codex**.
6. A [first batch](#6-first-batch) completes with 5 images and listing copy.

## For coding agents: read this first

You are setting this up for a person. Steps 1–5 are safe to run, and the step 4 check costs only a few thousand
tokens. Follow these rules:

- **The person signs in, not you.** `codex login` opens a browser for their ChatGPT account. Ask them to run it.
  - Never handle their credentials.
  - Never use `codex login --with-api-key` unless they ask; this app is built for ChatGPT sign-in.
- **Don't edit `~/.codex/config.toml` without asking.** It is their global Codex config. To change the model for this
  app only, use the `CODEX_MODEL` environment variable.
- **Never create an `AGENTS.md`** in this repo or any folder above the clone. Codex loads repo-root `AGENTS.md` files
  into every generation session the app starts. We verified that it does so even from the gitignored `data/<batch>/`
  folders. Put your own notes elsewhere. If `~/.codex/AGENTS.md` exists, tell the person: it is applied to every
  generation too.
- **Ask before running a real batch** (step 6). One batch uses about 5 image generations plus one listing from the
  person's ChatGPT plan.
- **No paid fallbacks.** The imagegen skill has a CLI fallback that needs `OPENAI_API_KEY` and is billed separately.
  The app tells Codex not to use it, and you shouldn't either.
- **Don't commit `data/`.** It holds the person's product photos; it is gitignored on purpose.
- **Don't edit the prompts** in `src/scenes.mjs` or `src/listing.mjs` to fix a setup problem. Setup failures are
  almost always about login, model or `PATH`; see [Troubleshooting](#troubleshooting).

Done means all of these hold:
- `npm test` passes.
- `GET /api/status` returns `"ready":true`.
- The step 4 check lists `image_gen__imagegen`.
- Optionally, if the person agrees: one batch completes.

## 1. Node.js 22+

```sh
node --version
```

Expected: `v22.x` or newer. If it's missing or older, install the current LTS from <https://nodejs.org> or with nvm
(`nvm install 22`). Product Studio has **no npm dependencies**, so there is nothing to `npm install`.

## 2. Codex CLI

```sh
npm install -g @openai/codex
codex --version
```

Expected: `codex-cli 0.156.1` or newer. Other install methods are listed at <https://github.com/openai/codex>.

If the global install fails with `EACCES`, give npm a user-owned prefix and put its `bin` on your `PATH`:

```sh
npm config set prefix ~/.local
export PATH="$HOME/.local/bin:$PATH"   # add this line to ~/.bashrc or ~/.zshrc too
npm install -g @openai/codex
```

## 3. Sign in to Codex

```sh
codex login          # opens a browser; sign in with your ChatGPT account
codex login status
```

Expected: `Logged in using ChatGPT`.

Your ChatGPT plan must include Codex image generation. If images used to work and then stopped, a lapsed or changed
subscription is the usual cause. Sign in again with `codex logout && codex login`.

## 4. Confirm the image tool

Run this from any empty folder. It lists the image tools available to Codex and generates nothing:

```sh
codex exec --skip-git-repo-check --sandbox read-only \
  "Diagnostic only. Do not generate, upload or modify anything. List the exact names of every tool available to you whose name contains 'image'. One per line, nothing else."
```

Expected output includes `image_gen__imagegen`.

| You see | Meaning | Fix |
|---|---|---|
| `image_gen__imagegen` | Ready | Continue |
| Only `view_image` and/or connector tools such as `mcp__codex_apps__canva_…` | This login or model has no built-in image generation | Check your plan, sign in again (step 3), then re-run this check |
| An error mentioning `model_not_found` | The default `model` in `~/.codex/config.toml` isn't available to your account | Run `codex` and type `/model` to see the models you can use. Re-run this check with `-m <model>` added, then either change your default or start the app with `CODEX_MODEL=<model>` |

## 5. Get and start the app

```sh
git clone https://github.com/adit-0132/product-studio.git
cd product-studio
npm test
npm start
```

Expected:
- `npm test` ends with `# pass 12` and `# fail 0`. The tests never call Codex.
- `npm start` prints `Product Studio is running at http://localhost:4317`.

Check the connection from a second terminal:

```sh
curl -s localhost:4317/api/status | head -c 120
```

Expected: `{"ready":true,"message":"Connected to Codex",…`. Open <http://localhost:4317>; the top-right corner should
say **Connected to Codex**, and the gallery shows five example results.

## 6. First batch

1. Drop 1–5 photos of one product (PNG, JPEG or WebP; 10 MB each, 24 MB total). Several angles of the same product
   help.
2. Optionally fill in brand, product name, material, piece count, dimensions and comments.
3. Click **Generate complete listing**.

Expected: the listing copy appears first, then the five images one by one. On the reference machine a batch took
about 4 minutes. Everything is saved in `data/<batch-id>/`:
- `outputs/`: the PNGs and `listing.json`,
- `request.txt`: the exact prompt sent to Codex,
- `response.txt`: Codex's final message,
- `job.json`: the batch state.

If the batch ends with copy but no images, read `data/<batch-id>/response.txt` and go back to
[step 4](#4-confirm-the-image-tool).

## Configuration

Set these as environment variables when starting the app, e.g. `PORT=4318 CODEX_MODEL=<model> npm start`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4317` | Local port. The server only listens on `127.0.0.1`. |
| `STUDIO_DATA_DIR` | `./data` | Where batches are stored. |
| `STUDIO_KNOWLEDGE_DIR` | `./knowledge` | Writing guide for listing copy (see [knowledge/README.md](knowledge/README.md)). |
| `CODEX_BIN` | `codex` on `PATH` | Full path to the Codex CLI, if the server can't find it. |
| `CODEX_MODEL` | your Codex default | Model for this app only. |

## Run at login (Linux, optional)

```sh
./linux/install.sh                          # or: CODEX_MODEL=<model> ./linux/install.sh
```

This installs a systemd user service and a **Product Studio** launcher in your app menu. It records the current
paths of `node` and `codex`, so re-run it after moving the folder or reinstalling either one.

Check it with `systemctl --user status product-studio`. Restart it with `systemctl --user restart product-studio`
after a `git pull`.

On macOS there is no autostart script; run `npm start` when you need it.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Header: "Install Codex CLI and run codex login…" | The server can't find `codex`. A systemd or launcher environment often has a different `PATH`. | Install Codex (step 2), or start with `CODEX_BIN="$(command -v codex)" npm start`. If you use the Linux service, re-run `./linux/install.sh`. |
| Header: "Run codex login in a terminal…" | Not signed in, or the session expired | `codex login`, then refresh the page |
| Batch fails at once with `model_not_found` | The default model isn't available to your account | Set `CODEX_MODEL` (see step 4) |
| Copy arrives but no images; `response.txt` mentions a missing image tool, Canva, or approval | Built-in image generation isn't available to this login | Step 4: check your plan and sign in again |
| `Port 4317 is in use` | Another copy is already running | Use the running one, or `PORT=4318 npm start` |
| A batch shows **interrupted** | The server restarted mid-batch | Open it and press **Retry**; only missing outputs are made |
| "Generation timed out" | The batch hit the 30-minute limit | Press **Retry** |
| Upload rejected | Wrong type or size | 1–5 PNG, JPEG or WebP files, 10 MB each, 24 MB total |
| Generations follow strange extra instructions | An `AGENTS.md` above the batch folder, or `~/.codex/AGENTS.md`, is being loaded | Remove or rename it |
| "Local access only" | Opened through a LAN IP or hostname | Use `http://localhost:4317`; remote access is blocked by design |

## Updating and uninstalling

- **Update:** run `git pull` and restart the app. Your batches in `data/` are kept.
- **Uninstall the Linux service:**
  ```sh
  systemctl --user disable --now product-studio
  rm ~/.config/systemd/user/product-studio.service ~/.local/share/applications/product-studio.desktop
  ```
  Then delete the folder. Your batches are in its `data/` folder; keep them if you need them.
