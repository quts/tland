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

  /** A rounded mushroom standing off the skull, not a shell hugging it. */
  hair: {
    /** Multiple of the head radius: the gap is what gives the cut body. */
    thickness: 1.075,
    /** Extra height on the crown, so it domes rather than caps. */
    lift: 1.03,
    /** Where the hem sits, as sphere angles down from the crown. */
    brow: Math.PI * 0.25,
    fringe: Math.PI * 0.335,
    nape: Math.PI * 0.7,
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
   * The arm. Everything below is measured down the arm's own axis from the
   * shoulder joint, which is the rotation pivot: `tilt` turns the whole arm
   * about that point, so the shoulder stays put as the hand swings.
   */
  arm: {
    pivot: { x: 0.215, y: 0.442, z: 0.035 },
    /** Radians from straight down. The reference asks for 15-25 degrees. */
    tilt: 0.38,
    /**
     * The sleeve as one profile turned about the arm's axis, measured down
     * from the shoulder joint: a dome over the joint, a soft taper to the
     * cuff, then a lip rolling under to the forearm. Turning the whole thing
     * from one profile is what keeps the shoulder and the sleeve a single
     * surface — a dome plus a cylinder leaves a ring where they meet.
     */
    sleeve: [
      [0, -0.088], [0.046, -0.082], [0.076, -0.06], [0.092, -0.028],
      [0.097, 0.012], [0.095, 0.06], [0.09, 0.12], [0.084, 0.175],
      [0.082, 0.2], [0.074, 0.214], [0.06, 0.22], [0.057, 0.238],
    ] as ReadonlyArray<readonly [number, number]>,
    forearmRadius: 0.057,
    hand: { at: 0.277, radius: 0.085, squash: 0.94 },
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
