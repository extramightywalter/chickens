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
an equal one-in-three Race, Pillow Dodge, or Door Dash selection, or choose
**Choose minigame** to start any game directly.
During a game, press **E** to spin for two seconds (movement is half speed) or
press **Space** to dive forward. Each ability has its own three-second cooldown.

- **Race:** Start beneath the course arch. The first racer to touch the red
  landing at the far-side finish wins.
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
- **Door Dash:** Race the rival down a walled path through four evenly spaced
  gates (`assets/models/double-doors.glb`). Each gate has two arched doors: one
  secretly opens only for you and the other only for the rival, with a new
  random combination every playthrough. A locked door rattles and stays shut.
  The rival guesses too, switches after bumping a locked door, and works out
  its door when it sees you pass through yours. A monster (`assets/models/monster.glb`)
  walks behind you both at 85% of chicken speed and chases whoever is last.
  If it touches one chicken, the other wins; otherwise the first chicken past
  the yellow finish line wins. The camera stays locked directly behind you,
  and the monster turns translucent when it is close behind you.

The red rival uses the same chicken model and movement limits as the player.
In Race, it follows the supported course tiles from the arch to the far-side
finish and can also win by touching the red landing there.
All minigames start with a three-second countdown. Press Enter after any
minigame to return to the lobby, standing on the red button.
A red on-screen marker points toward the rival whenever it is out of view.
The countdown has arcade beeps, the race starts with a comic blast, and each
chicken squawks at its own random interval during any minigame. Audio starts when
you press E, which also satisfies browser sound permissions.
The race course uses `race-track.glb`, scaled to five times its original size.
`js/track.js` maps its flat ground tiles and route from the arch to the far-side
finish. Racers stay at the ground level, cannot climb raised blocks, and fall
when they leave a supported tile. The green ground is hidden during races so
falls are visible.
The lobby uses the road sketch on a compact 108-by-72 footprint. Houses and the
lobby building are about ten player chickens wide; the shop is scaled to three
times that size. All structures are scaled uniformly to preserve proportions.
Houses and shop have collision bounds around their visible footprints, with
entrances open; the lobby building itself is passable. The houses face away
from the central path.
Laness stands to the right of the starting player, beside a road connected to
the spawn by a small side road. Its entire front and back are open for walking
through; only its side walls block movement.

## LAN games (2-8 players)

For real multiplayer, one computer runs the included Node.js server (Node.js 18
or newer, no packages to install):

```sh
npm start
```

The host opens <http://localhost:8000>. Other players on the same local network
open `http://<host-computer-LAN-IP>:8000`. Allow TCP port 8000 through the host's
firewall if needed. Set `PORT` to use another port. All players must use the
same server; GitHub Pages and the Python static server support solo games only.
Three.js still loads from the CDN, so each device needs internet access.

Walk into Laness and go to the **blue button on its right side**, then press
**E**. Choose **Host a game**, select **Random** or any of the same three
minigames offered at the red button, and choose **2-8 slots**. The host fills
the first slot. Other players choose **Play a game** and click a game in the
live list to join. The shared three-second countdown starts automatically
when the final slot fills; there are no AI players or extra Start buttons.

All chickens, controls, abilities, hazards, and results are synchronized by the server.
Race starts beneath the arch and is won by reaching the far-side finish or
touching the red landing there.
Pillow Dodge eliminates chickens at zero lives
and continues until one remains. Door Dash assigns alternating players to
opposite secret doors at each gate; caught chickens are eliminated, and the
first finisher (or last survivor) wins. Simultaneous winners share a victory;
simultaneous final eliminations are a draw.

Leave a waiting room to free your slot; if the host leaves, the room closes.
If anyone disconnects during a round, it ends for everyone with a notice.
Press Enter after a round to leave and return to the LAN button. The original
red-button minigame selection remains unchanged.

## Structure

- `index.html` and `styles.css`: page markup and presentation.
- `js/main.js`: startup, UI updates, and animation loop.
- `server.js`: static game server, LAN room discovery, membership, and authoritative rounds.
- `js/lan-client.js` and `js/lan-menu.js`: LAN connection, host/join menus, and live slots.
- `js/lan-game.js`: 2-8 human-player rounds using the shared minigame rules and hazards.
- `js/input.js`: keyboard state and focus handling.
- `js/audio.js`: generated countdown, start, and chicken sounds.
- `js/lobby.js`: movement, collisions, countdown, rival AI, and race rules;
  independent of the DOM and Three.js.
- `js/pillows.js`: equal-chance minigame list, pillow arena, throws, hit detection,
  and rival dodge decisions; independent of the DOM and Three.js.
- `js/doors.js`: Door Dash course, secret door assignments, rival door guessing,
  monster chase, and win rules; independent of the DOM and Three.js.
- `js/track.js`: shared track and lobby layouts, wall bounds, and gameplay constants.
- `js/world.js`: Three.js scene, lobby building models, `assets/models/chicken.glb` racers,
  animation, and camera.
- `assets/models/`: GLB models used by the game and additional model assets.
- `race-track.glb`: race course model, rendered at five times its original size.
- `pillow.glb`: supplied pillow model used for incoming projectiles.

Run the game-rule tests with Node.js 18 or newer:

```sh
npm test
```
