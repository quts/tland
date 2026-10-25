/**
 * Every measurement the character is built from, in one place.
 *
 * One relative coordinate system: y = 0 is the ground, and roughly one unit
 * is a tile before `AVATAR_SCALE` is applied. Each component reads from here
 * and nothing hard-codes a position of its own, so the proportions can be
 * tuned without hunting through the geometry.
 */
export const PROPORTIONS = {
  /**
   * The head: nearly spherical rather than a squashed disc, so the face
   * stays full from the side as well as the front.
   */
  head: {
    y: 0.8,
    radius: 0.3,
    /** Vertical scale. Close to 1 keeps the skull round. */
    squash: 0.98,
  },

  /**
   * A rounded mushroom standing off the skull, cut by a single tilted plane.
   *
   * `fringe` and `nape` are where that plane crosses the front and the back
   * of the head; everything between is the plane, not an interpolation. A
   * plane cutting a sphere leaves a circle, which is why the hem reads as one
   * smooth contour from every angle instead of a diagonal across the cheek.
   */
  hair: {
    /** Multiple of the head radius: the gap is what gives the cut body. */
    thickness: 1.075,
    /** Extra height on the crown, so it domes rather than caps. */
    lift: 1.03,
    /** Where the hem sits, as sphere angles down from the crown. */
    brow: Math.PI * 0.25,
    fringe: Math.PI * 0.335,
    nape: Math.PI * 0.66,
    /** How much of the hem rolls back under, giving the edge thickness. */
    roll: 0.3,
  },

  ear: { x: 0.272, y: -0.085, radius: 0.048, scale: [0.6, 1.05, 0.8] },

  /**
   * The torso, as a lathe profile of [radius, height] pairs: an egg, drawn
   * in at the shoulders, fullest at the belly, rounded off at the bottom.
   * The arms attach where it is still broad, so the shoulder sinks in.
   */
  body: {
    profile: [
      [0, 0.03], [0.1, 0.035], [0.175, 0.072], [0.228, 0.142], [0.247, 0.232],
      [0.25, 0.305], [0.241, 0.382], [0.222, 0.442], [0.182, 0.492],
      [0.123, 0.527], [0.075, 0.541], [0, 0.545],
    ] as ReadonlyArray<readonly [number, number]>,
    /** Flattening front to back, so the figure is wider than it is deep. */
    depth: 0.88,
    /** Top of the profile: where a collar or a scarf sits. */
    collarY: 0.545,
  },

  /**
   * The arm, measured down its own axis from the shoulder joint.
   *
   * The joint sits *inside* the upper torso, not on its surface. That is what
   * makes the shoulder continuous: the sleeve's upper end is a true
   * hemisphere centred on the joint, so the part of it outside the body reads
   * as a rounded swelling out of the torso while the rest stays buried. On
   * the surface it stands up as a point instead, and grazing the surface from
   * in front draws the shallow U-shaped crease that reads as a groove.
   *
   * `tilt` turns the whole arm about the joint. Because every part is placed
   * along this axis in the arm's own space, the joint is the pivot for free:
   * the arm is its own Three.js group, posed by rotating that group.
   */
  arm: {
    /** Inside the torso at this height — see above. */
    pivot: { x: 0.177, y: 0.455, z: 0 },
    /** Radians from straight down: outward and downward, 15-25 degrees. */
    tilt: 0.42,
    radius: 0.098,
    /**
     * The sleeve as one profile turned about the arm's axis, as
     * [radius, distance down from the joint]: a hemisphere over the joint,
     * then a soft taper to an open cuff. One surface, so there is no ring
     * where a cap would meet a tube, and the upper end is exactly a
     * hemisphere, so it swells rather than peaks.
     */
    sleeve: [
      [0, -0.098], [0.038, -0.09], [0.069, -0.069], [0.09, -0.038], [0.098, 0],
      [0.097, 0.06], [0.094, 0.13], [0.09, 0.2], [0.085, 0.247],
      [0.079, 0.263], [0.072, 0.27],
    ] as ReadonlyArray<readonly [number, number]>,
    /**
     * The hand plugs the open cuff: an ellipsoid stretched along the arm and
     * wider at the hem than the hem itself, so the wrist stays inside the
     * sleeve and nothing shows through the opening.
     */
    hand: { at: 0.305, radius: 0.082, stretch: 1.18 },
  },

  /** Short, rounded, and clearly two of them. */
  shoe: { x: 0.098, y: 0.052, radius: 0.085, scale: [1, 0.62, 1.3] },

  /**
   * Avatars are modelled about a tile tall and drawn larger: chunky enough
   * to read at phone zoom, the way the 2D sprites stand taller than a tile.
   */
  scale: 1.85,
  /** Where the top of the tallest hat ends, drawn size, for name tags. */
  top: 1.3 * 1.85,
} as const;

/** Top of the bare skull: hats stack from here, hair domes over it. */
export const HEAD_TOP =
  PROPORTIONS.head.y + PROPORTIONS.head.radius * PROPORTIONS.head.squash;

/**
 * A point `down` the arm's axis from the shoulder pivot, on the given side.
 * Used for both geometry and, later, for posing: the pivot never moves.
 */
export function alongArm(side: number, down: number): [number, number, number] {
  const { pivot, tilt } = PROPORTIONS.arm;
  return [
    side * (pivot.x + down * Math.sin(tilt)),
    pivot.y - down * Math.cos(tilt),
    pivot.z,
  ];
}
