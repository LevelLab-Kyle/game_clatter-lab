// Levels, easiest first. Each one has:
//   name      short title
//   goal      one line telling the player what to do; {rotate}, {size} and
//             {flip} show that button's icon from the gadget's menu
//   parts     the gadgets the player gets, as { type: count }
//   items     the locked pieces already on the board
//   solution  one set of parts that reaches the star (checked by
//             tools/check-levels.cjs, never shown in the game)
//   spares    optional: true when the solution still wins with a part left out
//             (the checker otherwise requires every part)
//   tour      optional: true walks the player through it step by step every
//             time, showing the solution as see-through pieces
// Pieces are [type, x, y, rot, flip, size], like the examples (flip mirrors
// ramps and conveyors). A level's new
// gadget is the first level whose parts include it.

const LEVELS = [
  {
    name: 'First Drop',
    goal: 'The marble falls down. Drag a ramp under it. Then it will roll to the star.',
    parts: { ramp: 1 },
    items: [['marble', 2, 5], ['star', 7, 0]],
    solution: [['ramp', 2, 0]],
    tour: true,
  },
  {
    name: 'Other Way',
    goal: 'The star is on the left now. Drag in the ramp. Press {flip} to turn it the other way.',
    parts: { ramp: 1 },
    items: [['marble', 8, 5], ['star', 2, 0]],
    solution: [['ramp', 8, 0, 0, true]],
  },
  {
    name: 'Mind the Gap',
    goal: 'There is a hole. Fill it with blocks so the marble can roll over.',
    parts: { block: 2 },
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 1, 0], ['block', 1, 1], ['block', 2, 0], ['block', 2, 1],
      ['ramp', 0, 2], ['marble', 0, 5],
      ['block', 3, 0], ['block', 4, 0],
      ['block', 5, 0], ['block', 5, 1], ['block', 6, 0], ['block', 6, 1], ['block', 7, 0], ['block', 7, 1],
      ['star', 7, 2],
    ],
    solution: [['block', 3, 1], ['block', 4, 1]],
  },
  {
    name: 'Domino Effect',
    goal: 'The dominoes stop at the gap. Fill it with more dominoes.',
    parts: { domino: 3 },
    spares: true, // a domino chain can jump a one-cell gap, so 2 of the 3 would do
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 1, 0], ['block', 1, 1], ['ramp', 0, 2, 0, false, { w: 2, h: 1 }], ['marble', 0, 2.75],
      ['domino', 5, 0], ['domino', 6, 0], ['domino', 10, 0], ['domino', 11, 0],
      ['star', 12, 0],
    ],
    solution: [['domino', 7, 0], ['domino', 8, 0], ['domino', 9, 0]],
  },
  {
    name: 'Bridge the Gap',
    goal: 'The marble can’t jump the gap. Drag in a ramp. Press {size} until it is long enough to cross.',
    parts: { ramp: 1 },
    items: [
      ['block', 0, 0, 0, false, { w: 3, h: 3 }], ['ramp', 0, 3], ['marble', 0, 5],
      ['block', 5, 0, 0, false, { w: 5, h: 2 }],
      ['star', 9, 2],
    ],
    solution: [['ramp', 3, 2, 0, false, { w: 2, h: 1 }]],
  },
  {
    name: 'Plank Bridge',
    goal: 'Put the plank on the posts to make a bridge.',
    parts: { plank: 1 },
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 1, 0], ['block', 1, 1], ['block', 2, 0], ['block', 2, 1],
      ['ramp', 0, 2], ['marble', 0, 5],
      ['block', 3, 0, 0, false, { w: 0.25, h: 1.75 }], ['block', 5.75, 0, 0, false, { w: 0.25, h: 1.75 }],
      ['block', 6, 0], ['block', 6, 1], ['block', 7, 0], ['block', 7, 1],
      ['star', 7, 2],
    ],
    solution: [['plank', 3, 1.75]],
  },
  {
    name: 'Boing',
    goal: 'The star is up high. Put a bouncer where the marble lands.',
    parts: { bouncer: 1 },
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 0, 2], ['block', 1, 0], ['block', 1, 1], ['block', 1, 2], ['block', 2, 0], ['block', 2, 1], ['block', 2, 2],
      ['ramp', 0, 3], ['marble', 0, 6],
      ['block', 7, 0], ['block', 7, 1],
      ['star', 7, 2],
    ],
    solution: [['bouncer', 4, 0]],
  },
  {
    name: 'Blast Off',
    goal: 'A launcher shoots whatever sits on it when you press ▶.',
    parts: { launcher: 1 },
    items: [['marble', 5, 0.75], ['star', 5, 3]],
    solution: [['launcher', 5, 0]],
  },
  {
    name: 'Seesaw',
    goal: 'A big ball is falling. Use a seesaw to throw the marble up.',
    parts: { seesaw: 1 },
    items: [['block', 4, 0], ['block', 4, 1], ['marble', 5, 1], ['bowling', 7, 6], ['star', 6, 4]],
    solution: [['seesaw', 5, 0]],
  },
  {
    name: 'Perfect Fit',
    goal: 'The marble will fall in the holes. Fill each hole with a ball that fits. Press {size} to change a ball.',
    parts: { ball: 2 },
    items: [
      ['block', 0, 0, 0, false, { w: 3, h: 2 }], ['ramp', 1, 2, 0, false, { w: 2, h: 2 }], ['marble', 1, 4],
      ['block', 3, 0, 0, false, { w: 2, h: 2 }],
      ['block', 5, 0],
      ['block', 6, 0, 0, false, { w: 2.25, h: 2 }],
      ['block', 8.25, 0, 0, false, { w: 0.5, h: 1.5 }],
      ['block', 8.75, 0, 0, false, { w: 4.25, h: 2 }],
      ['star', 12, 2],
    ],
    solution: [['ball', 5, 1], ['marble', 8, 1.5]],
  },
  {
    name: 'Conveyor Belt',
    goal: 'The marble is stuck in the dip. A conveyor can carry it out.',
    parts: { conveyor: 1 },
    items: [
      ['block', 0, 0, 0, false, { w: 1, h: 0.5 }], ['block', 1, 0, 0, false, { w: 1, h: 0.5 }], ['block', 2, 0, 0, false, { w: 1, h: 0.5 }],
      ['marble', 3, 3],
      ['block', 5, 0, 0, false, { w: 1, h: 0.5 }], ['block', 6, 0, 0, false, { w: 1, h: 0.5 }], ['block', 7, 0, 0, false, { w: 1, h: 0.5 }],
      ['block', 8, 0, 0, false, { w: 1, h: 0.5 }], ['block', 9, 0, 0, false, { w: 1, h: 0.5 }],
      ['star', 9, 0.5],
    ],
    solution: [['conveyor', 3, 0]],
  },
  {
    name: 'Updraft',
    goal: 'It is too far to jump. Drag in a fan. Press {rotate} so it blows up and carries the marble over.',
    parts: { fan: 1 },
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 0, 2], ['block', 1, 0], ['block', 1, 1], ['block', 1, 2], ['block', 2, 0], ['block', 2, 1], ['block', 2, 2],
      ['ramp', 0, 3], ['marble', 0, 6],
      ['block', 6, 0], ['block', 6, 1], ['block', 6, 2], ['block', 7, 0], ['block', 7, 1], ['block', 7, 2],
      ['star', 7, 3],
    ],
    solution: [['fan', 3, 0, 1]],
  },
  {
    name: 'Wrecking Ball',
    goal: 'Hang the pendulum. Press {rotate} to pull the ball back. Then it will knock the dominoes over.',
    parts: { pendulum: 1 },
    items: [['domino', 7, 0], ['domino', 8, 0], ['domino', 9, 0], ['star', 10.5, 0]],
    solution: [['pendulum', 6, 1, -1]],
  },
  {
    name: 'Ding!',
    goal: 'The marble flies past the star. Hang the bell in its way to bump it back.',
    parts: { bell: 1 },
    items: [['block', 0, 0, 0, false, { w: 3, h: 3 }], ['ramp', 0, 3], ['marble', 0, 5], ['star', 3, 0]],
    solution: [['bell', 4, 2]],
  },
  {
    name: 'Ramp Run',
    goal: 'Get the marble rolling. Then fill the gaps so the dominoes reach the star.',
    parts: { ramp: 1, domino: 2 },
    items: [
      ['block', 0, 0], ['block', 0, 1], ['block', 1, 0], ['block', 1, 1],
      ['marble', 1, 5],
      ['domino', 4.5, 0], ['domino', 7.5, 0], ['domino', 10.5, 0],
      ['star', 11.5, 0.75],
    ],
    solution: [['ramp', 1, 2], ['domino', 6, 0], ['domino', 9, 0]],
  },
  {
    name: 'Zigzag',
    goal: 'The star is under the shelf. Send the marble right. Then bring it back left.',
    parts: { ramp: 2 },
    items: [
      ['marble', 0, 7],
      ['block', 0, 5, 0, false, { w: 4, h: 1 }],
      ['block', 0, 0, 0, false, { w: 4, h: 1 }],
      ['block', 6, 0, 0, false, { w: 1, h: 4 }], ['block', 6, 4, 0, false, { w: 1, h: 3 }],
      ['star', 0, 1],
    ],
    solution: [['ramp', 0, 6], ['ramp', 4, 1, 0, true, { w: 2, h: 1 }]],
  },
  {
    name: 'Long Bridge',
    goal: 'One plank is too short. Use two. Put a block under where they meet.',
    parts: { block: 2, plank: 2 },
    items: [
      ['block', 0, 0, 0, false, { w: 3, h: 2.25 }], ['ramp', 0, 2.25], ['marble', 0, 4],
      ['block', 3, 0, 0, false, { w: 0.25, h: 2 }],
      ['block', 8.75, 0, 0, false, { w: 0.25, h: 2 }],
      ['block', 9, 0, 0, false, { w: 2, h: 2.25 }],
      ['star', 10, 2.25],
    ],
    solution: [['block', 5.5, 1], ['plank', 3, 2], ['plank', 6, 2]],
  },
  {
    name: 'Double Boing',
    goal: 'One bounce is not enough. Can you make the marble bounce two times?',
    parts: { bouncer: 2 },
    items: [
      ['block', 0, 0, 0, false, { w: 3, h: 4 }], ['ramp', 1, 4, 0, false, { w: 2, h: 1 }], ['marble', 1, 6],
      ['block', 7.5, 0, 0, false, { w: 0.5, h: 2.5 }],
      ['star', 12, 2],
    ],
    solution: [['bouncer', 5, 0], ['bouncer', 9, 0]],
  },
  {
    name: 'Special Delivery',
    goal: 'Shoot the marble off the tower. Then send it back into the bucket.',
    parts: { launcher: 1, conveyor: 1 },
    items: [
      ['block', 12, 0, 0, false, { w: 2, h: 4 }], ['marble', 12, 3.75],
      ['bucket', 10, 0], ['star', 10, 1],
      ['block', 6.5, 0, 0, false, { w: 3, h: 1.5 }],
    ],
    solution: [['launcher', 13, 4, 1], ['conveyor', 7, 1.5]],
  },
  {
    name: 'Swing and Boing',
    goal: 'Knock the domino into the ball. Then bounce the ball over the wall.',
    parts: { pendulum: 1, bouncer: 1 },
    items: [
      ['block', 4, 0], ['block', 4, 1], ['block', 4, 2], ['block', 4, 3],
      ['block', 5, 0], ['block', 5, 1], ['block', 5, 2], ['block', 5, 3],
      ['block', 6, 0], ['block', 6, 1], ['block', 6, 2], ['ramp', 6, 3],
      ['domino', 4.25, 4], ['ball', 5, 4],
      ['block', 10, 0], ['block', 10, 1],
      ['ramp', 11, 0], ['star', 12.5, 0], ['ramp', 14, 0, 0, true],
      ['block', 15, 0], ['block', 15, 1],
    ],
    solution: [['pendulum', 3, 5, -1], ['bouncer', 8, 0]],
  },
  {
    name: 'Heavy Delivery',
    goal: 'Blow the big ball off its shelf. Give it something to bump into so it lands on the seesaw.',
    parts: { fan: 1, block: 1 },
    items: [
      ['block', 6, 0], ['block', 6, 1], ['seesaw', 7, 0], ['marble', 7, 1],
      ['block', 10.5, 0, 0, false, { w: 3.5, h: 4 }], ['block', 10.5, 4, 0, false, { w: 3.5, h: 2 }],
      ['block', 14, 0, 0, false, { w: 1, h: 4 }], ['block', 14, 4, 0, false, { w: 1, h: 4 }],
      ['bowling', 11, 6],
      ['star', 7, 3],
    ],
    solution: [['fan', 13, 6, 2], ['block', 7, 6]],
  },
  {
    name: 'Bounce Lift',
    goal: 'Roll the marble off the edge. Bounce it. Then let the wind carry it to the far shelf.',
    parts: { conveyor: 1, bouncer: 1, fan: 1 },
    items: [
      ['block', 0, 0, 0, false, { w: 4, h: 3 }],
      ['marble', 2, 3.25],
      ['block', 9.5, 0, 0, false, { w: 3, h: 3 }],
      ['star', 11.25, 3],
    ],
    solution: [['conveyor', 1, 3], ['bouncer', 5, 0], ['fan', 7, 0, 1]],
  },
  {
    name: 'Back Under',
    goal: 'Shoot the marble. Finish the dominoes. Then send the ball back under the shelf.',
    parts: { launcher: 1, domino: 1, ramp: 1 },
    items: [
      ['block', 0, 0, 0, false, { w: 8, h: 2 }], ['block', 8, 2, 0, false, { w: 1.5, h: 0.5 }],
      ['marble', 1, 1.75],
      ['domino', 2.5, 2], ['domino', 7, 2],
      ['ball', 8, 2.5],
      ['star', 8, 0],
    ],
    solution: [['launcher', 0, 2, 3], ['domino', 6, 2], ['ramp', 9.5, 0, 0, true]],
  },
  {
    name: 'Up, Over, Back',
    goal: 'Pop the marble out of the pit. Blow it across. Then bring it back under the shelf.',
    parts: { launcher: 1, fan: 1, conveyor: 1 },
    items: [
      ['block', 0, 0, 0, false, { w: 1, h: 3 }], ['marble', 1, 0.25], ['block', 2.25, 0, 0, false, { w: 1, h: 3 }],
      ['block', 3.25, 2.5, 0, false, { w: 2.75, h: 0.5 }],
      ['block', 3.25, 0, 0, false, { w: 2.75, h: 0.5 }], ['star', 4, 0.5],
      ['block', 8, 0, 0, false, { w: 1, h: 4 }], ['block', 8, 4, 0, false, { w: 1, h: 2 }],
    ],
    solution: [['launcher', 1, 0], ['fan', 0, 3], ['conveyor', 6, 0, 0, true]],
  },
  {
    name: 'Grand Machine',
    goal: 'Build the big machine! Shoot, knock, carry, bounce and blow the ball to the star.',
    parts: { launcher: 1, domino: 2, conveyor: 1, bouncer: 1, fan: 1 },
    spares: true, // one domino next to the ball also does it; two keep the row even
    items: [
      ['block', 0, 0, 0, false, { w: 9, h: 2 }],
      ['block', 9, 0, 0, false, { w: 2, h: 1.5 }], ['block', 11, 0, 0, false, { w: 0.5, h: 2 }],
      ['marble', 1, 1.75],
      ['domino', 2.5, 2], ['domino', 4, 2],
      ['ball', 8, 2],
      ['block', 16, 0, 0, false, { w: 2.5, h: 3 }],
      ['star', 17.5, 3],
    ],
    solution: [['launcher', 0, 2, 3], ['domino', 5.5, 2], ['domino', 7, 2], ['conveyor', 9, 1.5], ['bouncer', 12, 0], ['fan', 13, 0, 1]],
  },
];
