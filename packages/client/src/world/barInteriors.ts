import { HOUSE_DATA } from './buildingLayout.js';

const STYLES = [
  '經典暖木款', '現代灰白款', '紅磚復古款', '深色紳士款',
  '清新綠植款', '海洋藍調款', '溫暖米白款', '工業水泥款',
  '粉彩柔和款', '橄欖綠款', '深藍夜色款', '奶茶木質款',
] as const;
const IMAGES = [
  'classic-warm', 'modern-gray', 'retro-brick', 'dark-gentleman',
  'fresh-green', 'ocean-blue', 'warm-ivory', 'industrial-concrete',
  'soft-pink', 'olive-green', 'midnight-blue', 'milk-tea',
] as const;

/** Each house uses an independently rendered full-resolution image. */
export const BAR_INTERIORS = HOUSE_DATA.houses.map((house, index) => ({
  house: house.name,
  style: STYLES[index]!,
  image: '/images/bars/' + IMAGES[index]! + '-v2.webp',
}));
