# Microsoft PowerPoint — Class C3-A Presentation Site

A modern, premium landing page for a school presentation about **Microsoft PowerPoint**
(Advantages • Disadvantages • Uses & More).

Presented by **Devaansh • Gowtham • Gowtham Ganesh** — Class **C3-A**.

## What's inside

```
├── netlify.toml            # Netlify config — publish directory = "public"
└── public/                 # ← the entire static website
    ├── index.html          # Landing page (hero, What You'll Learn, CTA, footer)
    ├── pre.pdf             # THE presentation PDF (16:9 deck)
    ├── presentation/
    │   └── index.html      # /presentation — clean PDF viewer page
    ├── css/styles.css
    └── js/main.js
```

## The PDF

- The presentation is always referenced as **`/pre.pdf`**.
- It must live at **`public/pre.pdf`** (root of the published site).
- **To update the deck: just replace `public/pre.pdf`** — nothing else changes.
- The shipped `pre.pdf` is a placeholder deck covering the same topics.

## Pages

| URL              | What it is                                                    |
| ---------------- | ------------------------------------------------------------- |
| `/`              | Landing page with the big **View Presentation →** button      |
| `/presentation`  | Clean viewer page — embeds `/pre.pdf` in a responsive iframe, with **← Back to Home** |

Every **View Presentation** button opens the `/presentation` viewer (which loads `/pre.pdf`);
the presentation page also offers *Open PDF* (new tab) and *Download* links for `/pre.pdf`.

## Run locally

Any static file server works — serve the `public/` folder as the site root:

```bash
cd public
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to Netlify

1. Push this repo to GitHub and connect it to Netlify (or drag-and-drop the folder).
2. Set **Publish directory = `public`** — Netlify will pick this up automatically from `netlify.toml`.
3. Done. No build step, no functions, no login.
