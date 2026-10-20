# How Goe learns

## 1. The map (admin → Map)
You describe the building, and the routes are worked out from that:
* **Rooms** are rectangles. **Doors** are points on shared walls. **Stairs** link a point on one floor to a point on another. **Objects** (bed, fridge, wardrobe…) are points inside rooms.
* Walkways are generated automatically (`js/venue.js`). A rectangle is convex, so inside a room you can walk in a straight line between any of its doors, objects and centre. All of those are connected pairwise.
* Routing is **Dijkstra's shortest path** over that graph (`js/router.js`), so the route is always the shortest possible.

## 2. Camera place recognition (admin → Train)
* `js/vision.js` runs **MobileNet v1 (0.50)** in the browser with TensorFlow.js. Each camera frame becomes a 512-number fingerprint.
* In Train you record fingerprints at **spots** (a room, a doorway, "by the bed"). About 36 frames are captured per recording while you turn around.
* At run time a **k-nearest-neighbour vote** (k = 9, cosine similarity) picks the most likely spot. COCO-SSD object detections (bed, sofa, TV, toilet, fridge, sink, table…) add a small boost to spots whose room contains matching objects.
* Fingerprints are stored as bytes (about 0.7 KB each) in Cloudflare KV (`/api/model`).
* **Using it:**
  * "Scan" on the first screen finds where you are without a QR code.
  * During navigation, a spot recognised twice in a row snaps your position along the route (and corrects your stride).
  * A spot off the route, recognised three times, re-plans the route from there.
* **When things change:** re-record the affected spots. New samples outvote old ones, and "Clear" wipes a spot.

## 3. Learning from trips (admin → Learn)
Every trip is logged on the phone and sent to `/api/trips`. The log covers steps with compass heading, rooms entered (geofence events), manual corrections, camera fixes, leaving the route, and arrival.
* **Real distances:** steps × stride compared with planned length, per walkway (median over trips), saved as `edgeMeta.learnedLen`.
* **Blocked routes:** walkways where people repeatedly leave the route get a cost penalty, or you can block them. The router then avoids them while still taking the shortest *usable* route.
* **Missing doors:** room-to-room moves with no door between them are suggested as new doors.
* **Personal stride:** learned on each phone from corrections (`js/learn.js`).

## Next steps
* Train a small classifier head on the collected fingerprints (instead of k-NN) once there are thousands of samples.
* Add Wi-Fi / Bluetooth signal fingerprints in a native app for automatic positioning without the camera.
* For a supermarket: objects become shelves/aisles and items become products. Stock lists can be imported into the Things tab.
