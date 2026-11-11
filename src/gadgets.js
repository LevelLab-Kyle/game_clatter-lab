// Gadget registry.
//
// Each gadget separates *how it looks* (makeMesh) from *how it behaves*
// (makeBody). The tray picture is rendered from makeMesh() too; set `image`
// to a URL to use a hand-made picture instead. Swap makeMesh for a loaded 3D asset later without touching
// the physics or the game logic.
//
// Coordinates: one unit is one grid cell, and every cell splits into a 4x4
// subgrid. Gadgets are sized so their outer edges all land on subgrid lines,
// and they're placed on subgrid lines too. A gadget's anchor (x, y) is the
// bottom-left corner of its footprint box (w x h units, multiples of 1/4);
// z runs -0.5..0.5.


const Z_AXIS_THREE = new THREE.Vector3(0, 0, 1);
const COLORS = {
  marble: 0x4f8cff,
  domino: 0xff6b6b,
  ramp: 0x8bd17c,
  block: 0xc9a06b,
  star: 0xffd84d,
};

function standard(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...extra });
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return edged(mesh);
}

// Thin dark edge lines on every part, so pieces placed side by side read as
// separate things instead of one merged shape. (Smooth shapes like spheres
// have no hard edges and get none.)
const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
function edged(mesh) {
  // Push the surface back a hair so the lines on it don't z-fight.
  mesh.material.polygonOffset = true;
  mesh.material.polygonOffsetFactor = 1;
  mesh.material.polygonOffsetUnits = 1;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 20), EDGE_MATERIAL));
  return mesh;
}

// Right-triangle prism: high edge on the left, sloping down to the right.
// `mirror` puts the right angle at the bottom-right instead (a flipped wedge).
function wedgeGeometry(w, h, d, mirror = false) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(w, 0);
  shape.lineTo(mirror ? w : 0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(-w / 2, -h / 2, -d / 2);
  return geo;
}

// Upright triangle: flat base on the bottom, point at the top (a fulcrum).
function fulcrumGeometry(w, h, d) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  return geo;
}

function wedgeShape(w, h, d, mirror = false) {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const sx = mirror ? -1 : 1; // mirror across x: negate x and reverse face winding
  const v = (x, y, z) => new CANNON.Vec3(x * sx, y, z);
  const vertices = [
    v(-hw, -hh, -hd), v(hw, -hh, -hd), v(-hw, hh, -hd),
    v(-hw, -hh, hd), v(hw, -hh, hd), v(-hw, hh, hd),
  ];
  // Faces wound counter-clockwise when viewed from outside.
  let faces = [
    [0, 1, 4, 3], // bottom
    [0, 2, 1],    // back
    [3, 4, 5],    // front
    [0, 3, 5, 2], // left (tall side)
    [1, 2, 5, 4], // slope
  ];
  if (mirror) faces = faces.map((f) => [...f].reverse());
  return new CANNON.ConvexPolyhedron({ vertices, faces });
}

// Keep dynamic bodies in the X/Y plane so nothing drifts into the screen.
function lockToPlane(body) {
  body.linearFactor.set(1, 1, 0);
  body.angularFactor.set(0, 0, 1);
  return body;
}

// Subgrid: each cell is SUB x SUB quarter cells.
const SUB = 4;

const MARBLE_R = 0.25; // half a cell across
// Dominoes are taller than a cell so each one reaches the next when it falls.
const DOMINO = { w: 0.25, h: 1.5, d: 0.6 };
// Physics materials. Static surfaces share one so contact rules are simple.
const MATS = {
  surface: new CANNON.Material('surface'),
  domino: new CANNON.Material('domino'),
  marble: new CANNON.Material('marble'),
  bouncy: new CANNON.Material('bouncy'),
  bell: new CANNON.Material('bell'),
  pipe: new CANNON.Material('pipe'),
};

// How grippy everything is. Every contact below is a multiple of this, so
// changing it (a future player setting) changes them all in step; it's read
// each time a run starts.
let FRICTION = 0.4;

const ROLLER_SPIN = 6; // conveyor roller spin, radians per second (see conveyor.onFrame)

// Direction a gadget "faces" after rot quarter turns: local +x turned.
function facing(item) {
  const a = (item.rot || 0) * Math.PI / 2;
  return { dx: Math.cos(a), dy: Math.sin(a), ux: -Math.sin(a), uy: Math.cos(a) };
}

// Multi-part gadgets: makeMesh() returns a THREE.Group with named children,
// and makeBodies(group) returns { parts: [{ body, mesh }], constraints }.
// Each part's body starts at its mesh's world transform; dynamic parts drive
// their mesh during play. mesh may be null for a body with no moving visual.
// Optional hooks: onStep(item, world, dt) before each physics step,
// onFrame(item, dt) after each render sync.
function named(mesh, name) {
  mesh.name = name;
  return mesh;
}

const Z_AXIS = new CANNON.Vec3(0, 0, 1);

