/*
 * DEFAULT VENUE (starting map)
 * ---------------------------------------------------------------
 * The first draft, traced from house_floor_plans.png. Correct it in the
 * ADMIN app (/admin.html). What you save there is stored on the server
 * and replaces this file for everyone.
 *
 * Coordinates are plan pixels: x to the right, y down, up = plan north.
 * You only describe rooms (rectangles), doors (points on walls), stairs
 * and objects. Walkways are generated automatically (js/venue.js): inside
 * a room you can walk in a straight line between any of its doors,
 * objects and centre, so routes are always the shortest possible.
 */
window.DEFAULT_VENUE = {
  schema: 2,
  name: "My House",
  metersPerPx: 0.0222,
  defaultStride: 0.7,
  stairSteps: 15,
  floors: {
    G: { name: "Downstairs", level: 0 },
    U: { name: "Upstairs", level: 1 },
  },
  rooms: [{"id":"kitchen","floor":"G","name":"Kitchen","kind":"service","icon":"chef-hat","rect":[270,360,808,558],"about":"Cooking and food area","activities":["Cook meals","Get drinking water","Grab snacks from the fridge","Wash dishes"]},
    {"id":"store","floor":"G","name":"Store","kind":"service","icon":"package","rect":[270,558,382,640],"about":"Storage for food and household items","activities":["Pick up foodstuff","Store household items"]},
    {"id":"stairs_g","floor":"G","name":"Stairs","kind":"stairs","icon":"stairs","rect":[382,558,642,640],"about":"Staircase to upstairs","activities":["Go upstairs"],"hidden":true},
    {"id":"rear","floor":"G","name":"Rear Access","kind":"circulation","icon":"move-right","rect":[642,558,808,640],"about":"Link between the chill zone and the kitchen","activities":["Shortcut to the kitchen"]},
    {"id":"dining","floor":"G","name":"Dining","kind":"shared","icon":"utensils","rect":[382,640,522,806],"about":"Dining table area","activities":["Eat meals","Family time"]},
    {"id":"chill","floor":"G","name":"Chill Zone","kind":"shared","icon":"sofa","rect":[522,640,808,806],"about":"Relaxation lounge","activities":["Relax","Hang out with friends","Play games"]},
    {"id":"passage","floor":"G","name":"Passage","kind":"circulation","icon":"move","rect":[270,640,382,1060],"about":"Side passage","activities":["Walkway to the room and store"],"hidden":true},
    {"id":"room_g","floor":"G","name":"Downstairs Room","kind":"room","icon":"bed-double","rect":[382,806,522,898],"about":"Ground floor room","activities":["Rest","Guest stay"]},
    {"id":"wc","floor":"G","name":"Visitor WC","kind":"service","icon":"toilet","rect":[382,898,522,1060],"about":"Visitors' toilet","activities":["Use the toilet","Wash hands"]},
    {"id":"hall_g","floor":"G","name":"Entrance Hall","kind":"circulation","icon":"house","rect":[522,806,595,1060],"about":"Hall behind the main entrance","activities":["Enter / leave the house"]},
    {"id":"parlour_g","floor":"G","name":"Parlour","kind":"living","icon":"tv","rect":[595,806,808,1060],"about":"Main sitting room downstairs","activities":["Watch TV","Receive guests","Relax on the sofa"]},
    {"id":"parlour_u","floor":"U","name":"Upstairs Parlour","kind":"living","icon":"sofa","rect":[270,360,641,610],"about":"Family sitting room upstairs","activities":["Family time","Watch TV","Relax"]},
    {"id":"room1","floor":"U","name":"Room 1","kind":"room","icon":"bed-double","rect":[641,360,808,610],"about":"Bedroom (entered through the upstairs parlour)","activities":["Sleep","Rest","Change clothes"]},
    {"id":"stairs_u","floor":"U","name":"Stairs","kind":"stairs","icon":"stairs","rect":[641,610,808,697],"about":"Staircase to downstairs","activities":["Go downstairs"],"hidden":true},
    {"id":"hall_u","floor":"U","name":"Hall","kind":"circulation","icon":"move","rect":[270,610,383,828],"about":"Small hall beside the study","activities":["Walkway"]},
    {"id":"study","floor":"U","name":"Study","kind":"work","icon":"book-open","rect":[383,610,531,828],"about":"Quiet room for work and reading","activities":["Read","Work on the laptop","Do homework"]},
    {"id":"hallway_u","floor":"U","name":"Hallway","kind":"circulation","icon":"move","rect":[531,610,641,1060],"about":"Main upstairs corridor","activities":["Walkway to the bedrooms"],"hidden":true},
    {"id":"room2","floor":"U","name":"Room 2","kind":"room","icon":"bed-double","rect":[641,697,808,882],"about":"Bedroom","activities":["Sleep","Rest"]},
    {"id":"room3","floor":"U","name":"Room 3","kind":"room","icon":"bed-double","rect":[641,882,808,1060],"about":"Bedroom","activities":["Sleep","Rest"]},
    {"id":"room4","floor":"U","name":"Room 4","kind":"room","icon":"bed-double","rect":[270,828,531,1060],"about":"Large bedroom","activities":["Sleep","Rest","Change clothes"]}],
  doors: [
    // downstairs
    { id: "d_parlour", floor: "G", x: 595, y: 865 },
    { id: "d_wc_hall", floor: "G", x: 522, y: 1000 },
    { id: "d_wc_passage", floor: "G", x: 382, y: 965 },
    { id: "d_room", floor: "G", x: 382, y: 845 },
    { id: "d_store", floor: "G", x: 326, y: 640 },
    { id: "d_dining", floor: "G", x: 522, y: 700 },
    { id: "d_hall_chill", floor: "G", x: 558, y: 806, name: "Opening to the chill zone" },
    { id: "d_stairs_dining", floor: "G", x: 458, y: 640 },
    { id: "d_stairs_kitchen", floor: "G", x: 458, y: 558 },
    { id: "d_rear_chill", floor: "G", x: 697, y: 640 },
    { id: "d_rear_kitchen", floor: "G", x: 747, y: 558 },
    { id: "entrance", floor: "G", x: 558, y: 1060, exit: true, name: "Main Entrance", icon: "door-closed",
      about: "Front door of the house", activities: ["Leave the house", "Welcome visitors"] },
    { id: "backdoor", floor: "G", x: 808, y: 455, exit: true, name: "Outside Back Door", icon: "door-open",
      about: "Door from the kitchen to the outside compound", activities: ["Go out to the backyard", "Take out the trash"] },
    // upstairs
    { id: "d_room1", floor: "U", x: 641, y: 435 },
    { id: "d_parlour_u", floor: "U", x: 478, y: 610 },
    { id: "d_study_e", floor: "U", x: 531, y: 715 },
    { id: "d_study_w", floor: "U", x: 383, y: 700 },
    { id: "d_room2", floor: "U", x: 641, y: 770 },
    { id: "d_room3", floor: "U", x: 641, y: 960 },
    { id: "d_room4", floor: "U", x: 531, y: 925 },
    { id: "d_landing", floor: "U", x: 641, y: 655, name: "Top of the stairs" },
  ],
  stairs: [
    { id: "main", steps: 15, a: { floor: "G", x: 410, y: 600 }, b: { floor: "U", x: 700, y: 655 } },
  ],
  // Things you can find. Positions are a first guess from the plan's furniture icons.
  objects: [
    { id: "cooker", floor: "G", x: 380, y: 412, name: "Cooker", icon: "chef-hat", items: [] },
    { id: "sink", floor: "G", x: 500, y: 412, name: "Kitchen sink", icon: "chef-hat", items: [] },
    { id: "dining_table", floor: "G", x: 452, y: 705, name: "Dining table", icon: "utensils", items: [] },
    { id: "sofa_chill", floor: "G", x: 680, y: 690, name: "Chill zone sofa", icon: "sofa", items: [] },
    { id: "sofa_parlour", floor: "G", x: 700, y: 895, name: "Parlour sofa", icon: "sofa", items: [] },
    { id: "toilet_g", floor: "G", x: 452, y: 945, name: "Toilet", icon: "toilet", items: [] },
    { id: "sofa_u", floor: "U", x: 439, y: 462, name: "Upstairs sofa", icon: "sofa", items: [] },
    { id: "desk", floor: "U", x: 454, y: 680, name: "Study desk", icon: "lamp-desk", items: [] },
    { id: "bed1", floor: "U", x: 725, y: 460, name: "Room 1 bed", icon: "bed-double", items: [] },
    { id: "bed2", floor: "U", x: 724, y: 775, name: "Room 2 bed", icon: "bed-double", items: [] },
    { id: "bed3", floor: "U", x: 724, y: 960, name: "Room 3 bed", icon: "bed-double", items: [] },
    { id: "bed4", floor: "U", x: 391, y: 935, name: "Room 4 bed", icon: "bed-double", items: [] },
  ],
  waypoints: [],
  anchors: [],
  // tracing images shown only in the admin editor (both floors are in one picture)
  plans: {
    G: { src: "assets/house_floor_plans.png", x: 0, y: 0, w: 2000, opacity: 0.45 },
    U: { src: "assets/house_floor_plans.png", x: -942, y: 0, w: 2000, opacity: 0.45 },
  },
  edgeMeta: {},
};
