# txt

txt is a web speed-reading app with a minimalist black UI.

I'm currently only interested on the web version since I feel like the idea of running the program on any computer without any setup, might make native apps in the future if I have good enough ideas though.

## What It Does

- One-word-at-a-time reading flow
- Red focus letter aligned to a center guide (ReedMax-inspired)
- Adjustable speed (300-400 WPM is recommended)
- Local persistence of documents, position, and settings

## Supported Imports (Web Prototype)

- `.txt`
- `.md`
- `.csv`
- `.json`
- `.docx`

## For local use

1. Clone the repository:
```bash
git clone https://github.com/R-Pax/txt.git txt
cd txt
```

2. Start a local server:
```bash
cd web
python3 -m http.server 4173
```

3. Open `http://localhost:4173`.

## Notes

- Local persistence is stored in browser using `localStorage`.