const GADGETS = {
  // The tray has one Ball (the medium one): the marble, ball and bowling
  // ball are its three sizes (see BALL_SIZES; Size swaps between them).
  marble: {
    name: 'Marble',
    // It snaps like a whole cell, sitting in the middle of it: only those
    // 2 x 2 quarter cells are taken, so neighbours can come close.
    w: 1, h: 1,
    footprint: () => rectCells(0.5 - MARBLE_R, 0.5 - MARBLE_R, 2 * MARBLE_R, 2 * MARBLE_R),
    dynamic: true,
    makeMesh() {
      return shadowed(new THREE.Mesh(new THREE.SphereGeometry(MARBLE_R, 32, 24), standard(COLORS.marble, { roughness: 0.3 })));
    },
    makeBody() {
      return lockToPlane(new CANNON.Body({ mass: 1.2, shape: new CANNON.Sphere(MARBLE_R), material: MATS.marble }));
    },
    offset: () => new THREE.Vector3(0.5, 0.5, 0),
  },

  // Between the marble and the bowling ball: a whole cell across, middling weight.
  ball: {
    name: 'Ball',
    w: 1, h: 1,
    dynamic: true,
    makeMesh() {
      return shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), standard(COLORS.marble, { roughness: 0.3 })));
    },
    makeBody() {
      return lockToPlane(new CANNON.Body({ mass: 3, shape: new CANNON.Sphere(0.5), material: MATS.marble }));
    },
    offset: () => new THREE.Vector3(0.5, 0.5, 0),
  },

  domino: {
    name: 'Domino',
    w: DOMINO.w, h: DOMINO.h,
    rotatable: true,
    dynamic: true,
    // Size changes the height only: 1½ (normal), 2, then 1. Sizes scale the
    // normal 1½, so those are x1, x4/3 and x2/3. Weight goes with height.
    resizable: { sizes: [[1, 1], [1, 4 / 3], [1, 2 / 3]] },
    makeMesh(item) {
      const h = DOMINO.h * (item?.size?.h || 1);
      return shadowed(new THREE.Mesh(new THREE.BoxGeometry(DOMINO.w, h, DOMINO.d), standard(COLORS.domino)));
    },
    makeBody(item) {
      const k = item?.size?.h || 1;
      const shape = new CANNON.Box(new CANNON.Vec3(DOMINO.w / 2, DOMINO.h * k / 2, DOMINO.d / 2));
      return lockToPlane(new CANNON.Body({ mass: 0.15 * k, shape, material: MATS.domino }));
    },
    offset: () => new THREE.Vector3(DOMINO.w / 2, DOMINO.h / 2, 0),
  },

  // Flip mirrors it to slope the other way (item.flip): a stretched or 2x1
  // wedge's mirror image isn't one of its own rotations.
  ramp: {
    name: 'Ramp',
    w: 1, h: 1,
    rotatable: true,
    // The Size button steps through these (width x height, in its own
    // unturned frame) and wraps around.
    resizable: { sizes: [[1, 1], [2, 1], [2, 2], [1, 2]] },
    flippable: true,
    makeMesh(item) {
      const s = item?.size || NORMAL_SIZE;
      return shadowed(new THREE.Mesh(wedgeGeometry(s.w, s.h, 1, !!item?.flip), standard(COLORS.ramp)));
    },
    makeBody(item) {
      const s = item?.size || NORMAL_SIZE;
      return new CANNON.Body({ mass: 0, shape: wedgeShape(s.w, s.h, 1, !!item?.flip), material: MATS.surface });
    },
    offset: () => new THREE.Vector3(0.5, 0.5, 0),
  },

  block: {
    name: 'Block',
    w: 1, h: 1,
    // Size steps through these (width x height): whole sizes, then half sizes.
    resizable: { sizes: [[1, 1], [2, 1], [1, 2], [2, 2], [0.5, 0.5], [1, 0.5], [0.5, 1]] },
    makeMesh(item) {
      const s = item?.size || NORMAL_SIZE;
      return shadowed(new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 1), standard(COLORS.block)));
    },
    makeBody(item) {
      const s = item?.size || NORMAL_SIZE;
      return new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(s.w / 2, s.h / 2, 0.5)), material: MATS.surface });
    },
    offset: () => new THREE.Vector3(0.5, 0.5, 0),
  },

  star: {
    name: 'Star',
    w: 1, h: 1,
    goal: true,
    makeMesh() {
      const shape = new THREE.Shape();
      const outer = 0.5, inner = 0.21;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = Math.PI / 2 + (i * Math.PI) / 5;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
      }
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false });
      geo.translate(0, 0, -0.125);
      return shadowed(new THREE.Mesh(geo, standard(COLORS.star, { emissive: 0x332800, roughness: 0.4 })));
    },
    makeBody() {
      return new CANNON.Body({ mass: 0, isTrigger: true, shape: new CANNON.Sphere(0.4) });
    },
    offset: () => new THREE.Vector3(0.5, 0.5, 0),
  },

  bowling: {
    name: 'Bowling ball',
    w: 2, h: 2,
    dynamic: true,
    makeMesh() {
      return shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), standard(COLORS.marble, { roughness: 0.3 })));
    },
    makeBody() {
      return lockToPlane(new CANNON.Body({ mass: 6, shape: new CANNON.Sphere(1), material: MATS.marble }));
    },
    offset: () => new THREE.Vector3(1, 1, 0),
  },

  bouncer: {
    name: 'Bouncer',
    w: 1, h: 0.5,
    rotatable: true,
    makeMesh() {
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 1), standard(0x6b5b95))).translateY(0.125));
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.25, 0.75), standard(0xff8fd8, { roughness: 0.4 }))).translateY(0.375));
      return g;
    },
    makeBody() {
      const body = new CANNON.Body({ mass: 0, material: MATS.bouncy });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.25, 0.5)), new CANNON.Vec3(0, 0.25, 0));
      return body;
    },
    offset: () => new THREE.Vector3(0.5, 0, 0),
  },

  seesaw: {
    name: 'Seesaw',
    w: 3, h: 0.75,
    glidesPlank: true, // on Size, only the plank glides to its new spot (resizeSelected)
    // Size: 3 wide, 4 wide, then 3 wide with the plank shifted half a cell
    // left or right of the fulcrum (a size's third value, `off`, is how far
    // the plank sits right of the fulcrum). The fulcrum stays put.
    resizable: { sizes: [[1, 1], [4 / 3, 1], [1, 1, -0.5], [1, 1, 0.5]] },
    // Where the fulcrum's middle sits, from the plank's left end.
    pivotX: (size) => (3 * (size?.w || 1)) / 2 - (size?.off || 0),
    // The plank across the top and the fulcrum under it; the space under each
    // end of the plank stays free.
    footprint(rot, { w, off }) {
      const px = w / 2 - off;
      return [...rectCells(0, 0.5, w, 0.25), ...rectCells(px - 0.5, 0, 1, 0.5)];
    },
    makeMesh(item) {
      const k = item?.size || NORMAL_SIZE;
      const len = 3 * k.w, off = k.off || 0;
      // The group's origin is the plank's middle; the fulcrum sits `off` left of it.
      const g = new THREE.Group();
      g.userData.seesaw = { len, off };
      // Fulcrum: base on the ground, point up at the hinge (local y = 0.5).
      const base = named(shadowed(new THREE.Mesh(fulcrumGeometry(1, 0.5, 0.6), standard(0x8a7f6a))), 'base');
      base.position.x = -off;
      g.add(base);
      // A shifted plank starts tipped, its long end resting on the ground:
      // the hinge (on the plank's underside, over the fulcrum) is 1/2 up, and
      // the long end reaches len/2 + |off| from it.
      const tilt = off ? -Math.sign(off) * Math.asin(0.5 / (len / 2 + Math.abs(off))) : 0;
      const plank = named(shadowed(new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, 0.6), standard(0xf2b134))), 'plank');
      // Plank middle = hinge + (off, 1/8) turned by the tilt.
      const c = Math.cos(tilt), s = Math.sin(tilt);
      plank.position.set(-off + off * c - 0.125 * s, 0.5 + off * s + 0.125 * c, 0);
      plank.rotation.z = tilt;
      g.add(plank);
      return g;
    },
    makeBodies(g) {
      const { len, off } = g.userData.seesaw;
      const base = new CANNON.Body({ mass: 0, material: MATS.surface });
      base.addShape(new CANNON.Box(new CANNON.Vec3(0.3, 0.25, 0.3)), new CANNON.Vec3(0, 0.25, 0));
      const plank = lockToPlane(new CANNON.Body({ mass: 0.2 * len, shape: new CANNON.Box(new CANNON.Vec3(len / 2, 0.125, 0.3)), material: MATS.surface }));
      plank.angularDamping = 0.2;
      // The hinge is at the fulcrum's point, `off` left of the plank's middle.
      const hinge = new CANNON.HingeConstraint(base, plank, {
        pivotA: new CANNON.Vec3(0, 0.5, 0), axisA: Z_AXIS,
        pivotB: new CANNON.Vec3(-off, -0.125, 0), axisB: Z_AXIS,
      });
      return {
        parts: [{ body: base, mesh: g.getObjectByName('base') }, { body: plank, mesh: g.getObjectByName('plank') }],
        constraints: [hinge],
      };
    },
    offset: () => new THREE.Vector3(1.5, 0, 0),
  },

  fan: {
    name: 'Fan',
    w: 1, h: 1,
    rotatable: true,
    push: 3.5, // reach in cells
    makeMesh() {
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), standard(0x5a6b7a))).translateY(0.5));
      const blade = named(new THREE.Group(), 'blade');
      // The blade ring sits at the cell's right edge (it ends on x = 1), on
      // a short axle from the post.
      blade.position.set(0.47, 0.5, 0);
      const axle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 12), standard(0x5a6b7a)));
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0.36, 0.5, 0);
      g.add(axle);
      blade.rotation.y = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.04), standard(0xc7e6ff, { roughness: 0.3 })));
        b.rotation.z = (i * Math.PI) / 3;
        blade.add(b);
      }
      blade.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 8, 32), standard(0x5a6b7a))));
      g.add(blade);
      return g;
    },
    makeBodies() {
      const post = new CANNON.Body({ mass: 0, material: MATS.surface });
      post.addShape(new CANNON.Box(new CANNON.Vec3(0.25, 0.5, 0.25)), new CANNON.Vec3(0, 0.5, 0));
      return { parts: [{ body: post, mesh: null }], constraints: [] };
    },
    onStep(item, world) {
      // Blows along the fan's local +x, turned by the item's rotation.
      const a = (item.rot || 0) * Math.PI / 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const fx = item.x + 0.5, fy = item.y + 0.5;
      for (const b of world.bodies) {
        if (b.mass === 0) continue;
        const rx = b.position.x - fx, ry = b.position.y - fy;
        const ahead = rx * dx + ry * dy;
        const side = Math.abs(-rx * dy + ry * dx);
        if (ahead < 0.4 || ahead > this.push || side > 0.8) continue;
        // Strong enough to lift a marble against gravity (30) at full reach.
        const strength = 75 * (1 - 0.5 * ahead / this.push);
        // Force through the center of mass: no lever arm, so no spin.
        b.applyForce(new CANNON.Vec3(dx * strength * b.mass, dy * strength * b.mass, 0));
      }
    },
    onFrame(item, dt) {
      item.mesh.getObjectByName('blade').rotation.x += dt * 25;
    },
    offset: () => new THREE.Vector3(0.5, 0, 0),
  },

  pendulum: {
    name: 'Pendulum',
    w: 1, h: 3.25,
    swing: true, // never turns: pull the ball back by dragging it instead
    // Like the Ball, Size steps its ball medium -> large -> small (the ball,
    // bowling ball, marble, same weights). The bar is a 1 x ¼ plate, the
    // same on every size.
    resizable: { sizes: [[1, 1], [2, 1], [0.5, 1]] },
    growsFromCenter: true, // the bar keeps its middle (see nextSize)
    keepOnResize: ['bx', 'by'], // and the ball stays where it was put
    pivotY: 3, // the rope hangs from the bottom of the bar (bar: 1 wide, y 3..3.25)
    idleFrame: true, // keep the rope drawn while editing
    ballOf(item) {
      const k = item?.size?.w || 1;
      return { r: 0.5 * k, mass: k > 1.5 ? 6 : k < 0.75 ? 1.2 : 3 };
    },
    // Where the ball hangs, from the rope's top (the bar's underside, in its
    // middle). Dragged anywhere; it rides in `size` as { bx, by }, so it
    // saves, undoes and shares like the rest. Otherwise straight down on a
    // 2½ rope, or as high as the ground allows. (Older saves turned it to
    // pull the ball out: 1½ across and 2 down, either way.)
    ballAt(item) {
      // A ball made bigger where it hung low is lifted clear of the ground.
      const lowest = this.ballOf(item).r - this.pivotY - (item?.y || 0);
      if (item?.size?.bx !== undefined) return { x: item.size.bx, y: Math.max(item.size.by, lowest) };
      if (item?.rot) return { x: Math.sign(item.rot) * 1.5, y: -2 };
      return { x: 0, y: -Math.min(2.5, this.pivotY - this.ballOf(item).r) };
    },
    // Handle: the ball. Drag it anywhere below the bar: how far it is from
    // the bar sets the rope, where it is sets the swing.
    handleAt(item, px, py, pad = 0) {
      const b = this.ballAt(item), w = item.size?.w || 1;
      return Math.hypot(px - (item.x + 0.5 * w + b.x), py - (item.y + this.pivotY + b.y)) <= this.ballOf(item).r + pad ? 'ball' : null;
    },
    handlePoint(item) {
      const b = this.ballAt(item), w = item.size?.w || 1;
      return { x: item.x + 0.5 * w + b.x, y: item.y + this.pivotY + b.y };
    },
    dragHandle(item, handle, to) {
      const w = item.size?.w || 1, r = this.ballOf(item).r;
      let bx = Math.round((to.x - item.x - 0.5 * w) * SUB) / SUB;
      let by = Math.round((to.y - item.y - this.pivotY) * SUB) / SUB;
      by = Math.min(by, -r); // below the bar
      by = Math.max(by, r - this.pivotY - item.y); // not under the ground
      if (Math.hypot(bx, by) < 0.75) return item.size || { w: 1, h: 1 }; // too close to the bar: stay
      return { w, h: 1, bx, by };
    },
    makeMesh(item) {
      const { r } = this.ballOf(item);
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.6), standard(0x8a7f6a))).translateY(this.pivotY + 0.125));
      const ball = named(shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), standard(0x5a5a68, { roughness: 0.3, metalness: 0.3 }))), 'ball');
      const b = this.ballAt(item);
      ball.position.set(b.x, this.pivotY + b.y, 0);
      g.add(ball);
      const rope = named(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), standard(0x333333))), 'rope');
      g.add(rope);
      g.userData.pendulum = { r, mass: this.ballOf(item).mass };
      this.onFrame({ mesh: g }); // the rope drawn from the start (the tray picture too)
      return g;
    },
    makeBodies(g) {
      const { r, mass } = g.userData.pendulum;
      const anchor = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.125, 0.3)), material: MATS.surface });
      const ball = lockToPlane(new CANNON.Body({ mass, shape: new CANNON.Sphere(r), material: MATS.marble }));
      ball.linearDamping = 0.02;
      // Rope: pin the ball to the bar's underside at whatever angle it starts from.
      const toPivot = new THREE.Vector3(0, this.pivotY, 0).sub(g.getObjectByName('ball').position);
      const rope = new CANNON.PointToPointConstraint(anchor, new CANNON.Vec3(0, -0.125, 0), ball, new CANNON.Vec3(toPivot.x, toPivot.y, toPivot.z));
      return {
        parts: [{ body: anchor, mesh: g.children[0] }, { body: ball, mesh: g.getObjectByName('ball') }],
        constraints: [rope],
      };
    },
    onFrame(item) {
      const top = new THREE.Vector3(0, this.pivotY, 0);
      const ball = item.mesh.getObjectByName('ball').position;
      const rope = item.mesh.getObjectByName('rope');
      const dir = new THREE.Vector3().subVectors(ball, top);
      rope.position.copy(top).addScaledVector(dir, 0.5);
      rope.scale.y = dir.length();
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    },
    offset: () => new THREE.Vector3(0.5, 0, 0),
  },

  // Carries things right, or left when flipped (item.flip). An arrow on the
  // front face shows the belt direction.
  conveyor: {
    name: 'Conveyor',
    w: 2, h: 0.5,
    rotatable: true,
    flippable: true,
    speed: 3,
    makeMesh(item) {
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(2, 0.375, 0.8), standard(0x3d3d46))).translateY(0.1875));
      const arrow = new THREE.Shape();
      const s = item?.flip ? -1 : 1;
      [[-0.45, 0.05], [0.2, 0.05], [0.2, 0.11], [0.45, 0], [0.2, -0.11], [0.2, -0.05], [-0.45, -0.05]]
        .forEach(([x, y], i) => (i ? arrow.lineTo(x * s, y) : arrow.moveTo(x * s, y)));
      const face = new THREE.Mesh(new THREE.ShapeGeometry(arrow), standard(0xffe08a, { roughness: 0.5 }));
      face.position.set(0, 0.1875, 0.401); // on the front face, facing the camera
      g.add(face);
      // Rollers along the top spin to show the direction. They sit half sunk
      // in the base and stop just short of its front and back faces.
      for (let i = 0; i < 5; i++) {
        const r = named(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.76, 12), standard(0xffb545, { roughness: 0.5 }))), 'roller');
        r.rotation.x = Math.PI / 2;
        r.position.set(-0.75 + i * 0.375, 0.375, 0); // tops on y = 0.5
        g.add(r);
      }
      return g;
    },
    makeBody() {
      const body = new CANNON.Body({ mass: 0, material: MATS.surface });
      body.addShape(new CANNON.Box(new CANNON.Vec3(1, 0.25, 0.4)), new CANNON.Vec3(0, 0.25, 0));
      return body;
    },
    onStep(item, world) {
      // Anything resting just above the belt gets pulled toward the belt speed.
      const f = facing(item);
      const dir = item.flip ? -1 : 1;
      const cx = item.x + (footprintSize(item.type, item.rot).w) / 2;
      const cy = item.y + (footprintSize(item.type, item.rot).h) / 2;
      // Local frame: along = belt direction, up = away from the belt surface.
      for (const b of world.bodies) {
        if (b.mass === 0) continue;
        const rx = b.position.x - cx, ry = b.position.y - cy;
        const along = rx * f.dx + ry * f.dy;
        const up = rx * f.ux + ry * f.uy;
        if (Math.abs(along) > 1.1 || up < 0 || up > 1.1) continue;
        const v = (b.velocity.x * f.dx + b.velocity.y * f.dy) * dir;
        const push = (this.speed - v) * 8 * b.mass * dir;
        b.applyForce(new CANNON.Vec3(f.dx * push, f.dy * push, 0));
      }
    },
    onFrame(item, dt) {
      // A true rolling speed (speed / radius, ~27 rad/s) moves the roller's
      // edge lines almost one 30° segment per frame, which the eye reads as
      // spinning backwards. A slower spin reads correctly.
      const spin = dt * ROLLER_SPIN * (item.flip ? -1 : 1);
      item.mesh.traverse((o) => { if (o.name === 'roller') o.rotation.y -= spin; });
    },
    offset: () => new THREE.Vector3(1, 0, 0),
  },

  launcher: {
    name: 'Launcher',
    w: 1, h: 0.5,
    rotatable: true,
    delay: 0.4,
    kick: 14,
    plateY: 0.3125, // plate spans y 0.25..0.375
    makeMesh() {
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.8), standard(0x5a4a6a))).translateY(0.125));
      const plate = named(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.125, 0.7), standard(0xff5a5a, { roughness: 0.4 }))), 'plate');
      plate.position.y = this.plateY;
      g.add(plate);
      // A little arrow on the plate shows which way it fires (local +y, i.e. up).
      const arrow = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.125, 4), standard(0xffe08a)));
      arrow.position.y = 0.4375; // tip on y = 0.5
      arrow.rotation.y = Math.PI / 4;
      g.add(arrow);
      return g;
    },
    makeBody() {
      const body = new CANNON.Body({ mass: 0, material: MATS.surface });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.1875, 0.4)), new CANNON.Vec3(0, 0.1875, 0));
      return body;
    },
    onStep(item, world) {
      if (world.time < this.delay) { item.armed = true; return; }
      if (!item.armed) return;
      item.armed = false;
      item.popT = 0;
      // Fire along local "up" (the plate's normal), turned by the rotation.
      const f = facing(item);
      const { w, h } = footprintSize(item.type, item.rot);
      const cx = item.x + w / 2, cy = item.y + h / 2;
      for (const b of world.bodies) {
        if (b.mass === 0) continue;
        const rx = b.position.x - cx, ry = b.position.y - cy;
        const along = rx * f.dx + ry * f.dy;
        const up = rx * f.ux + ry * f.uy;
        if (Math.abs(along) > 0.6 || up < -0.2 || up > 1.4) continue;
        b.applyImpulse(new CANNON.Vec3(f.ux * this.kick * b.mass, f.uy * this.kick * b.mass, 0));
      }
    },
    onFrame(item, dt) {
      if (item.popT === undefined) return;
      item.popT += dt;
      const plate = item.mesh.getObjectByName('plate');
      const k = Math.max(0, 1 - item.popT * 4); // quick pop then settle
      plate.position.y = this.plateY + Math.sin(Math.min(1, item.popT * 4) * Math.PI) * 0.35 * (k + 0.2);
      if (item.popT > 0.5) { plate.position.y = this.plateY; delete item.popT; }
    },
    offset: () => new THREE.Vector3(0.5, 0, 0),
  },

  bell: {
    name: 'Bell',
    w: 1, h: 1,
    idleFrame: true,
    makeMesh() {
      const g = new THREE.Group();
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 0.125, 0.5), standard(0x8a7f6a))).translateY(0.9375));
      const swing = named(new THREE.Group(), 'swing');
      swing.position.y = 0.875;
      const cup = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.375, 0.5, 16), standard(0xf5c542, { roughness: 0.3, metalness: 0.4 })));
      cup.position.y = -0.25; // cup spans y 0.375..0.875
      swing.add(cup);
      const clapper = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), standard(0x333333)));
      clapper.position.y = -0.535; // bottom on y = 0.25
      swing.add(clapper);
      g.add(swing);
      return g;
    },
    makeBody() {
      const body = new CANNON.Body({ mass: 0, material: MATS.bell });
      body.addShape(new CANNON.Sphere(0.34), new CANNON.Vec3(0, 0.5, 0));
      return body;
    },
    // Set by the game when something hits the bell: starts the swing.
    ring(item) { item.swingT = 0; },
    onFrame(item, dt) {
      if (item.swingT === undefined) return;
      item.swingT += dt;
      const swing = item.mesh.getObjectByName('swing');
      swing.rotation.z = Math.sin(item.swingT * 18) * 0.25 * Math.exp(-item.swingT * 3);
      if (item.swingT > 1.5) { swing.rotation.z = 0; delete item.swingT; }
    },
    offset: () => new THREE.Vector3(0.5, 0, 0),
  },

  plank: {
    name: 'Plank',
    w: 3, h: 0.25,
    rotatable: true,
    dynamic: true,
    // Size changes the length only: 3 (normal), 4, then 2. Sizes scale the
    // normal 3, so those are x1, x4/3 and x2/3. Weight goes with length.
    resizable: { sizes: [[1, 1], [4 / 3, 1], [2 / 3, 1]] },
    makeMesh(item) {
      const w = 3 * (item?.size?.w || 1);
      return shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, 0.6), standard(0xc98f4a)));
    },
    makeBody(item) {
      const k = item?.size?.w || 1;
      return lockToPlane(new CANNON.Body({ mass: 0.5 * k, shape: new CANNON.Box(new CANNON.Vec3(1.5 * k, 0.125, 0.3)), material: MATS.surface }));
    },
    offset: () => new THREE.Vector3(1.5, 0.125, 0),
  },

  bucket: {
    name: 'Bucket',
    // A quarter-thick floor and walls around an open inside exactly as wide
    // as a ball, so a bucket lined up under a ball catches it. Size steps it
    // up for each ball: inside 1/2 (marble), 1 (ball), 2 (bowling ball). The
    // arms stand half the ball's height above the floor.
    w: 1, h: 0.5,
    rotatable: true,
    resizable: { sizes: [[1, 1], [1.5, 1.5], [2.5, 2.5]] },
    // Size grows it evenly around its cavity: see nextSize in main.js.
    cavity: true,
    floor: 0.25,
    dims(item) {
      const k = item?.size || NORMAL_SIZE;
      const w = this.w * k.w, h = this.h * k.h;
      return { w, h, t: this.wall(w) };
    },
    wall: () => 0.25, // wall thickness
    // Just the floor and the two walls: the inside stays free to fill.
    footprint(rot, dims) {
      const { w, h } = dims, t = this.wall(w), f = this.floor;
      return [...rectCells(0, 0, w, f), ...rectCells(0, f, t, h - f), ...rectCells(w - t, f, t, h - f)];
    },
    makeMesh(item) {
      // One U-shaped piece, so edge lines only trace its outline (separate
      // floor and wall boxes would show seams where they meet).
      const { w, h, t } = this.dims(item), f = this.floor;
      const x0 = -w / 2, x1 = w / 2;
      const u = new THREE.Shape();
      [[x0, 0], [x1, 0], [x1, h], [x1 - t, h], [x1 - t, f], [x0 + t, f], [x0 + t, h], [x0, h]]
        .forEach(([x, y], i) => (i ? u.lineTo(x, y) : u.moveTo(x, y)));
      const geo = new THREE.ExtrudeGeometry(u, { depth: 0.8, bevelEnabled: false });
      geo.translate(0, 0, -0.4);
      return shadowed(new THREE.Mesh(geo, standard(0x4f7fa8)));
    },
    makeBody(item) {
      const { w, h, t } = this.dims(item), f = this.floor;
      const body = new CANNON.Body({ mass: 0, material: MATS.surface });
      body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2 - t, f / 2, 0.4)), new CANNON.Vec3(0, f / 2, 0));
      for (const side of [-1, 1]) body.addShape(new CANNON.Box(new CANNON.Vec3(t / 2, h / 2, 0.4)), new CANNON.Vec3(side * (w / 2 - t / 2), h / 2, 0));
      return body;
    },
    offset: () => new THREE.Vector3(0.5, 0, 0),
  },

  // A cross on a pin that spins freely: whatever hits an arm turns it, and
  // the next arm along knocks or turns back what comes after. Rotate sets it
  // + or x (a cross looks the same after any quarter turn, so those are its
  // only two ways); Size makes the arms longer.
  spinner: {
    name: 'Spinner',
    w: 2, h: 2,
    rotatable: true,
    poses: [0, 1].map((rot) => ({ rot, flip: false })), // + then x
    resizable: { sizes: [[1, 1], [1.5, 1.5], [2, 2]] }, // boxes 2, 3 and 4 wide
    growsFromCenter: true, // Size keeps the pin where it is (see nextSize)
    // Each arm ends in a round end whose edge sits on the box edge (a grid
    // line); the flat arm runs to that round end's middle (see spinnerCross).
    arm: (item) => 2 * ((item?.size?.w || 1) - ARM_T / 2),
    // The board turns the whole spinner rot quarter turns; the cross then
    // sits 45° on for x. (A quarter turn plus 45° looks the same as 45°.)
    applyRot(item) {
      const cross = item.mesh.getObjectByName('cross');
      cross.rotation.z = (item.rot || 0) % 2 ? Math.PI / 4 : 0;
      if (cross.userData.rest) cross.userData.rest.q.copy(cross.quaternion);
    },
    makeMesh(item) {
      const g = new THREE.Group();
      g.userData.arm = this.arm(item);
      g.userData.capTo = item?.size?.w || 1; // the box edge, from the middle
      g.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 16).rotateX(Math.PI / 2), standard(0x5a6b7a))));
      const cross = spinnerCross(0x4fc3a1, 'cross', g.userData.capTo);
      cross.rotation.z = (item?.rot || 0) % 2 ? Math.PI / 4 : 0;
      g.add(cross);
      return g;
    },
    makeBodies(g) {
      const hub = new CANNON.Body({ mass: 0 });
      const cross = spinnerBody(g.userData.arm, g.userData.capTo);
      return {
        parts: [{ body: hub, mesh: null }, { body: cross, mesh: g.getObjectByName('cross') }],
        constraints: [pinned(hub, cross, new CANNON.Vec3(0, 0, 0))],
      };
    },
    offset: () => new THREE.Vector3(1, 1, 0),
  },

  // Stands still until something bumps it, then falls away from whatever
  // hit it and whacks what's on that side.
  hammer: {
    name: 'Hammer',
    w: 1, h: 2.75,
    rotatable: true, // turned, it still holds still until hit, then swings away from the hitter
    // Rotate turns it about its hinge (the middle of the base's top), so the
    // base stays put (see turnedAnchor).
    turnsAbout: (size) => [0.5 * (size?.w || 1), 0.25],
    // Like the Ball, Size steps its head medium -> large -> small. Drag the head to set the handle's length
    // (see handleAt): it rides in `size` as { hl }, the handle's length from
    // the hinge to the head, kept through a resize. Lengths step by ¼ and
    // every head is a whole number of quarters tall, so the head's edges
    // stay on the grid at every size.
    resizable: { sizes: [[1, 1], [1.5, 1], [0.5, 1]] },
    keepOnResize: ['hl'],
    pivotY: 0.25, // the hinge, on top of the base (a 1 x ¼ plate, the same on every size)
    // Each size's head (wide x tall) and weight, the handle's length, and
    // how high the head's middle sits above the base's bottom.
    dims(item) {
      const w = item?.size?.w || 1;
      const head = w < 0.75 ? { headW: 0.5, headH: 0.25, mass: 1 } : w > 1.25 ? { headW: 1.5, headH: 0.75, mass: 4 } : { headW: 1, headH: 0.5, mass: 2 };
      // Older saves sized the whole hammer (its box height) instead of the head.
      const old = item?.size?.h && item.size.h !== 1 ? Math.max(0.75, Math.round((2.75 * item.size.h - 0.75) * SUB) / SUB) : null;
      const hl = item?.size?.hl ?? old ?? 2;
      return { ...head, w, hl, headY: this.pivotY + hl + head.headH / 2 };
    },
    // Handle: the head. Dragged along the handle (in the hammer's own,
    // maybe turned, frame) it sets the handle's length.
    handleAt(item, px, py, pad = 0) {
      const { headW, headH } = this.dims(item);
      const c = this.handlePoint(item);
      const { quaternion } = itemTransform(item);
      const local = new THREE.Vector3(px - c.x, py - c.y, 0).applyQuaternion(quaternion.clone().invert());
      return Math.abs(local.x) <= headW / 2 + pad && Math.abs(local.y) <= headH / 2 + pad ? 'head' : null;
    },
    handlePoint(item) {
      const { position, quaternion } = itemTransform(item);
      const p = new THREE.Vector3(0, this.dims(item).headY, 0).applyQuaternion(quaternion).add(position);
      return { x: p.x, y: p.y };
    },
    dragHandle(item, handle, to) {
      const d = this.dims(item);
      const { position, quaternion } = itemTransform(item);
      // How far the head's middle is along the handle, less the hinge and half the head.
      const along = new THREE.Vector3(to.x - position.x, to.y - position.y, 0).applyQuaternion(quaternion.clone().invert()).y;
      const hl = Math.max(0.75, Math.round((along - this.pivotY - d.headH / 2) * SUB) / SUB); // at least ¾ of a cell of handle
      const { w = 1, h = 1 } = item.size || {};
      return { w, h, hl };
    },
    makeMesh(item) {
      const d = this.dims(item);
      const g = new THREE.Group();
      g.userData.hammer = d;
      g.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.6), standard(0x8a7f6a))).translateY(0.125));
      const mallet = named(new THREE.Group(), 'mallet');
      mallet.position.y = d.headY;
      mallet.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(d.headW, d.headH, 0.6), standard(0xb5523b))));
      const handle = d.headY - d.headH / 2 - this.pivotY;
      mallet.add(shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.2, handle, 0.3), standard(0xc98f4a))).translateY(-d.headH / 2 - handle / 2));
      g.add(mallet);
      return g;
    },
    makeBodies(g) {
      const { headW, headH, mass, headY } = g.userData.hammer;
      const base = new CANNON.Body({ mass: 0, material: MATS.surface });
      base.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.125, 0.3)), new CANNON.Vec3(0, 0.125, 0));
      // Kinematic (it holds still) until something hits it; see onStep.
      // The ball's material: a hard head glances off what it hits instead of gripping it.
      const mallet = lockToPlane(new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: MATS.marble }));
      // The handle's body stops short of the hinge, so its corners don't
      // drag on the base as it swings.
      const handle = headY - headH / 2 - this.pivotY - 0.25;
      mallet.addShape(new CANNON.Box(new CANNON.Vec3(headW / 2, headH / 2, 0.3)));
      if (handle > 0.01) mallet.addShape(new CANNON.Box(new CANNON.Vec3(0.1, handle / 2, 0.15)), new CANNON.Vec3(0, -headH / 2 - handle / 2, 0));
      const hinge = new CANNON.HingeConstraint(base, mallet, {
        pivotA: new CANNON.Vec3(0, this.pivotY, 0), axisA: Z_AXIS,
        pivotB: new CANNON.Vec3(0, this.pivotY - headY, 0), axisB: Z_AXIS,
      });
      // A hit anywhere, the base too (a ball rolling along the ground hits
      // that first), sets it falling away from the hitter: which side of the
      // handle it came from, in the hammer's own (maybe turned) frame.
      // Straight on, it goes one way.
      const bumped = (ev) => {
        if (mallet.type !== CANNON.Body.KINEMATIC || ev.body.mass === 0 || mallet.userData) return;
        // A real hit, not just something resting against it from the start.
        if (Math.abs(ev.contact.getImpactVelocityAlongNormal()) < 0.5) return;
        const rel = mallet.quaternion.inverse().vmult(ev.body.position.vsub(mallet.position));
        mallet.userData = { fall: rel.x > 0.05 ? 1 : -1, mass };
      };
      mallet.addEventListener('collide', bumped);
      base.addEventListener('collide', bumped);
      return {
        parts: [{ body: base, mesh: null }, { body: mallet, mesh: g.getObjectByName('mallet') }],
        constraints: [hinge],
      };
    },
    onStep(item) {
      const mallet = item.parts?.[1]?.body;
      if (!mallet?.userData?.fall || mallet.type !== CANNON.Body.KINEMATIC) return;
      mallet.type = CANNON.Body.DYNAMIC;
      mallet.mass = mallet.userData.mass;
      mallet.updateMassProperties();
      mallet.angularVelocity.z = 2.5 * mallet.userData.fall; // a firm nudge over the top, away from the hitter
      mallet.wakeUp();
    },
    offset: () => new THREE.Vector3(0.5, 0, 0),
  },

  // A curved tube that turns a rolling ball a quarter turn: in from the left
  // along the top, out the bottom. Rotate and Flip for every other way. Its
  // inside is exactly a ball wide, and slippery (5% of the usual friction). Like the Ball, Size steps it ball (inside 1) -> bowling ball (2)
  // -> marble (½), each in the same proportions: walls a quarter thick, the
  // inner one curving round the bottom-left corner at half the inside's width.
  pipe: {
    name: 'Pipe',
    w: 2, h: 2,
    // Its wall pieces run a touch long to leave no gaps; its outline stops
    // at its box, so it sits flush on the ground and against neighbours.
    clipOutline: true,
    rotatable: true,
    flippable: true,
    // Box side = 1.5 x inside + ½: 2 (ball), 3½ (bowling ball), 1¼ (marble).
    resizable: { sizes: [[1, 1], [1.75, 1.75], [0.625, 0.625]] },
    // The wall radii [inner, outer] for a pipe of this size.
    walls(item) {
      const side = 2 * (item?.size?.w || 1);
      const bore = (side - 0.5) / 1.5;
      const r = bore / 2;
      return [[r, r + 0.25], [r + 0.25 + bore, side]];
    },
    makeMesh(item) {
      const g = new THREE.Group();
      const flip = item?.flip ? -1 : 1;
      const half = (item?.size?.w || 1); // half the box side
      for (const [r0, r1] of this.walls(item)) {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, r1, 0, Math.PI / 2, false);
        shape.absarc(0, 0, r0, Math.PI / 2, 0, true);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 24 });
        geo.translate(-half, -half, -0.5);
        if (flip < 0) { geo.scale(-1, 1, 1); geo.computeVertexNormals(); }
        g.add(shadowed(new THREE.Mesh(geo, standard(0x7fa6c9, { side: THREE.DoubleSide }))));
      }
      return g;
    },
    makeBody(item) {
      const flip = item?.flip ? -1 : 1;
      const half = (item?.size?.w || 1);
      const body = new CANNON.Body({ mass: 0, material: MATS.pipe });
      // Each wall as a fan of short boxes along its arc.
      const n = 16;
      for (const [r0, r1] of this.walls(item)) {
        const r = (r0 + r1) / 2, t = (r1 - r0) / 2;
        const len = r * (Math.PI / 2) / n * 1.15; // a touch long so there are no gaps
        for (let k = 0; k < n; k++) {
          const a = (k + 0.5) / n * Math.PI / 2;
          const q = new CANNON.Quaternion().setFromAxisAngle(Z_AXIS, flip * (a + Math.PI / 2));
          body.addShape(new CANNON.Box(new CANNON.Vec3(len / 2, t, 0.5)), new CANNON.Vec3(flip * (r * Math.cos(a) - half), r * Math.sin(a) - half, 0), q);
        }
      }
      return body;
    },
    offset: () => new THREE.Vector3(1, 1, 0),
  },

  // Two platforms on a rope over a wheel: push one down and the other comes
  // up. A heavy thing on one side lifts a light one on the other. Each
  // platform can be dragged up or down on its own while building, from
  // level with the wheel's middle down to the ground (so a pulley set up high has a long
  // drop), and a pulley can start uneven: the rope is as long as the two
  // heights make it. The heights ride in `size` as { left, right }, beside
  // its Size, so they save, undo and share like the rest.
  pulley: {
    name: 'Pulley',
    w: 3, h: 4,
    // Like the Ball, Size steps it medium -> large -> small, each with
    // platforms as wide as that ball (the ball, bowling ball, marble).
    // Widths 3, 5 and 1½; heights 4, 5½ and 2½.
    resizable: { sizes: [[1, 1], [5 / 3, 1.375], [0.5, 0.625]] },
    // Size keeps its middle across and its base where they are.
    pivotX: (size) => 1.5 * (size?.w || 1),
    // Each size's wheel radius, platform width, the wheel's middle (where the
    // ropes leave it: the highest a platform's top goes) and the platforms'
    // tops to begin with.
    dims(item) {
      const w = item?.size?.w || 1;
      if (w < 0.75) return { r: 0.5, plat: 0.5, wheelY: 1.75, start: 0.75 };
      if (w > 1.25) return { r: 1.5, plat: 2, wheelY: 3.75, start: 2.5 };
      return { r: 1, plat: 1, wheelY: 2.75, start: 1.5 };
    },
    // The lowest a platform's top goes, from the pulley's base: resting on the ground.
    minTop: (item) => 0.25 - item.y,
    idleFrame: true, // keep the ropes drawn while editing
    tops(item) {
      const { start } = this.dims(item);
      return [item?.size?.left ?? start, item?.size?.right ?? start];
    },
    // Handles: parts that drag on their own while building (see main.js).
    // Which platform (if any) is at board point (px, py), give or take `pad`.
    handleAt(item, px, py, pad = 0) {
      const { r, plat } = this.dims(item);
      const mid = item.x + 1.5 * (item.size?.w || 1), tops = this.tops(item);
      for (const [k, side] of ['left', 'right'].entries()) {
        const x0 = mid + (k ? r : -r) - plat / 2, top = item.y + tops[k];
        if (px >= x0 - pad && px <= x0 + plat + pad && py >= top - 0.25 - pad && py <= top + pad) return side;
      }
      return null;
    },
    // The pulley with platform `side`'s top at board point `to` (only its
    // height counts), on the quarter grid and within its travel.
    dragHandle(item, side, { y: py }) {
      const top = THREE.MathUtils.clamp(Math.round((py - item.y) * SUB) / SUB, this.minTop(item), this.dims(item).wheelY);
      const [left, right] = this.tops(item);
      const { w = 1, h = 1 } = item.size || {};
      return { w, h, left, right, [side]: top };
    },
    // Where a handle is (its top middle): a drag keeps the grab's offset from it.
    handlePoint(item, side) { return { x: item.x, y: item.y + this.tops(item)[side === 'left' ? 0 : 1] }; },
    makeMesh(item) {
      const d = this.dims(item);
      const g = new THREE.Group();
      g.userData.pulley = d;
      const wheel = named(new THREE.Group(), 'wheel');
      wheel.position.set(0, d.wheelY, 0);
      // An open wheel: rim, spokes and hub, so you can see through it.
      const metal = standard(0x9a9aa8, { metalness: 0.3 });
      wheel.add(shadowed(new THREE.Mesh(new THREE.TorusGeometry(d.r - 0.08, 0.08, 10, 40), metal)));
      for (let k = 0; k < 3; k++) {
        const spoke = shadowed(new THREE.Mesh(new THREE.BoxGeometry(2 * d.r - 0.2, 0.08, 0.12), metal));
        spoke.rotation.z = (k * Math.PI) / 3;
        wheel.add(spoke);
      }
      wheel.add(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16).rotateX(Math.PI / 2), standard(0x5a6b7a))));
      g.add(wheel);
      const tops = this.tops(item);
      for (const [k, side] of [-1, 1].entries()) {
        const plat = named(shadowed(new THREE.Mesh(new THREE.BoxGeometry(d.plat, 0.25, 0.8), standard(0x6f8f4a))), `plat${side}`);
        plat.position.set(side * d.r, tops[k] - 0.125, 0);
        g.add(plat);
        g.add(named(shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), standard(0x333333))), `rope${side}`));
      }
      this.onFrame({ mesh: g });
      return g;
    },
    makeBodies(g) {
      // The wheel's shape, for building only: nothing can be built through
      // it, and it's easy to grab. During a run nothing hits it (no
      // collision group or mask), so balls pass through as before.
      const { r, wheelY } = g.userData.pulley;
      const wheel = new CANNON.Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
      wheel.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0, wheelY, 0));
      const parts = [];
      for (const side of [-1, 1]) {
        const w = g.userData.pulley.plat;
        const plat = new CANNON.Body({ mass: 0.5 * w, shape: new CANNON.Box(new CANNON.Vec3(w / 2, 0.125, 0.4)), material: MATS.surface });
        plat.linearFactor.set(0, 1, 0); // straight up and down
        plat.angularFactor.set(0, 0, 0);
        // It passes over the ground: the rope stops it there instead (onStep).
        // Resting on the ground, it would be pushed up and tug the rope.
        plat.collisionFilterMask = ~GROUND_GROUP;
        parts.push({ body: plat, mesh: g.getObjectByName(`plat${side}`) });
      }
      parts.push({ body: wheel, mesh: null });
      return { parts, constraints: [] };
    },
    onStep(item) {
      // The rope: one platform goes down exactly as fast as the other goes
      // up. Share their momentum every step, and hold their heights to the
      // rope's length and the travel limits.
      const [a, b] = [item.parts?.[0]?.body, item.parts?.[1]?.body];
      if (!a || !b) return;
      a.userData ??= { rope: a.position.y + b.position.y }; // the rope's length: fixed per run
      const rope = a.userData.rope;
      const v = (a.mass * a.velocity.y - b.mass * b.velocity.y) / (a.mass + b.mass);
      a.velocity.y = v;
      b.velocity.y = -v;
      const lo = 0.125, hi = item.y + this.dims(item).wheelY - 0.125; // centres: on the ground, level with the wheel's middle
      // Share any stretch or slack evenly between the two sides (one side
      // taking it all would make them creep), then keep both in range.
      const slack = a.position.y + b.position.y - rope;
      const lowA = Math.max(lo, rope - hi), highA = Math.min(hi, rope - lo); // a's range, the rope keeping b in its own
      const ya = THREE.MathUtils.clamp(a.position.y - slack / 2, lowA, highA);
      // At a limit, stop only if still heading past it: a platform resting on
      // the ground must still be pulled up when the other side goes down.
      if ((ya <= lowA && v < 0) || (ya >= highA && v > 0)) { a.velocity.y = 0; b.velocity.y = 0; }
      a.position.y = ya;
      b.position.y = rope - ya;
    },
    onFrame(item) {
      // Ropes from the wheel's sides down to the platforms; the wheel turns
      // as they move during a run.
      const g = item.mesh;
      for (const side of [-1, 1]) {
        const plat = g.getObjectByName(`plat${side}`), rope = g.getObjectByName(`rope${side}`);
        const { r, wheelY: top } = g.userData.pulley, bottom = plat.position.y + 0.125;
        rope.position.set(side * r, (top + bottom) / 2, 0);
        rope.scale.y = Math.max(0.01, top - bottom);
      }
      const left = g.getObjectByName('plat-1');
      // The left rope rises with its platform, carrying the wheel's left edge
      // up: that's a clockwise turn (negative about z).
      g.getObjectByName('wheel').rotation.z = left.userData.rest ? -(left.position.y - left.userData.rest.p.y) / g.userData.pulley.r : 0;
    },
    offset: () => new THREE.Vector3(1.5, 0, 0),
  },
};

