// Ready-made contraptions. Each entry is [type, x, y, rot, flip, size]; x and y
// are on the quarter-cell subgrid.
// All of them reach the star when played.

const EXAMPLES = {
  'Domino Run': {
    blurb: 'Marble, ramp, dominoes, star. The classic.',
    items: [
      ['block', 2, 0], ['block', 2, 1], ['block', 2, 2],
      ['block', 3, 0], ['block', 3, 1], ['block', 4, 0], ['block', 4, 1],
      ['ramp', 3, 2, 0, false, { w: 2, h: 1 }], ['marble', 3, 4],
      ['domino', 7, 0], ['domino', 8, 0], ['domino', 9, 0], ['domino', 10, 0], ['domino', 11, 0],
      ['star', 12.5, 0],
    ],
  },

  'Seesaw Launch': {
    blurb: 'A bowling ball slams one end of a seesaw and flings the marble into the star.',
    items: [
      ['block', 2, 0], ['block', 3, 0], ['block', 3, 1],
      ['block', 4, 0], ['block', 4, 1],
      ['seesaw', 5, 0], ['marble', 5, 1],
      ['bowling', 7, 11],
      ['star', 6, 6],
    ],
  },

  'Fan Elevator': {
    blurb: 'One fan rolls the marble up a ramp, a second lifts it, a third blows it across to the star.',
    items: [
      ['fan', 0, 0, 0], ['marble', 1, 1],
      ['ramp', 4, 0, 1], ['fan', 5, 0, 1],
      ['fan', 4, 4, 0],
      ['block', 12, 0], ['block', 12, 1], ['block', 12, 2], ['block', 12, 3], ['block', 12, 4],
      ['star', 12, 5],
    ],
  },

  'Wrecking Ball': {
    blurb: 'A bowling ball rolls into a pendulum, which swings into a row of dominoes.',
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 0, 2],
      ['block', 1, 0], ['block', 1, 1], ['block', 1, 2],
      ['block', 2, 0], ['block', 2, 1], ['block', 3, 0], ['block', 3, 1],
      ['ramp', 2, 2, 0, false, { w: 2, h: 1 }], ['bowling', 2, 3],
      ['pendulum', 6, 1],
      ['domino', 7, 0], ['domino', 8, 0], ['domino', 9, 0],
      ['star', 10.5, 0],
    ],
  },

  'Bounce Alley': {
    blurb: 'The marble rolls off a tower and bounces pad to pad, catching the star mid-air.',
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 0, 2], ['block', 0, 3],
      ['block', 1, 0], ['block', 1, 1], ['block', 1, 2], ['block', 1, 3],
      ['block', 2, 0], ['block', 2, 1], ['block', 2, 2], ['block', 2, 3],
      ['ramp', 1, 4, 0, false, { w: 2, h: 1 }], ['marble', 1, 4.75],
      ['bouncer', 4.5, 0], ['bouncer', 9.5, 0],
      ['star', 11, 3],
    ],
  },

  'Launch & Catch': {
    blurb: 'A launcher shoots the marble off a tower onto a conveyor, which carries it back into the star above a bucket.',
    items: [
      ['block', 1, 0], ['block', 1, 1], ['block', 1, 2], ['block', 2, 0], ['block', 2, 1], ['block', 2, 2],
      ['launcher', 1, 3, 3], ['marble', 1.25, 2.75],
      ['bucket', 3.5, 0], ['star', 3.5, 0.75],
      ['block', 5, 0], ['block', 6, 0], ['conveyor', 5, 1, 0, true],
    ],
  },

  'Plank Bridge': {
    blurb: 'The marble rolls down a ramp, across a loose plank bridge, and off the end into a row of dominoes.',
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 0, 2],
      ['block', 1, 0], ['block', 1, 1], ['block', 1, 2],
      ['block', 2, 0], ['block', 2, 1], ['block', 3, 0], ['block', 3, 1],
      ['ramp', 2, 2, 0, false, { w: 2, h: 1 }], ['marble', 2, 2.75],
      ['block', 4, 0], ['block', 4, 1, 0, false, { w: 1, h: 0.75 }], ['plank', 4, 1.75],
      ['block', 6, 0], ['block', 6, 1, 0, false, { w: 1, h: 0.75 }],
      ['domino', 9, 0], ['domino', 10, 0], ['domino', 11, 0],
      ['star', 12.5, 0],
    ],
  },

  'Bell Ringer': {
    blurb: 'A pendulum, pulled back, swings into a bell and the star behind it.',
    items: [
      ['pendulum', 6, 1, -1],
      ['bell', 8, 2.25],
      ['star', 8, 1],
    ],
  },

  'Pipe Shot': {
    blurb: 'A marble drops into a pipe. The pipe turns it. It shoots out to the star.',
    items: [
      ['marble', 2.25, 5],
      ['pipe', 2, 0, 1, true],
      ['star', 6, 0],
    ],
  },

  'Spinner Drop': {
    blurb: 'A marble lands on a spinner. The spinner turns. The marble rolls off to the star.',
    items: [
      ['marble', 3.25, 4],
      ['spinner', 2, 0, 1], // x
      ['star', 6, 0],
    ],
  },

  'Hammer Time': {
    blurb: 'A marble bumps the hammer. The hammer falls. It knocks down the dominoes.',
    items: [
      ['block', 0, 0, 0, false, { w: 2, h: 2 }], ['ramp', 0, 2, 0, false, { w: 2, h: 1 }], ['marble', 0, 3],
      ['hammer', 3, 0],
      ['domino', 5.5, 0], ['domino', 6.5, 0], ['domino', 7.5, 0],
      ['star', 8.25, 0],
    ],
  },

  'Pulley Lift': {
    blurb: 'The pulley starts uneven. The ball is heavy. It pulls its side down. The marble goes up into the star.',
    items: [
      ['pulley', 2, 0, 0, false, { w: 1, h: 1, left: 1, right: 0.25 }],
      ['ball', 2, 1],
      ['marble', 4, 0.25],
      ['star', 4, 1.25],
    ],
  },

  // Tall machines: they fill a phone held upright.
  'Zigzag': {
    blurb: 'The marble rolls down ramp after ramp. It bounces off a wall each time. It knocks the dominoes into the star.',
    items: [
      ['ramp', 1, 12, 0, false, { w: 2, h: 1 }], ['marble', 1, 13],
      ['ramp', 3, 11, 0, false, { w: 2, h: 1 }],
      ['block', 6, 7], ['block', 6, 8], ['block', 6, 9], ['block', 6, 10], ['block', 6, 11],
      ['ramp', 4, 7, 0, true, { w: 2, h: 1 }], ['ramp', 2, 6, 0, true, { w: 2, h: 1 }],
      ['block', 0, 0], ['block', 0, 1], ['block', 0, 2], ['block', 0, 3],
      ['block', 0, 4], ['block', 0, 5], ['block', 0, 6], ['block', 0, 7],
      ['ramp', 1, 3, 0, false, { w: 2, h: 1 }], ['ramp', 3, 2, 0, false, { w: 2, h: 1 }],
      ['domino', 5, 0], ['domino', 6, 0],
      ['star', 7, 0],
    ],
  },

  'Pipe Drop': {
    blurb: 'The marble rolls down two ramps and hits a wall. It falls a long way into the pipe. The pipe turns it into the dominoes.',
    items: [
      ['ramp', 5, 12, 0, true, { w: 2, h: 1 }], ['marble', 6, 13],
      ['ramp', 3, 11, 0, true, { w: 2, h: 1 }],
      ['block', 1, 10], ['block', 1, 11], ['block', 1, 12],
      ['pipe', 2, 0, 1, true],
      ['domino', 5, 0], ['domino', 6, 0],
      ['star', 7, 0],
    ],
  },

  'Tower Bounce': {
    blurb: 'The marble rolls off a tall tower. It bounces off the pad and up into the star.',
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 0, 2], ['block', 0, 3], ['block', 0, 4],
      ['block', 0, 5], ['block', 0, 6], ['block', 0, 7], ['block', 0, 8], ['block', 0, 9],
      ['ramp', 0, 10, 0, false, { w: 2, h: 1 }], ['marble', 0, 11],
      ['bouncer', 5, 0],
      ['star', 7, 7],
    ],
  },
};
