# File / folder icons

Runtime glyphs use **Material Icon Theme**
([vscode-material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme))
via inlined SVG (`MaterialFileIcon` + `material-icons.generated.ts`).

Regenerate after bumping the theme:

```bash
bun --filter @repo-prism/ui run gen:icons
```

Offline, no CDN — SVGs are bundled at build time.