// The spinner's cross: two flat arms, each ending in a round end whose edge
// reaches exactly `capTo` from the middle (the spinner's box edge), so a tip
// only just touches the ground or a neighbour, and slides past instead of
// digging in the way a square corner would.
const ARM_T = 0.2; // arm thickness
const capAt = (capTo) => capTo - ARM_T / 2; // the round end's middle
function spinnerCross(color, name, capTo) {
  // One piece: a plus with round ends, so the only outline is its outside.
  const cross = named(new THREE.Group(), name);
  cross.add(shadowed(new THREE.Mesh(roundCrossGeometry(capAt(capTo), ARM_T / 2, 0.6), standard(color))));
  return cross;
}
// A plus, arms `t` either side of their middle line, each ending in a half
// circle centred `len` from the middle; `depth` thick.
function roundCrossGeometry(len, t, depth) {
  const s = new THREE.Shape();
  s.moveTo(t, t);
  s.lineTo(len, t);
  s.absarc(len, 0, t, Math.PI / 2, -Math.PI / 2, true); // right end
  s.lineTo(t, -t);
  s.lineTo(t, -len);
  s.absarc(0, -len, t, 0, -Math.PI, true); // bottom end
  s.lineTo(-t, -t);
  s.lineTo(-len, -t);
  s.absarc(-len, 0, t, -Math.PI / 2, -3 * Math.PI / 2, true); // left end
  s.lineTo(-t, t);
  s.lineTo(-t, len);
  s.absarc(0, len, t, Math.PI, 0, true); // top end
  s.lineTo(t, t);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
function spinnerBody(arm, capTo) {
  const body = lockToPlane(new CANNON.Body({ mass: 0.6 * arm / 1.75, material: MATS.surface })); // longer arms weigh more
  body.angularDamping = 0.3;
  for (const a of [0, Math.PI / 2]) {
    body.addShape(new CANNON.Box(new CANNON.Vec3(arm / 2, ARM_T / 2, 0.3)), new CANNON.Vec3(0, 0, 0), new CANNON.Quaternion().setFromAxisAngle(Z_AXIS, a));
    for (const end of [-1, 1]) {
      // A hair smaller than it looks, so a tip that just touches the ground
      // never rubs on it (a touching contact still has friction).
      body.addShape(new CANNON.Sphere(ARM_T / 2 - 0.01), new CANNON.Vec3(end * capAt(capTo) * Math.cos(a), end * capAt(capTo) * Math.sin(a), 0));
    }
  }
  return body;
}
// Turns about a pin through both bodies' origins.
function pinned(a, b, pivot) {
  return new CANNON.HingeConstraint(a, b, { pivotA: pivot, axisA: Z_AXIS, pivotB: new CANNON.Vec3(0, 0, 0), axisB: Z_AXIS });
}
// The Ball's sizes, smallest first: Size steps through them. In a level's
// parts, `ball` stands for a ball of any size.
const BALL_SIZES = ['marble', 'ball', 'bowling'];
const partType = (type) => (BALL_SIZES.includes(type) ? 'ball' : type);

const GADGET_ORDER = ['ball', 'domino', 'plank', 'ramp', 'block', 'bucket', 'seesaw', 'bouncer', 'conveyor', 'launcher', 'fan', 'pendulum', 'bell', 'pipe', 'spinner', 'hammer', 'pulley', 'star'];

// A resizable gadget's `size` scales its normal width and height separately
// ({ w, h }); null means its normal size.
const NORMAL_SIZE = { w: 1, h: 1 };
const sizeOf = (type, size) => (GADGETS[type].resizable && size) || NORMAL_SIZE;

// Footprint size after `rot` quarter turns (odd turns swap width and height).
function footprintSize(type, rot = 0, size = null) {
  const def = GADGETS[type];
  const k = sizeOf(type, size);
  // Rounded: a size given as a fraction (3.75 / 2.75) must come out exactly
  // on the grid, not a hair off it.
  const w = Math.round(def.w * k.w * 1e6) / 1e6, h = Math.round(def.h * k.h * 1e6) / 1e6;
  if (def.swing) return { w, h }; // swinging gadgets never turn
  return rot % 2 ? { w: h, h: w } : { w, h };
}

// World-space transform for an item at cell (x, y), turned `rot` quarter
// turns counter-clockwise about the center of its footprint.
function itemTransform(item) {
  const def = GADGETS[item.type];
  const rot = def.swing ? 0 : (item.rot || 0);
  const angle = rot * Math.PI / 2;
  const quaternion = new THREE.Quaternion().setFromAxisAngle(Z_AXIS_THREE, angle);
  const k = sizeOf(item.type, item.size);
  const turned = footprintSize(item.type, rot, item.size);
  // The mesh origin sits at `offset` inside the unturned footprint; spin that
  // about the footprint center, then drop it into the turned footprint.
  const local = def.offset().multiply(new THREE.Vector3(k.w, k.h, 1))
    .sub(new THREE.Vector3(def.w * k.w / 2, def.h * k.h / 2, 0)).applyQuaternion(quaternion);
  const position = local.add(new THREE.Vector3(item.x + turned.w / 2, item.y + turned.h / 2, 0));
  return { position, quaternion };
}

// Subgrid cells covering a w x h box at (x, y), all in units (multiples of
// 1/4). Cells are [i, j] subgrid indices: cell i spans i/SUB..(i+1)/SUB.
function rectCells(x, y, w, h) {
  const cells = [];
  const i0 = Math.round(x * SUB), j0 = Math.round(y * SUB);
  const nw = Math.round(w * SUB), nh = Math.round(h * SUB);
  for (let i = 0; i < nw; i++) {
    for (let j = 0; j < nh; j++) cells.push([i0 + i, j0 + j]);
  }
  return cells;
}

// The subgrid cells an item at (x, y) turned `rot` takes up on the board.
// A gadget's own `footprint(rot)` lists its cells relative to its anchor,
// unturned; otherwise it fills its whole box.
function footprintCells(type, x, y, rot = 0, size = null) {
  const def = GADGETS[type];
  const i0 = Math.round(x * SUB), j0 = Math.round(y * SUB);
  if (def.footprint) {
    const r = def.swing ? 0 : rot;
    const k = sizeOf(type, size);
    const dims = { w: def.w * k.w, h: def.h * k.h, off: k.off || 0 }; // unturned
    const W = Math.round(dims.w * SUB), H = Math.round(dims.h * SUB);
    // Turn each cell about the box: (i, j) -> after r quarter turns CCW.
    return def.footprint(rot, dims).map(([i, j]) => {
      for (let k = 0; k < r; k++) [i, j] = [(k % 2 ? W : H) - 1 - j, i];
      return [i0 + i, j0 + j];
    });
  }
  const { w, h } = footprintSize(type, rot, size);
  return rectCells(x, y, w, h);
}

// ---------------------------------------------------------------------------
// Physics world for a run. Shared by the game (src/main.js) and the headless
// level checker (tools/check-levels.cjs), so both play out exactly the same.
// Each item needs its mesh in place (see placeMesh). Sets item.parts.
// hooks: onImpact(body, ev), onBell(item, ev), onGoal(item).
// ---------------------------------------------------------------------------

// Physics runs at 120 steps a second. At 60, a small fast marble could sink
// a good way into the ground in one step, and the push back out stopped it
// dead. stepFrame advances one 1/60 s frame (used by scripted runs).
const PHYSICS_STEP = 1 / 120;
// The ground's collision group, so a pulley's platforms can pass over it.
const GROUND_GROUP = 4;
function stepFrame(world) {
  world.step(PHYSICS_STEP);
  world.step(PHYSICS_STEP);
}

function buildWorld(items, hooks = {}) {
  // No sleeping: a slowly leaning domino wouldn't wake a sleeping neighbour.
  // Pieces are about a metre big, so real gravity feels sluggish. Crank it up for a toy feel.
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -30, 0), allowSleep: false });
  // Friction, as multiples of FRICTION.
  const f = (k) => k * FRICTION;
  world.defaultContactMaterial.friction = f(1);
  world.defaultContactMaterial.restitution = 0.05;
  // Dominoes grip the floor so they tip rather than slide. Between dominoes
  // friction must be exactly 0: any friction at all makes a leaning row of
  // dominoes lock up in cannon-es instead of toppling along.
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.domino, MATS.surface, { friction: f(2.5), restitution: 0.0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.domino, MATS.domino, { friction: 0, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.marble, MATS.surface, { friction: f(1), restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.marble, MATS.domino, { friction: 0, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.marble, MATS.bouncy, { friction: f(0.75), restitution: 0.95 }));
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.domino, MATS.bouncy, { friction: f(0.75), restitution: 0.6 }));
  // A pipe's inside is exactly a ball wide: barely any friction. (Even this
  // little is enough for a ball to roll round the bend rather than slide.)
  world.addContactMaterial(new CANNON.ContactMaterial(MATS.marble, MATS.pipe, { friction: f(0.05), restitution: 0.05 }));

  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: MATS.surface, collisionFilterGroup: GROUND_GROUP });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  // Gadget forces (fan etc.) run inside each physics sub-step, never per
  // frame: at 120 Hz a frame may run no sub-step, and forces would pile up.
  world.addEventListener('preStep', () => {
    for (const item of items) GADGETS[item.type].onStep?.(item, world, world.dt);
  });

  const wp = new THREE.Vector3(), wq = new THREE.Quaternion();
  for (const item of items) {
    const def = GADGETS[item.type];
    item.mesh.updateMatrixWorld(true);
    const built = def.makeBodies
      ? def.makeBodies(item.mesh)
      : { parts: [{ body: def.makeBody(item), mesh: item.mesh }], constraints: [] };
    for (const part of built.parts) {
      const src = part.mesh || item.mesh;
      src.getWorldPosition(wp);
      src.getWorldQuaternion(wq);
      part.body.position.copy(wp);
      part.body.quaternion.copy(wq);
      world.addBody(part.body);
      if (hooks.onImpact && part.body.mass > 0) part.body.addEventListener('collide', (ev) => hooks.onImpact(part.body, ev));
      if (hooks.onBell && def.ring) part.body.addEventListener('collide', (ev) => hooks.onBell(item, ev));
    }
    built.constraints.forEach((c) => world.addConstraint(c));
    item.parts = built.parts;
    if (def.goal && hooks.onGoal) built.parts[0].body.addEventListener('collide', () => hooks.onGoal(item));
  }
  return world;
}

