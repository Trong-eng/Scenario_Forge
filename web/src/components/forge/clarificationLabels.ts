import type { Language } from '@/shared/preferences/types';

/** Human labels for catalog values.
 *
 *  These name *values* (`intersection`, `heavy_rain`), never fields, and the
 *  value itself always travels to the provider unchanged -- only the label
 *  beside it is translated. A translated value would stop matching the
 *  versioned catalog it is checked against.
 *
 *  Four layers, in order, because a fixed table cannot keep up with a
 *  vocabulary the provider owns:
 *
 *    1. a label the provider supplied -- it knows its own catalog
 *    2. this table, for values whose natural phrasing is not compositional
 *    3. composition from the token vocabulary, so a combination nobody has
 *       seen yet still reads in the chosen language
 *    4. the raw identifier, shown as it is
 *
 *  Layer 4 is deliberate. Showing the provider's own identifier is truthful;
 *  guessing at a translation for a word this file has never met would put
 *  invented text next to a real catalog value, which is the failure this
 *  product exists to avoid.
 */

/** Values whose phrasing is idiomatic rather than word-by-word. */
const FIELD_LABELS: Record<Language, Record<string, Record<string, string>>> = {
  vi: {
    location: { intersection: 'Ngã tư / giao lộ', roundabout: 'Vòng xuyến', straight_road: 'Đường thẳng' },
    weather: { clear: 'Trời quang' },
    road_surface: { dry: 'Mặt đường khô', wet: 'Mặt đường ướt' },
    time_of_day: { daytime: 'Ban ngày', nighttime: 'Ban đêm' },
    visibility: { clear: 'Tầm nhìn rõ', poor: 'Tầm nhìn kém' },
    approach: { left: 'Từ bên trái', right: 'Từ bên phải', front: 'Từ phía trước', rear: 'Từ phía sau' },
    role: { ego: 'Xe ego', actor: 'Đối tượng tham gia', adversary: 'Đối tượng đối nghịch', other: 'Đối tượng khác' },
    maneuver: { cut_in: 'Cắt ngang vào làn', hard_brake: 'Phanh gấp', roundabout: 'Đi vào vòng xuyến' },
    type: { vehicle: 'Ô tô', walker: 'Người đi bộ' },
    controller: { vehicle: 'Ô tô', walker: 'Người đi bộ' },
    side: { left: 'Bên trái', right: 'Bên phải', front: 'Phía trước', rear: 'Phía sau' },
    topology: { intersection: 'Ngã tư / giao lộ', roundabout: 'Vòng xuyến', straight_road: 'Đường thẳng' },
  },
  en: {
    location: { straight_road: 'Straight road' },
    road_surface: { dry: 'Dry road', wet: 'Wet road' },
    time_of_day: { daytime: 'Daytime', nighttime: 'Night' },
    visibility: { clear: 'Clear visibility', poor: 'Poor visibility' },
    approach: { left: 'From the left', right: 'From the right', front: 'From the front', rear: 'From behind' },
    role: { ego: 'Ego vehicle', actor: 'Participating actor', adversary: 'Adversary actor', other: 'Other actor' },
    maneuver: { cut_in: 'Cuts into the lane', hard_brake: 'Hard brake', roundabout: 'Enters the roundabout' },
    type: { vehicle: 'Car', walker: 'Pedestrian' },
    controller: { vehicle: 'Car', walker: 'Pedestrian' },
    topology: { straight_road: 'Straight road' },
  },
};

/** The thing a value is about. Vietnamese puts it first. */
const HEADS: Record<string, string> = {
  rain: 'mưa', fog: 'sương mù', mist: 'sương', snow: 'tuyết', storm: 'bão', wind: 'gió',
  cloud: 'mây', clouds: 'mây', sun: 'nắng', road: 'đường', surface: 'mặt đường', lane: 'làn',
  highway: 'đường cao tốc', intersection: 'ngã tư', roundabout: 'vòng xuyến', crossing: 'lối băng qua',
  visibility: 'tầm nhìn', night: 'ban đêm', day: 'ban ngày', noon: 'buổi trưa', dusk: 'hoàng hôn',
  dawn: 'bình minh', sunset: 'hoàng hôn', sunrise: 'bình minh', brake: 'phanh', turn: 'rẽ',
  merge: 'nhập làn', overtake: 'vượt', vehicle: 'ô tô', car: 'ô tô', bicycle: 'xe đạp',
  motorcycle: 'xe máy', truck: 'xe tải', bus: 'xe buýt', pedestrian: 'người đi bộ', walker: 'người đi bộ',
};

/** What qualifies it. Vietnamese puts it after the head. */
const MODIFIERS: Record<string, string> = {
  heavy: 'lớn', light: 'nhẹ', hard: 'gấp', soft: 'nhẹ', wet: 'ướt', dry: 'khô',
  clear: 'quang', poor: 'kém', good: 'tốt', straight: 'thẳng', curved: 'cong',
  narrow: 'hẹp', wide: 'rộng', slow: 'chậm', fast: 'nhanh', high: 'cao', low: 'thấp',
  mid: 'vừa', moderate: 'vừa', dense: 'dày', thin: 'mỏng', sudden: 'đột ngột', left: 'trái', right: 'phải',
};

const FIELD_ALIASES: Record<string, string> = { time: 'time_of_day', conflict: 'topology' };

function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Composes a label from the value's own tokens.
 *
 *  Only the shapes that compose correctly are attempted: a bare head, a bare
 *  modifier, or one modifier and one head. Vietnamese word order puts the head
 *  first, so `heavy_rain` reads "Mưa lớn". Anything longer would need grammar
 *  this file has no business guessing at, so it declines and the caller shows
 *  the identifier instead.
 */
function composeLabel(value: string, language: Language): string | null {
  const tokens = value.toLowerCase().split(/[_\-\s]+/).filter(Boolean);
  if (!tokens.length) return null;
  if (language === 'en') {
    // English already reads in the order the identifier is written.
    return tokens.every((token) => token in HEADS || token in MODIFIERS)
      ? titleCase(tokens.join(' '))
      : null;
  }
  if (tokens.length === 1) {
    const [only] = tokens;
    const word = HEADS[only] ?? MODIFIERS[only];
    return word ? titleCase(word) : null;
  }
  if (tokens.length === 2) {
    const [first, second] = tokens;
    if (MODIFIERS[first] && HEADS[second]) return titleCase(`${HEADS[second]} ${MODIFIERS[first]}`);
    if (HEADS[first] && MODIFIERS[second]) return titleCase(`${HEADS[first]} ${MODIFIERS[second]}`);
  }
  return null;
}

export function clarificationValueLabel(field: string, value: string, language: Language = 'vi'): string {
  const canonical = value.trim();
  if (!canonical) return value;
  const key = field.trim().toLowerCase();
  const known = FIELD_LABELS[language]?.[FIELD_ALIASES[key] ?? key]?.[canonical.toLowerCase()];
  if (known) return known;
  return composeLabel(canonical, language) ?? titleCase(canonical.replaceAll('_', ' '));
}

export function clarificationChoiceLabel(field: string, label: string, value: string, language: Language = 'vi'): string {
  const suppliedLabel = label.trim();
  // The provider owns its catalog, so a label it wrote outranks anything here.
  return suppliedLabel && suppliedLabel.toLowerCase() !== value.trim().toLowerCase()
    ? suppliedLabel
    : clarificationValueLabel(field, value, language);
}
