Public assets folder

- Place your logo image here. Recommended filename: logo.png
- Supported formats: .png, .jpg, .jpeg, .svg (SVG may not preview in all places; PNG recommended)
- After adding the file, the Logo component will load it from /logo.png by default.

To use a different name, either:
1) Rename your file to logo.png, or
2) Pass a custom src to the Logo component:

  <Logo src="/my-logo.svg" size={36} />

This folder is served statically by Vite at the site root.

Suggested images for the landing "Why Fluxfeed" section:
- bullber.png → Bearish/Bullish Streams icon
- aisignals.png → AI Signals icon
- traderfilters.png → Trader Filters icon

Place these files in this folder and the landing page will load them automatically.