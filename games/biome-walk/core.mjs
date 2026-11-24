export const BIOMES = [
  { name: 'はじまりの草原', note: '緑の草と、小さな花。旅はここから。', ground: '#83a659', path: '#d6c290', sky: '#91c4cc', fog: '#c9d9ba', leaf: '#548a4a', kind: 'meadow' },
  { name: '木漏れ日の森', note: '木々のすきまに、陽だまりが落ちている。', ground: '#527c47', path: '#aa9c71', sky: '#7faeae', fog: '#b6ceac', leaf: '#306d48', kind: 'forest' },
  { name: '黄金の砂丘', note: '砂の海を、どこまでも。遠くにサボテンの影。', ground: '#d7ad67', path: '#e7c78c', sky: '#b9d6d1', fog: '#ebd6a3', leaf: '#6b9363', kind: 'desert' },
  { name: 'しずかな雪原', note: '白い大地と、とがった木々。空気まで澄んでいる。', ground: '#dce8df', path: '#c2d4cc', sky: '#a7c2d6', fog: '#e0e9ea', leaf: '#d2e5df', kind: 'snow' },
  { name: '桜色の丘', note: '薄紅の木の下を抜けて、花びらの向こうへ。', ground: '#8fa779', path: '#ddc0a4', sky: '#bed1d8', fog: '#ead7da', leaf: '#e7a9be', kind: 'cherry' },
  { name: '青い水辺', note: '青い水面。細い木道が、向こう岸へ続く。', ground: '#5bafb4', path: '#b29b75', sky: '#90cbd9', fog: '#c2e1d9', leaf: '#609d78', kind: 'water' },
  { name: '赤土の峡谷', note: '積み重なった時間が、赤い岩になってそびえる。', ground: '#b87351', path: '#d39b6f', sky: '#b9c6c9', fog: '#ddba9a', leaf: '#ba7655', kind: 'canyon' },
  { name: '琥珀の林', note: '赤、黄、橙。秋の色が道を包みこむ。', ground: '#a59751', path: '#c4ad73', sky: '#a9c5c6', fog: '#e0d0a3', leaf: '#cc783f', kind: 'autumn' },
  { name: '星灯りのきのこ森', note: '夜色の森に、淡い色のきのこが並んでいる。', ground: '#464561', path: '#85738b', sky: '#242e50', fog: '#77708d', leaf: '#b497cf', kind: 'mushroom' },
  { name: '雲の高原', note: '雲と同じ高さまで来た。旅の先には、まだ道がある。', ground: '#8cafa4', path: '#c4c8b0', sky: '#88b7d2', fog: '#e3e9dc', leaf: '#6d9d8b', kind: 'highland' },
];
// Mulberry32: public-domain implementation documented by bryc.
// Source and license: https://github.com/bryc/code/blob/master/jshash/PRNGs.md
// Used for scenery variation only, not for cryptographic purposes.
export function random(seed) {
  let n = seed >>> 0;
  return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function makeJourney(seed) {
  const rng = random(seed);
  const segments = [{ start: 0, end: 42, biome: 0 }];
  const seen = new Set([0]);
  function extend(step) {
    while (segments.at(-1).end <= step + 180) {
      const previous = segments.at(-1);
      const unseen = BIOMES.map((_, i) => i).filter(i => !seen.has(i));
      const options = unseen.length && rng() < .82 ? unseen : BIOMES.map((_, i) => i).filter(i => i !== previous.biome);
      const biome = options[Math.floor(rng() * options.length)];
      segments.push({ start: previous.end, end: previous.end + 72 + Math.floor(rng() * 55), biome });
      seen.add(biome);
    }
  }
  function at(step) { extend(step); return segments.find(s => step < s.end) || segments.at(-1); }
  function visited(step) { extend(step); return segments.filter(s => s.start <= step); }
  extend(0);
  return { segments, at, visited };
}
export function readSave(raw) {
  try {
    const value = JSON.parse(raw);
    if (value && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 4294967295 && Number.isFinite(value.steps) && value.steps >= 0 && value.steps <= 1000000) return value;
  } catch { /* A blocked or damaged save must not prevent walking. */ }
  return null;
}
