// Original observation stimuli. These palettes are not clinical confusion axes.
export const PALETTES = [
  { name: 'オリーブ × テラコッタ', background: [0.34, 0.40, 0.18], target: [0.53, 0.31, 0.19] },
  { name: 'ミント × ローズ', background: [0.22, 0.44, 0.35], target: [0.49, 0.30, 0.36] },
  { name: 'ブルー × ライラック', background: [0.20, 0.34, 0.52], target: [0.39, 0.29, 0.47] },
];
export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function makeTrials(random = Math.random) {
  const trials = PALETTES.flatMap((_, palette) => [0, 1].flatMap(level => [0, 1].map(() => ({ palette, level }))));
  const directions = shuffled([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3], random);
  return shuffled(trials, random).map((trial, i) => ({ ...trial, direction: directions[i] }));
}
export function isRing(x, y, direction) {
  const radius = Math.hypot(x, y);
  const angle = Math.atan2(y, x) - direction * Math.PI / 2;
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return radius > 0.33 && radius < 0.69 && Math.abs(wrapped) > 0.48;
}
function encode(linear) {
  const v = Math.max(0, Math.min(1, linear));
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}
export function dotColor(trial, target, luminance) {
  if (trial.practice) {
    const v = encode(target ? 0.08 + luminance * 0.08 : 0.56 + luminance * 0.16);
    return `rgb(${v},${v},${v})`;
  }
  const palette = PALETTES[trial.palette];
  const mix = trial.level === 0 ? 1 : 0.48;
  const color = palette.background.map((v, i) => v + (target ? mix * (palette.target[i] - v) : 0));
  // Identical independent luminance distribution for figure and ground.
  // This does not establish perceptual isoluminance for an individual observer.
  const y = color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
  const factor = (0.16 + luminance * 0.32) / y;
  return `rgb(${color.map(v => encode(v * factor)).join(',')})`;
}
export function summarize(answers) {
  return PALETTES.map((palette, index) => {
    const group = answers.filter(answer => answer.palette === index);
    return { name: palette.name,
      matched: group.filter(answer => answer.choice === answer.direction).length,
      different: group.filter(answer => answer.choice !== 'unsure' && answer.choice !== answer.direction).length,
      unsure: group.filter(answer => answer.choice === 'unsure').length };
  });
}
