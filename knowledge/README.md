# Writing knowledge base

Shelf Studio's listing copy is guided by the files in this folder. Every new job receives a frozen copy of the guide (`knowledge-snapshot.json` in the job folder), versioned by a hash of the guide text, so editing these files only affects new jobs.

- [style-guide.md](style-guide.md): voice, evidence hierarchy, title, bullet and description structure, and claim boundaries.
- [category-playbooks.md](category-playbooks.md): structure for common listing shapes (sets, gifts, unfamiliar products).
- [marketplace-rules.md](marketplace-rules.md): Amazon India and Flipkart field limits and image guidance, with sources, verified 6 September 2026.
- [policy-sources.json](policy-sources.json): the source ledger behind the marketplace rules, listed in the app's knowledge panel.

These guides are brand- and category-neutral. Writing examples that the seller approves in the app shape tone only; they never transfer product facts. External research does not refresh automatically.

## Knowledge packs

To specialise the writing for one brand or category, copy this folder, edit the three `.md` guides (keep the file names), and optionally add source ledgers named `amazon-sources.json`, `flipkart-sources.json` or `policy-sources.json`. Then start the app with:

```sh
STUDIO_KNOWLEDGE_DIR=/path/to/your-pack npm start
```
