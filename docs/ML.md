# Machine-learning roadmap

The app already records structured trip data, so a model can be trained later without changing how people use it.

## What is collected per trip (`js/learn.js`)
```json
{
  "id": "t_…", "deviceId": "d_…", "building": "My House",
  "from": "g_hall_mid", "to": "u_room3", "path": ["…node ids…"],
  "routeLength": 22.1, "stride": 0.7, "outcome": "arrived | cancelled",
  "events": [
    { "t": 1730000000000, "type": "leg", "idx": 0, "text": "Head towards…" },
    { "t": …, "type": "step", "d": 3.5, "h": 182 },
    { "t": …, "type": "calibrate", "heading": 95, "offset": 5 },
    { "t": …, "type": "fix", "trueDist": 7.8, "steps": 11 },
    { "t": …, "type": "relocate", "room": "dining" },
    { "t": …, "type": "arrive", "how": "auto | confirmed", "steps": 31 }
  ]
}
```
Trips are kept on the phone (Trip data → Download) and POSTed to `/api/trips` (stored in Cloudflare KV when a `TRIPS` binding exists).

## Learning already running
* **Personal stride length**: each manual fix (`fix` event) gives the true distance vs steps counted, which updates an exponential moving average.

## Planned models
1. **Better step & heading model**: train on (`step` events, `fix` ground truth) to predict distance per step and correct compass drift per room (magnetic interference is location-specific).
2. **Route popularity / prediction**: from (`from`, `to`, time of day) predict likely destinations and pre-suggest them. For a supermarket, this becomes "people who went to rice also went to…".
3. **Where-am-I from camera**: collect labelled camera frames per room (the room the user confirmed) and fine-tune a small image classifier (e.g. MobileNet in TensorFlow.js) so the app can recognise the room without asking.
4. **Wi-Fi / Bluetooth fingerprints** (native app phase): add signal readings to each `fix` event and train a k-NN / gradient-boosted model for automatic positioning.
