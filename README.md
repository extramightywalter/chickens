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

W/S or up/down arrows move; A/D or left/right arrows turn. House and shop
entrances are open. Walk through the lobby arch at the end of the road to the
red button inside, then press E to open the minigame menu. Choose **Random** for
the existing equal 50/50 Race or Pillow Dodge selection, or choose **Choose
minigame** to start either game directly.

- **Race:** Complete three laps before the red rival.
- **Pillow Dodge:** Survive longer than the rival in a small enclosed arena.
  Cannons outside the arena aim and fire blue pillows alternately at each
  chicken's position. Both chickens start with three lives, shown in the HUD.
  Each pillow hit removes one life and consumes that pillow; the first chicken
  to run out of lives loses. Simultaneous final hits are a draw.
  The overhead camera shows incoming pillows and both chickens.
  The rival uses the same forward/turn controls, speed, and boundaries as you,
  with reaction delays. It eventually tires after 22-28 seconds and stops
  dodging, so incoming pillows will eventually use up its remaining lives if
  you survive long enough.

The rival uses the same chicken model as the player, with green parts recolored red.
It uses short steering taps and throttle changes within the player's movement
limits. It chooses different lines each lap, tries to pass or dodge nearby
players, defends against a player behind it, and occasionally makes small
steering mistakes before correcting.
Both minigames start with a three-second countdown. Press Enter after either
minigame to return to the lobby, standing on the red button.
A red on-screen marker points toward the rival whenever it is out of view.
The countdown has arcade beeps, the race starts with a comic blast, and each
chicken squawks at its own random interval during either minigame. Audio starts when
you press E, which also satisfies browser sound permissions.
Four framed copies of `oreo portrait.png` hang on track walls, facing into the
course. Their positions and orientations are defined in `js/track.js`.
The lobby uses the road sketch on a compact 108-by-72 footprint. Houses and the
lobby building are about ten player chickens wide; the shop is scaled to three
times that size. All structures are scaled uniformly to preserve proportions.
Houses and shop have collision bounds around their visible footprints, with
entrances open; the lobby building itself is passable. The houses face away
from the central path.

## Structure

- `index.html` and `styles.css`: page markup and presentation.
- `js/main.js`: startup, UI updates, and animation loop.
- `js/input.js`: keyboard state and focus handling.
- `js/audio.js`: generated countdown, start, and chicken sounds.
- `js/lobby.js`: movement, collisions, countdown, rival AI, and race rules;
  independent of the DOM and Three.js.
- `js/pillows.js`: equal-chance minigame list, pillow arena, throws, hit detection,
  and rival dodge decisions; independent of the DOM and Three.js.
- `js/track.js`: shared track and lobby layouts, wall bounds, and gameplay constants.
- `js/world.js`: Three.js scene, lobby building models, `assets/models/chicken.glb` racers,
  animation, and camera.
- `js/paintings.js`: shared portrait texture and framed wall decorations.
- `assets/models/`: GLB models used by the game and additional model assets.
- `pillow.glb`: supplied pillow model used for incoming projectiles.

Run the game-rule tests with Node.js 18 or newer:

```sh
npm test
```