// ---------------------------------------------------------------------------
// Outlines: where a gadget really is, for placing things. Made from its
// physics shapes, flattened onto the board: boxes and the ramp's wedge
// become polygons, balls (and round ends) circles. Two gadgets fit side by
// side wherever their outlines don't overlap; just touching is fine. Worked
// out once for each shape, size, turn and flip at (0, 0), then moved.
// ---------------------------------------------------------------------------

const OUTLINE_EPS = 1e-3; // overlaps thinner than this are touching
const _outlines = new Map();
function localOutline(type, rot = 0, size = null, flip = false) {
  const k = `${type}|${rot}|${size ? JSON.stringify(size) : ''}|${flip ? 1 : 0}`;
  let shapes = _outlines.get(k);
  if (shapes) return shapes;
  const def = GADGETS[type];
  const item = { type, x: 0, y: 0, rot, size, flip };
  item.mesh = def.makeMesh(item);
  placeMesh(item);
  item.mesh.updateMatrixWorld(true);
  const parts = def.makeBodies ? def.makeBodies(item.mesh).parts : [{ body: def.makeBody(item), mesh: item.mesh }];
  const box = footprintSize(type, rot, size); // for clipOutline
  shapes = [];
  const bp = new THREE.Vector3(), bq = new THREE.Quaternion(), sq = new THREE.Quaternion(), v = new THREE.Vector3();
  for (const part of parts) {
    (part.mesh || item.mesh).getWorldPosition(bp);
    (part.mesh || item.mesh).getWorldQuaternion(bq);
    part.body.shapes.forEach((shape, i) => {
      const o = part.body.shapeOffsets[i], oq = part.body.shapeOrientations[i];
      sq.set(oq.x, oq.y, oq.z, oq.w).premultiply(bq);
      const toWorld = (x, y, z) => v.set(x, y, z).applyQuaternion(sq).add(new THREE.Vector3(o.x, o.y, o.z).applyQuaternion(bq)).add(bp);
      if (shape instanceof CANNON.Sphere) {
        const c = toWorld(0, 0, 0);
        shapes.push({ circle: [c.x, c.y, shape.radius] });
      } else if (shape instanceof CANNON.Box) {
        const h = shape.halfExtents;
        shapes.push({ poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const p = toWorld(a * h.x, b * h.y, 0); return [p.x, p.y]; }) });
      } else if (shape instanceof CANNON.ConvexPolyhedron) {
        shapes.push({ poly: hull2d(shape.vertices.map((p) => { const w = toWorld(p.x, p.y, p.z); return [w.x, w.y]; })) });
      }
    });
  }
  if (def.clipOutline) shapes = shapes.map((s) => (s.poly ? { poly: clipToBox(s.poly, box.w, box.h) } : s)).filter((s) => !s.poly || s.poly.length >= 3);
  // The mesh was only for measuring: free it.
  item.mesh.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material !== EDGE_MATERIAL) o.material.dispose?.(); });
  if (_outlines.size > 400) _outlines.clear(); // a pulley's every height is a new entry
  _outlines.set(k, shapes);
  return shapes;
}
// The outline of a gadget at (x, y), with its bounding box.
function outlineAt(type, x, y, rot = 0, size = null, flip = false) {
  const shapes = localOutline(type, rot, size, flip).map((s) => (s.circle
    ? { circle: [s.circle[0] + x, s.circle[1] + y, s.circle[2]] }
    : { poly: s.poly.map(([px, py]) => [px + x, py + y]) }));
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of shapes) {
    const pts = s.circle ? [[s.circle[0] - s.circle[2], s.circle[1] - s.circle[2]], [s.circle[0] + s.circle[2], s.circle[1] + s.circle[2]]] : s.poly;
    for (const [px, py] of pts) { box[0] = Math.min(box[0], px); box[1] = Math.min(box[1], py); box[2] = Math.max(box[2], px); box[3] = Math.max(box[3], py); }
  }
  return { shapes, box };
}
// Whether two outlines (from outlineAt) overlap by more than a touch.
function outlinesOverlap(a, b) {
  if (a.box[0] >= b.box[2] - OUTLINE_EPS || b.box[0] >= a.box[2] - OUTLINE_EPS
    || a.box[1] >= b.box[3] - OUTLINE_EPS || b.box[1] >= a.box[3] - OUTLINE_EPS) return false;
  return a.shapes.some((s) => b.shapes.some((t) => shapesOverlap(s, t)));
}
function shapesOverlap(s, t) {
  if (s.circle && t.circle) return Math.hypot(s.circle[0] - t.circle[0], s.circle[1] - t.circle[1]) < s.circle[2] + t.circle[2] - OUTLINE_EPS;
  if (s.circle) return circlePolyOverlap(s.circle, t.poly);
  if (t.circle) return circlePolyOverlap(t.circle, s.poly);
  return polysOverlap(s.poly, t.poly);
}
// Separating axes: convex polygons overlap unless some edge's normal
// separates them.
function polysOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      const nx = y0 - y1, ny = x1 - x0, len = Math.hypot(nx, ny);
      if (len < 1e-9) continue;
      const span = (p) => { let lo = Infinity, hi = -Infinity; for (const [px, py] of p) { const d = (px * nx + py * ny) / len; lo = Math.min(lo, d); hi = Math.max(hi, d); } return [lo, hi]; };
      const [alo, ahi] = span(a), [blo, bhi] = span(b);
      if (ahi <= blo + OUTLINE_EPS || bhi <= alo + OUTLINE_EPS) return false;
    }
  }
  return true;
}
function circlePolyOverlap([cx, cy, r], poly) {
  // Inside, or nearer an edge than its radius.
  let inside = false, best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((cx - xi) * dx + (cy - yi) * dy) / l2));
    best = Math.min(best, Math.hypot(cx - (xi + t * dx), cy - (yi + t * dy)));
  }
  return inside || best < r - OUTLINE_EPS;
}
// Whether point (px, py) is on an outline, or within `pad` of it.
function outlineContains(outline, px, py, pad = 0) {
  return outline.shapes.some((s) => (s.circle ? Math.hypot(px - s.circle[0], py - s.circle[1]) <= s.circle[2] + pad : circlePolyOverlap([px, py, pad + 2 * OUTLINE_EPS], s.poly)));
}
// The lowest point of an outline (nothing may go below the ground).
const outlineBottom = (outline) => outline.box[1];
// A convex polygon cut down to the box 0..w x 0..h (Sutherland-Hodgman).
function clipToBox(poly, w, h) {
  const edges = [[(p) => p[0] >= 0, (a, b) => [0, a[1] + (b[1] - a[1]) * (0 - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= w, (a, b) => [w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= 0, (a, b) => [a[0] + (b[0] - a[0]) * (0 - a[1]) / (b[1] - a[1]), 0]],
    [(p) => p[1] <= h, (a, b) => [a[0] + (b[0] - a[0]) * (h - a[1]) / (b[1] - a[1]), h]]];
  let out = poly;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

// 2D convex hull (monotone chain), counter-clockwise.
function hull2d(points) {
  const p = points.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Put an item's mesh where it sits on the board.
function placeMesh(item) {
  const { position, quaternion } = itemTransform(item);
  item.mesh.position.copy(position);
  item.mesh.quaternion.copy(quaternion);
  GADGETS[item.type].applyRot?.(item);
}
