/*
 * HOUSE MAP DATA
 * ---------------------------------------------------------------
 * Traced from house_floor_plans.png (the edited floor plan).
 * Both floors share one coordinate system (plan pixels):
 *   x grows to the right, y grows downwards, "up" on the plan = plan north.
 *   The house outline runs from (270,360) to (808,1060).
 *
 * To adapt the app to another building (e.g. a supermarket) you only
 * need to edit this file: rooms, nodes (walkable points) and edges.
 */
window.HOUSE = {
  name: "My House",
  // metres per plan pixel. House is ~540px wide; assume ~12 m.
  metersPerPx: 0.0222,
  // default stride in metres (learned per-user over time, see learn.js)
  defaultStride: 0.7,
  stairSteps: 15,

  floors: {
    G: { name: "Downstairs", short: "Ground floor" },
    U: { name: "Upstairs", short: "Upper floor" },
  },

  // Rooms: drawn on the map and used as destinations.
  // rect = [x1, y1, x2, y2]; node = the node you "arrive" at.
  rooms: [
    // ---------- DOWNSTAIRS ----------
    { id: "kitchen", floor: "G", name: "Kitchen", rect: [270, 360, 808, 558], node: "g_kitchen", kind: "service",
      icon: "chef-hat", about: "Cooking and food area",
      activities: ["Cook meals", "Get drinking water", "Grab snacks from the fridge", "Wash dishes"],
      objects: ["Cooker", "Sink", "Fridge"] },
    { id: "backdoor", floor: "G", name: "Outside Back Door", rect: null, node: "g_backdoor", kind: "exit",
      icon: "door-open", about: "Door from the kitchen to the outside compound",
      activities: ["Go out to the backyard", "Take out the trash"], objects: [] },
    { id: "store", floor: "G", name: "Store", rect: [270, 558, 382, 640], node: "g_store", kind: "service",
      icon: "package", about: "Storage for food and household items",
      activities: ["Pick up foodstuff", "Store household items"], objects: ["Shelves"] },
    { id: "stairs_g", floor: "G", name: "Stairs", rect: [382, 558, 642, 640], node: "g_stairs_bottom", kind: "stairs",
      icon: "stairs", about: "Staircase to upstairs", activities: ["Go upstairs"], objects: [], hidden: true },
    { id: "rear", floor: "G", name: "Rear Access", rect: [642, 558, 808, 640], node: "g_rear", kind: "circulation",
      icon: "move-right", about: "Link between the chill zone and the kitchen",
      activities: ["Shortcut to the kitchen"], objects: [] },
    { id: "dining", floor: "G", name: "Dining", rect: [382, 640, 522, 806], node: "g_dining", kind: "shared",
      icon: "utensils", about: "Dining table area",
      activities: ["Eat meals", "Family time"], objects: ["Dining table", "Chairs"] },
    { id: "chill", floor: "G", name: "Chill Zone", rect: [522, 640, 808, 806], node: "g_chill", kind: "shared",
      icon: "sofa", about: "Relaxation lounge",
      activities: ["Relax", "Hang out with friends", "Play games"], objects: ["Sofa"] },
    { id: "passage", floor: "G", name: "Passage", rect: [270, 640, 382, 1060], node: "g_passage_mid", kind: "circulation",
      icon: "move", about: "Side passage", activities: ["Walkway to the room and store"], objects: [], hidden: true },
    { id: "room_g", floor: "G", name: "Downstairs Room", rect: [382, 806, 522, 898], node: "g_room", kind: "room",
      icon: "bed-double", about: "Ground floor room",
      activities: ["Rest", "Guest stay"], objects: ["Bed"] },
    { id: "wc", floor: "G", name: "Visitor WC", rect: [382, 898, 522, 1060], node: "g_wc", kind: "service",
      icon: "toilet", about: "Visitors' toilet",
      activities: ["Use the toilet", "Wash hands"], objects: ["Toilet", "Wash basin"] },
    { id: "hall_g", floor: "G", name: "Entrance Hall", rect: [522, 806, 595, 1060], node: "g_hall_mid", kind: "circulation",
      icon: "house", about: "Hall behind the main entrance",
      activities: ["Enter / leave the house"], objects: [] },
    { id: "entrance", floor: "G", name: "Main Entrance", rect: null, node: "g_entrance", kind: "exit",
      icon: "door-closed", about: "Front door of the house",
      activities: ["Leave the house", "Welcome visitors"], objects: [] },
    { id: "parlour_g", floor: "G", name: "Parlour", rect: [595, 806, 808, 1060], node: "g_parlour", kind: "living",
      icon: "tv", about: "Main sitting room downstairs",
      activities: ["Watch TV", "Receive guests", "Relax on the sofa"], objects: ["Sofa", "Centre table", "TV"] },

    // ---------- UPSTAIRS ----------
    { id: "parlour_u", floor: "U", name: "Upstairs Parlour", rect: [270, 360, 641, 610], node: "u_parlour", kind: "living",
      icon: "sofa", about: "Family sitting room upstairs",
      activities: ["Family time", "Watch TV", "Relax"], objects: ["Sofa"] },
    { id: "room1", floor: "U", name: "Room 1", rect: [641, 360, 808, 610], node: "u_room1", kind: "room",
      icon: "bed-double", about: "Bedroom (entered through the upstairs parlour)",
      activities: ["Sleep", "Rest", "Change clothes"], objects: ["Bed"] },
    { id: "stairs_u", floor: "U", name: "Stairs", rect: [646, 612, 808, 697], node: "u_landing", kind: "stairs",
      icon: "stairs", about: "Staircase to downstairs", activities: ["Go downstairs"], objects: [], hidden: true },
    { id: "hall_u", floor: "U", name: "Hall", rect: [270, 610, 383, 828], node: "u_hall", kind: "circulation",
      icon: "move", about: "Small hall beside the study", activities: ["Walkway"], objects: [] },
    { id: "study", floor: "U", name: "Study", rect: [383, 610, 531, 828], node: "u_study", kind: "work",
      icon: "book-open", about: "Quiet room for work and reading",
      activities: ["Read", "Work on the laptop", "Do homework"], objects: ["Desk"] },
    { id: "hallway_u", floor: "U", name: "Hallway", rect: [531, 610, 641, 1060], node: "u_hallway_mid", kind: "circulation",
      icon: "move", about: "Main upstairs corridor", activities: ["Walkway to the bedrooms"], objects: [], hidden: true },
    { id: "room2", floor: "U", name: "Room 2", rect: [641, 697, 808, 882], node: "u_room2", kind: "room",
      icon: "bed-double", about: "Bedroom", activities: ["Sleep", "Rest"], objects: ["Bed"] },
    { id: "room3", floor: "U", name: "Room 3", rect: [641, 882, 808, 1060], node: "u_room3", kind: "room",
      icon: "bed-double", about: "Bedroom", activities: ["Sleep", "Rest"], objects: ["Bed"] },
    { id: "room4", floor: "U", name: "Room 4", rect: [270, 828, 531, 1060], node: "u_room4", kind: "room",
      icon: "bed-double", about: "Large bedroom", activities: ["Sleep", "Rest", "Change clothes"], objects: ["Bed"] },
  ],

  // Walkable points. label = what the person sees around them there.
  nodes: {
    // ---- Downstairs ----
    g_entrance:          { floor: "G", x: 558, y: 1045, label: "Main entrance" },
    g_hall_s:            { floor: "G", x: 558, y: 1000, label: "Entrance hall" },
    g_hall_mid:          { floor: "G", x: 558, y: 900,  label: "Entrance hall" },
    g_hall_n:            { floor: "G", x: 558, y: 815,  label: "End of the entrance hall" },
    g_parlour_door:      { floor: "G", x: 595, y: 865,  label: "Parlour door", door: "parlour_g" },
    g_parlour:           { floor: "G", x: 700, y: 950,  label: "Parlour" },
    g_wc_door_hall:      { floor: "G", x: 522, y: 1000, label: "Visitor WC door", door: "wc" },
    g_wc:                { floor: "G", x: 452, y: 975,  label: "Visitor WC" },
    g_wc_door_passage:   { floor: "G", x: 382, y: 965,  label: "WC side door", door: "wc" },
    g_passage_s:         { floor: "G", x: 326, y: 965,  label: "Passage" },
    g_passage_mid:       { floor: "G", x: 326, y: 845,  label: "Passage" },
    g_room_door:         { floor: "G", x: 382, y: 845,  label: "Room door", door: "room_g" },
    g_room:              { floor: "G", x: 452, y: 852,  label: "Downstairs room" },
    g_passage_n:         { floor: "G", x: 326, y: 665,  label: "End of the passage" },
    g_store_door:        { floor: "G", x: 326, y: 640,  label: "Store door", door: "store" },
    g_store:             { floor: "G", x: 326, y: 600,  label: "Store" },
    g_chill:             { floor: "G", x: 665, y: 735,  label: "Chill zone" },
    g_chill_s:           { floor: "G", x: 558, y: 780,  label: "Chill zone" },
    g_dining_door:       { floor: "G", x: 522, y: 700,  label: "Dining entrance", door: "dining" },
    g_dining:            { floor: "G", x: 452, y: 725,  label: "Dining table" },
    g_stairs_door:       { floor: "G", x: 458, y: 642,  label: "Door to the stairs", door: "stairs_g" },
    g_stairs_bottom:     { floor: "G", x: 410, y: 600,  label: "Bottom of the stairs" },
    g_rear_door_chill:   { floor: "G", x: 697, y: 642,  label: "Rear access door", door: "rear" },
    g_rear:              { floor: "G", x: 725, y: 600,  label: "Rear access" },
    g_rear_door_kitchen: { floor: "G", x: 747, y: 558,  label: "Kitchen door", door: "kitchen" },
    g_stairs_kitchen:    { floor: "G", x: 458, y: 558,  label: "Kitchen door by the stairs", door: "kitchen" },
    g_kitchen:           { floor: "G", x: 560, y: 470,  label: "Kitchen" },
    g_backdoor:          { floor: "G", x: 800, y: 455,  label: "Outside back door" },

    // ---- Upstairs ----
    u_landing:           { floor: "U", x: 660, y: 655,  label: "Top of the stairs" },
    u_hallway_n:         { floor: "U", x: 586, y: 655,  label: "Hallway" },
    u_hallway_mid:       { floor: "U", x: 586, y: 770,  label: "Hallway" },
    u_hallway_s:         { floor: "U", x: 586, y: 955,  label: "Hallway" },
    u_room2_door:        { floor: "U", x: 641, y: 770,  label: "Room 2 door", door: "room2" },
    u_room2:             { floor: "U", x: 724, y: 790,  label: "Room 2" },
    u_room3_door:        { floor: "U", x: 641, y: 960,  label: "Room 3 door", door: "room3" },
    u_room3:             { floor: "U", x: 724, y: 975,  label: "Room 3" },
    u_room4_door:        { floor: "U", x: 531, y: 925,  label: "Room 4 door", door: "room4" },
    u_room4:             { floor: "U", x: 400, y: 945,  label: "Room 4" },
    u_study_door_e:      { floor: "U", x: 531, y: 715,  label: "Study door", door: "study" },
    u_study:             { floor: "U", x: 457, y: 735,  label: "Study" },
    u_study_door_w:      { floor: "U", x: 383, y: 700,  label: "Study side door", door: "study" },
    u_hall:              { floor: "U", x: 328, y: 720,  label: "Hall" },
    u_parlour_door:      { floor: "U", x: 478, y: 610,  label: "Parlour door", door: "parlour_u" },
    u_parlour:           { floor: "U", x: 440, y: 485,  label: "Upstairs parlour" },
    u_room1_door:        { floor: "U", x: 641, y: 435,  label: "Room 1 door", door: "room1" },
    u_room1:             { floor: "U", x: 724, y: 490,  label: "Room 1" },
  },

  // Connections you can walk. Third value "stairs" marks the staircase.
  edges: [
    ["g_entrance", "g_hall_s"], ["g_hall_s", "g_hall_mid"], ["g_hall_mid", "g_hall_n"],
    ["g_hall_s", "g_wc_door_hall"], ["g_wc_door_hall", "g_wc"],
    ["g_hall_mid", "g_parlour_door"], ["g_parlour_door", "g_parlour"],
    ["g_hall_n", "g_chill_s"], ["g_chill_s", "g_chill"], ["g_chill_s", "g_dining_door"],
    ["g_dining_door", "g_dining"], ["g_dining", "g_stairs_door"], ["g_stairs_door", "g_stairs_bottom"],
    ["g_chill", "g_rear_door_chill"], ["g_rear_door_chill", "g_rear"], ["g_rear", "g_rear_door_kitchen"],
    ["g_rear_door_kitchen", "g_kitchen"], ["g_kitchen", "g_backdoor"],
    ["g_stairs_bottom", "g_stairs_kitchen"], ["g_stairs_kitchen", "g_kitchen"],
    ["g_wc", "g_wc_door_passage"], ["g_wc_door_passage", "g_passage_s"],
    ["g_passage_s", "g_passage_mid"], ["g_passage_mid", "g_room_door"], ["g_room_door", "g_room"],
    ["g_passage_mid", "g_passage_n"], ["g_passage_n", "g_store_door"], ["g_store_door", "g_store"],

    ["g_stairs_bottom", "u_landing", "stairs"],

    ["u_landing", "u_hallway_n"], ["u_hallway_n", "u_hallway_mid"], ["u_hallway_mid", "u_hallway_s"],
    ["u_hallway_mid", "u_room2_door"], ["u_room2_door", "u_room2"],
    ["u_hallway_s", "u_room3_door"], ["u_room3_door", "u_room3"],
    ["u_hallway_s", "u_room4_door"], ["u_room4_door", "u_room4"],
    ["u_hallway_n", "u_study_door_e"], ["u_study_door_e", "u_study"],
    ["u_study", "u_study_door_w"], ["u_study_door_w", "u_hall"],
    ["u_study", "u_parlour_door"], ["u_parlour_door", "u_parlour"],
    ["u_parlour", "u_room1_door"], ["u_room1_door", "u_room1"],
  ],
};
