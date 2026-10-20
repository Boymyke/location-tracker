# Goe — Indoor Navigation (house test)

Google-Maps-style directions **inside a building**. The person says where they are, picks where they want to go, and the camera opens with a floor arrow, labels for the rooms they pass (and what can be done there), a live mini-map, and an "You have arrived" screen at the end. It works on both floors and handles the stairs.

Built from the floor plans in `assets/` (`house_floor_plans.png` plus the two hand sketches).

## How it works

| Piece | What it does |
|---|---|
| **"Where are you?"** | No QR code needed: tap the room on the map or pick it from a list. (Optional deep links still work: `?at=kitchen&to=room2`.) |
| **Route finding** | The house is a graph of walkable points and doors (`js/house.js`). Dijkstra finds the shortest path, across floors via the stairs. |
| **Turn-by-turn** | The path is merged into legs: "Turn left to the dining table", "Take the stairs up", with rooms you pass on your left/right. |
| **Position tracking** | Pedestrian dead reckoning: step detection from the accelerometer plus compass heading moves you along the route. Steps taken in the wrong direction don't count. |
| **Floor tracking** | On the stairs leg it counts stair steps, then asks "Are you upstairs now?" and switches the map to the other floor. |
| **Corrections** | "✓ I'm at the turn" snaps you to the next point; "I'm lost" lets you tap your room and re-routes. |
| **Camera AR** | Rear camera with a 3D arrow on the floor, a target label, and side labels. Falls back to a no-camera view. |
| **Learning** | Every trip is logged, and your stride length is learned from your corrections (see `docs/ML.md`). |

On a laptop (no motion sensor), use the **⋯ menu → Demo walk** to watch a route play out.

## Editing the map
Everything about the building is in **`js/house.js`**: rooms (name, what you can do, objects), nodes (x/y on the plan), and edges. To use it for another building, such as a supermarket, replace that file.

## Deploying
Static site with no build step. `functions/api/trips.js` is a Cloudflare Pages Function that collects trip logs.

**Cloudflare Pages:** Dashboard → Workers & Pages → Create → Pages → *Connect to Git* → pick this repo → Framework preset **None**, build command *(empty)*, output directory **`/`** → Deploy. Every push redeploys.

Optional: to store trips on the server, add a KV namespace binding named `TRIPS` in the Pages project settings.

Camera and compass require HTTPS, which Cloudflare provides.

## v2: app UI and the floor line
* Map-first screens with a bottom-sheet panel, a floating floor switcher (1F / 2F), category filters, and Lucide icons. Works as an installable app (PWA).
* **Live view** draws the route as a **line painted on the floor** in the camera (`js/ar.js`). It's projected using the compass heading and phone tilt, with moving chevrons, a destination pin, and room labels pinned at their doors.
* **Geofencing**: every room is a fence. The app shows which room you're in, announces **arrival as soon as you enter the destination's fence**, and warns you when you walk away from the route corridor.
* **Map view** shows Google-Maps-style turn-by-turn on the floor plan, with the walked part greyed out.
