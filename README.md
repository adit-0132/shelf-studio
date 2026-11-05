# Shelf Studio

A local web app that turns rough phone photos of a product into five catalog-style photographs and a full set of
marketplace listing copy, using the built-in image generation in your [Codex CLI](https://github.com/openai/codex)
login. No API key, no cloud service of its own: everything runs on your machine, one batch at a time.

It is built around **product fidelity**. Every generation call gets all of your original reference photos and strict
instructions to keep the product's exact shape, proportions, quantity, material, colours and decorative detail (fine
engraving, inlay, printed patterns), while changing the background, lighting, setting or camera angle.

## What you get per product

- **5 photographs** (landscape 3:2 PNG). Choose a photo set per batch:

  **Five scenes:** the same view in five settings and lighting moods.

  | Scene | Look |
  |---|---|
  | White studio | Seamless white, soft contact shadows, no props. A clean white-background shot. Amazon requires the main image to be a real photo of the product, so check your marketplace's rules before using any generated image as the main one |
  | Stone plinth | Travertine plinth, warm-grey backdrop, soft directional window light |
  | Natural linen | Light linen with soft folds, bright diffused daylight |
  | Festive setting | Warm walnut with softly blurred marigolds and brass diyas, warm glow |
  | Dark studio | Charcoal backdrop, low-key light with rim highlights on edges and texture |

  **Five camera angles:** the same product from five camera positions on plain settings, so the viewpoint is what
  varies.

  | View | Camera and setting |
  |---|---|
  | Eye-level ¾ | Product height, turned about 30°; white studio |
  | High angle | About 45° above, looking down; soft-daylight tabletop |
  | Low angle | Near the base looking up about 10°; white seamless |
  | Overhead | Steeply above, about 65°; pale stone |
  | Turned view | Orbited about 60° around the product; natural linen |

  New viewpoints can show parts that no reference photo shows, such as interiors, backs or bases. The prompt keeps
  those plain and tells the model never to invent new ornament, so supply photos from several sides when you can.

- **Listing copy**, checked against marketplace limits:
  - a catalogue title (up to 220 characters),
  - an Amazon title (up to 75) and Item Highlights (up to 125),
  - five feature bullets,
  - an Amazon description (up to 2,000) and a longer store description,
  - a specification table built from your exact inputs.

  Internal review notes flag missing or conflicting facts; they are never part of the customer-facing text.
- A ZIP with everything, plus per-image and plain-text downloads.

The copy follows a fact-first writing guide (`knowledge/`). It never infers grade, purity, plating, capacity, safety
or origin from a photo, and it never invents a brand.

> AI image generation redraws the product. The prompts are built to preserve detail, but very fine patterns or
> lettering can still drift. Review every image and claim before you publish a listing.

## Get started

You need **Node.js 22+** (no npm dependencies) and the **Codex CLI**, signed in with a ChatGPT plan that includes
image generation. Generation counts against that plan's usage limits.

```sh
npm install -g @openai/codex    # tested with codex-cli 0.156.1
codex login                     # sign in with your ChatGPT account

git clone https://github.com/adit-0132/shelf-studio.git
cd shelf-studio
npm start                       # then open http://localhost:4317
```

The header should say **Connected to Codex**. For step-by-step setup with a check at each step, a way to confirm that
Codex's image tool is available, and troubleshooting, see **[SETUP.md](SETUP.md)**. It's written for people and for
coding agents setting the app up on someone's behalf.

## Using it

Open <http://localhost:4317>. The gallery starts with example results, then:

1. Drop 1–5 photos of your product (PNG, JPEG or WebP; 10 MB each, 24 MB total). Several angles of the same product
   help; several different products appear together in every scene.
2. Optionally add the brand, product name or type, material, number of pieces, per-piece dimensions and weights, and
   comments. Comments mainly steer the copy (tone, care instructions, extra specs); photo requests are applied only
   when you ask for them explicitly.
3. Click **Generate complete listing**. Images and copy appear as they finish, usually within a few minutes.

Batches persist across restarts:
- **Retry** creates only the missing outputs.
- **Stop** keeps finished images.
- A batch interrupted by a restart waits for you to resume it, so nothing is charged twice automatically.

**Use as a writing example** saves a listing's style (never its facts) to guide the tone of later listings. Up to
three related examples are used.

## How Codex is used

For each batch the server runs:

```sh
codex exec --json --skip-git-repo-check --sandbox workspace-write \
  -C data/<batch-id> --output-last-message data/<batch-id>/response.txt -
```

The prompt goes in on stdin, and the arguments are passed without a shell. Codex works inside that batch's folder and
writes `outputs/<scene>.png` and `outputs/listing.json`. The app validates every file before showing it, and a batch
times out after 30 minutes. The exact prompt for every batch is saved as `request.txt` for review.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4317` | Local port. The server only binds `127.0.0.1`. |
| `STUDIO_DATA_DIR` | `./data` | Where batches are stored. |
| `STUDIO_KNOWLEDGE_DIR` | `./knowledge` | Writing guide to use. See [knowledge/README.md](knowledge/README.md) for making a brand or category pack. |
| `CODEX_BIN` | `codex` on `PATH` | Path to the Codex CLI. |
| `CODEX_MODEL` | your Codex default | Model for this app only, e.g. `CODEX_MODEL=gpt-6-luna npm start`. |

If a batch fails with `model_not_found`, the default model in `~/.codex/config.toml` isn't available to your account.
Set `CODEX_MODEL` to one that is. If listing copy arrives but no images do, your Codex session didn't expose the
built-in image generation tool (check `response.txt` in the batch folder). Make sure your ChatGPT plan includes image
generation, then sign in again with `codex logout && codex login`.

## Run at login (Linux, optional)

```sh
./linux/install.sh                          # or: CODEX_MODEL=<model> ./linux/install.sh
```

This installs a systemd user service and a **Shelf Studio** app-menu launcher for this clone. Re-run it after moving
the folder. To remove it:

```sh
systemctl --user disable --now shelf-studio
rm ~/.config/systemd/user/shelf-studio.service ~/.local/share/applications/shelf-studio.desktop
```

## Project layout

```
src/
  server.mjs      HTTP server, persistent job queue, Codex runner
  scenes.mjs      the scene and camera-angle presets, and the product-preservation prompt
  listing.mjs     listing schema, limits, validation and copy prompt
  knowledge.mjs   loads the writing guide; frozen snapshot per batch
  zip.mjs         dependency-free ZIP writer
public/           the web UI and example images
knowledge/        brand- and category-neutral writing guide
linux/            optional systemd service and launcher installer
test/             node:test suite
data/             your batches (created at runtime, gitignored)
```

Each batch folder holds:
- `inputs/`: your uploaded photos,
- `outputs/`: the PNGs and `listing.json`,
- `request.txt` and `response.txt`,
- `job.json`: the batch state,
- `knowledge-snapshot.json`: the guide version used.

## Tests

```sh
npm test
```

The tests cover:
- upload validation and local-only request guards,
- progress, completion and ZIP export,
- partial failure, retry, cancellation and queue order,
- restart recovery and symlink protection,
- listing validation.

They use temporary folders and a stub runner, so they never call Codex or generate images.

## Security notes

Shelf Studio is a personal local tool, not a hosted service. It listens on `127.0.0.1` only, and it rejects foreign
`Host` and `Origin` headers. POSTs require a per-session token, and pages are served with a strict Content Security
Policy. It never reads or exposes your Codex credentials.

## License

[GPL-3.0-or-later](LICENSE).

Shelf Studio is an independent project. It is not affiliated with or endorsed by OpenAI, Amazon or Flipkart.
