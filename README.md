# Chicken Race 3D

A static Three.js game. No build step or package installation is needed.

## Run locally

Serve this directory over HTTP (ES modules need HTTP rather than opening the
HTML file directly):

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>. Three.js is loaded from the CDN in the import map,
so an internet connection is required. GitHub Pages serves the same files as-is.

W/S or up/down arrows move; A/D or left/right arrows turn. Walk to the red
button and press E to race. Complete three laps before the red rival.
The rival uses the same chicken model as the player, with green parts recolored red.
It uses short steering taps and throttle changes within the player's movement
limits. It chooses different lines each lap, tries to pass or dodge nearby
players, defends against a player behind it, and occasionally makes small
steering mistakes before correcting.
Press Enter after the race to return to the lobby.
A red on-screen marker points toward the rival whenever it is out of view.
The countdown has arcade beeps, the race starts with a comic blast, and each
chicken squawks at its own random interval during the race. Audio starts when
you press E, which also satisfies browser sound permissions.
Four framed copies of `oreo portrait.png` hang on track walls, facing into the
course. Their positions and orientations are defined in `js/track.js`.
The lobby uses the road sketch on a compact 108-by-72 footprint. Each building
is about ten player chickens wide, scaled uniformly on all axes to preserve its
proportions. Building collisions use the same scaled dimensions.

## Structure

- `index.html` and `styles.css`: page markup and presentation.
- `js/main.js`: startup, UI updates, and animation loop.
- `js/input.js`: keyboard state and focus handling.
- `js/audio.js`: generated countdown, start, and chicken sounds.
- `js/game.js`: movement, collisions, countdown, rival AI, and race rules;
  independent of the DOM and Three.js.
- `js/track.js`: shared track and lobby layouts, wall bounds, and gameplay constants.
- `js/world.js`: Three.js scene, lobby building models, `chicken.glb` racers,
  animation, and camera.
- `js/paintings.js`: shared portrait texture and framed wall decorations.

Run the game-rule tests with Node.js 18 or newer:

```sh
npm test
```
