import { HOUSE_DATA } from './buildingLayout.js';

const STYLES = [
  '經典暖木款', '現代灰白款', '紅磚復古款', '深色紳士款',
  '清新綠植款', '海洋藍調款', '溫暖米白款', '工業水泥款',
  '粉彩柔和款', '橄欖綠款', '深藍夜色款', '奶茶木質款',
] as const;
const COLUMNS = [[6, 312], [326, 312], [644, 312], [963, 311]] as const;
const ROWS = [[44, 206], [298, 209], [556, 215]] as const;

/** Display windows into the unchanged image supplied by the user. */
export const BAR_INTERIORS = HOUSE_DATA.houses.map((house, index) => {
  const [x, width] = COLUMNS[index % 4]!;
  const [y, height] = ROWS[Math.floor(index / 4)]!;
  return { house: house.name, style: STYLES[index]!, viewBox: `${x} ${y} ${width} ${height}` };
});

export const BAR_IMAGE = '/images/bar-interiors-reference.jpg';
