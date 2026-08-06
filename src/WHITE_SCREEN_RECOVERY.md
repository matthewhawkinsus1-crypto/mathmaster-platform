# MathMaster white-screen recovery

This build fixes a React startup crash in `src/App.jsx` where the `assignments`
state was referenced before it was declared. It also adds a visible React error
screen and removes optional Firebase Analytics startup initialization so preview
environments cannot prevent the application from rendering.

## Start the app

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open the local URL printed by Vite.

## If the port is already in use

```bash
pkill -f vite || true
npm run dev -- --host 0.0.0.0
```

## Browser reset

Hard refresh with Ctrl+Shift+R. If a service-worker or cached preview remains,
open the site in a private/incognito window.
