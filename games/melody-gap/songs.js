const twinkle = [
  [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
  [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
];
const twinkleMiddle = [
  [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
];
const joy = [
  [66, 1], [66, 1], [67, 1], [69, 1], [69, 1], [67, 1], [66, 1], [64, 1],
  [62, 1], [62, 1], [64, 1], [66, 1],
];
const sakura = [
  [69, 1], [69, 1], [71, 2], [69, 1], [69, 1], [71, 2],
  [69, 1], [71, 1], [72, 1], [71, 1], [69, 1], [71, .5], [69, .5], [65, 2],
  [64, 1], [60, 1], [64, 1], [65, 1], [64, 1], [64, .5], [60, .5], [59, 2],
];

export const songs = [
  {
    name: 'きらきら星', bpm: 100, voice: 'piano',
    source: 'https://imslp.org/wiki/Ah%21_vous_diraije%2C_Maman_%28Mozart%2C_Wolfgang_Amadeus%29',
    score: [...twinkle, ...twinkleMiddle, ...twinkleMiddle, ...twinkle],
  },
  {
    name: '歓喜の歌', bpm: 80, voice: 'strings',
    source: 'https://imslp.org/wiki/Symphony_No.9_-_An_die_Freude_%28Beethoven%2C_Ludwig_van%29',
    score: [
      ...joy, [66, 1.5], [64, .5], [64, 2],
      ...joy, [64, 1.5], [62, .5], [62, 2],
      [64, 1], [64, 1], [66, 1], [62, 1], [64, 1], [66, .5], [67, .5], [66, 1], [62, 1],
      [64, 1], [66, .5], [67, .5], [66, 1], [64, 1], [62, 1], [64, 1], [57, 2],
      ...joy, [64, 1.5], [62, .5], [62, 2],
    ],
  },
  {
    name: 'さくらさくら', bpm: 86, voice: 'koto',
    source: 'https://www.jstage.jst.go.jp/article/jjomer/32/2/32_1/_article/-char/ja',
    score: [...sakura, ...sakura.slice(6, 14), [64, 1], [60, 1], [64, 1], [65, 1], [64, 3]],
  },
];
