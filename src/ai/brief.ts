// Campaign brief interpretation: free text → structured matching criteria.
// The local parser is deterministic and explainable. The Meta provider
// (api/meta/brief.ts) returns the same shape, and sanitizeCriteria() treats
// its output as untrusted before anything uses it.
import type { Category, ContentFormat, Currency, Objective, Platform } from '../domain/types';
import { CATEGORIES, COUNTRIES, CURRENCIES, FORMATS, LANGUAGES, OBJECTIVES, PLATFORMS } from '../domain/constants';

export interface BriefCriteria {
  summary: string;
  categories: Category[];
  countries: string[];
  languages: string[];
  gender: 'female' | 'male' | 'all' | null;
  ageMin: number | null;
  ageMax: number | null;
  budget: { amount: number; currency: Currency } | null;
  creatorCount: number | null;
  followersMin: number | null;
  followersMax: number | null;
  objective: Objective | null;
  platforms: Platform[];
  formats: ContentFormat[];
  interests: string[];
}

export interface Interpretation {
  criteria: BriefCriteria;
  interpretedBy: 'local' | 'meta';
  model?: string;
  detected: string[];
  assumptions: string[];
}

export const emptyCriteria = (): BriefCriteria => ({
  summary: '', categories: [], countries: [], languages: [], gender: null, ageMin: null, ageMax: null, budget: null,
  creatorCount: null, followersMin: null, followersMax: null, objective: null, platforms: [], formats: [], interests: [],
});

const CATEGORY_WORDS: [Category, RegExp][] = [
  ['beauty', /\b(skin ?care|beauty|makeup|make-up|cosmetic|serum|moisturi[sz]er|sunscreen|hair ?care|haircare|fragrance|perfume|nails?)\b/i],
  ['fashion', /\b(fashion|clothing|apparel|streetwear|sneakers?|outfits?|style|jewel(le)?ry|accessor(y|ies))\b/i],
  ['lifestyle', /\b(lifestyle|home decor|everyday|daily life)\b/i],
  ['food', /\b(food|drinks?|beverages?|snacks?|restaurant|recipes?|spices?|cooking|jollof|coffee|tea|juice|brew(ery)?)\b/i],
  ['fitness', /\b(fitness|gym|workout|wellness|health|yoga|running|nutrition|supplements?)\b/i],
  ['tech', /\b(tech|technology|gadgets?|software|smartphones?|apps?|saas|laptops?|ai tool)\b/i],
  ['travel', /\b(travel|hotels?|hospitality|tourism|resorts?|airlines?|holiday|getaway)\b/i],
  ['education', /\b(education|learning|courses?|schools?|university|students?|tutoring|edtech)\b/i],
  ['entertainment', /\b(entertainment|music|comedy|film|movies?|concerts?|festival|skits?)\b/i],
  ['parenting', /\b(parent(s|ing)?|mums?|moms?|mothers|babies|baby|kids|children|family)\b/i],
  ['finance', /\b(finance|fintech|bank(ing)?|invest(ing|ment)?|savings?|money|insurance|business|loans?|payments?)\b/i],
  ['gaming', /\b(gaming|gamers?|video games?|esports|console|streamers?)\b/i],
];

const COUNTRY_ALIASES: [string, RegExp][] = [
  ['Nigeria', /\b(nigeria|nigerian|lagos|abuja|port harcourt|ibadan)\b/i],
  ['Ghana', /\b(ghana|ghanaian|accra|kumasi)\b/i],
  ['Kenya', /\b(kenya|kenyan|nairobi|mombasa)\b/i],
  ['South Africa', /\b(south africa|south african|johannesburg|cape town|durban|joburg)\b/i],
  ['Egypt', /\b(egypt|egyptian|cairo)\b/i],
  ['United Kingdom', /\b(uk|u\.k\.|united kingdom|britain|british|london|manchester)\b/i],
  ['United States', /\b(us|u\.s\.|usa|united states|america|american|new york|los angeles)\b/i],
  ['Canada', /\b(canada|canadian|toronto)\b/i],
  ['France', /\b(france|french market|paris)\b/i],
  ['Germany', /\b(germany|german market|berlin)\b/i],
  ['United Arab Emirates', /\b(uae|dubai|abu dhabi|emirates)\b/i],
  ['India', /\b(india|indian|mumbai|delhi)\b/i],
  ['Brazil', /\b(brazil|brazilian|são paulo|sao paulo)\b/i],
];

const CURRENCY_PATTERNS: [Currency, RegExp][] = [
  ['NGN', /(₦|\bngn\b|\bnaira\b|\bn(?=\s?\d))/i],
  ['GHS', /(gh₵|₵|\bghs\b|\bcedis?\b)/i],
  ['KES', /(\bksh\b|\bkes\b|\bshillings?\b)/i],
  ['ZAR', /(\bzar\b|\brand\b|\br(?=\s?\d))/i],
  ['GBP', /(£|\bgbp\b|\bpounds?\b)/i],
  ['EUR', /(€|\beur\b|\beuros?\b)/i],
  ['USD', /(\$|\busd\b|\bdollars?\b)/i],
];

const OBJECTIVE_WORDS: [Objective, RegExp][] = [
  ['launch', /\b(launch(ing)?|new product|introduc(e|ing))\b/i],
  ['sales', /\b(sales|sell|purchases?|conversions?|revenue|discount codes?|promo codes?)\b/i],
  ['app_downloads', /\b(downloads?|installs?)\b/i],
  ['leads', /\b(leads?|sign-?ups?|enquir(y|ies)|waitlist)\b/i],
  ['traffic', /\b(traffic|clicks?|website visits?|landing page)\b/i],
  ['event', /\b(event|concert|festival|attendance|tickets?|registrations?)\b/i],
  ['community', /\b(community|followers growth|grow (our )?(followers|community))\b/i],
  ['engagement', /\b(engagement|conversation|comments|interaction|ugc)\b/i],
  ['awareness', /\b(awareness|visibility|reach|product interest|brand love)\b/i],
];

const PLATFORM_WORDS: [Platform, RegExp][] = [
  ['instagram', /\b(instagram|\big\b|reels?)\b/i],
  ['tiktok', /\b(tik ?tok)\b/i],
  ['youtube', /\b(youtube|shorts|vlogs?)\b/i],
  ['x', /\b(twitter|\bx\b posts?)\b/i],
  ['linkedin', /\blinkedin\b/i],
  ['snapchat', /\bsnap(chat)?\b/i],
  ['twitch', /\btwitch\b/i],
];

const FORMAT_WORDS: [ContentFormat, RegExp][] = [
  ['short_video', /\b(short videos?|reels?|tik ?toks?|shorts|short-form)\b/i],
  ['long_video', /\b(long-form|long videos?|vlogs?|reviews? videos?|tutorials?)\b/i],
  ['story', /\bstor(y|ies)\b/i],
  ['carousel', /\bcarousels?\b/i],
  ['static_post', /\b(static posts?|photos?|images?)\b/i],
  ['ugc_asset', /\bugc\b/i],
  ['live', /\b(live streams?|lives?\b|livestream)\b/i],
];

function parseAmount(num: string, unit?: string): number {
  const n = parseFloat(num.replace(/,/g, ''));
  const u = (unit ?? '').toLowerCase();
  if (/^(bn|billion|b)$/.test(u)) return n * 1e9;
  if (/^(m|mn|million|mil)$/.test(u)) return n * 1e6;
  if (/^(k|thousand)$/.test(u)) return n * 1e3;
  return n;
}

export function interpretLocally(text: string): Interpretation {
  const t = text.slice(0, 4000);
  const c = emptyCriteria();
  const detected: string[] = [];
  const assumptions: string[] = [];
  c.summary = t.trim().split(/(?<=[.!?])\s/)[0]?.slice(0, 200) ?? '';

  c.categories = CATEGORY_WORDS.filter(([, re]) => re.test(t)).map(([id]) => id).slice(0, 3);
  // "app" alone often means fintech/edtech etc.; don't let it drown a clearer niche.
  if (c.categories.length > 1 && c.categories.includes('tech') && !/\b(tech|gadget|software|smartphone|laptop)\b/i.test(t)) c.categories = c.categories.filter((x) => x !== 'tech');
  if (c.categories.length) detected.push(`Categories: ${c.categories.join(', ')}`);

  c.countries = COUNTRY_ALIASES.filter(([, re]) => re.test(t)).map(([n]) => n);
  if (c.countries.length) detected.push(`Markets: ${c.countries.join(', ')}`);

  c.languages = LANGUAGES.filter((l) => new RegExp(`\\b${l}\\b`, 'i').test(t));
  if (c.languages.length) detected.push(`Languages: ${c.languages.join(', ')}`);

  const female = /\b(women|woman|female|ladies|girls|mums?|moms?|mothers)\b/i.test(t);
  const male = /\b(men|man|male|guys|dads?|fathers)\b/i.test(t.replace(/\bwomen\b/gi, ''));
  c.gender = female && !male ? 'female' : male && !female ? 'male' : female && male ? 'all' : null;
  if (c.gender) detected.push(`Audience gender: ${c.gender}`);

  const age = t.match(/\b(?:aged?|ages|between)?\s*(\d{2})\s?(?:–|-|to|—)\s?(\d{2})\b/i);
  if (age && Number(age[1]) >= 13 && Number(age[2]) <= 80 && Number(age[1]) < Number(age[2])) {
    c.ageMin = Number(age[1]);
    c.ageMax = Number(age[2]);
    detected.push(`Ages ${c.ageMin}–${c.ageMax}`);
  } else if (/\bgen ?z\b/i.test(t)) {
    c.ageMin = 18; c.ageMax = 27;
    assumptions.push('Read “Gen Z” as ages 18–27.');
  } else if (/\bmillennials?\b/i.test(t)) {
    c.ageMin = 28; c.ageMax = 43;
    assumptions.push('Read “millennials” as ages 28–43.');
  }

  const money = t.match(/(₦|ngn|\bn|\$|usd|£|gbp|€|eur|ksh|kes|gh₵|₵|ghs|zar|\br)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|mn|million|bn|billion|thousand)?\s?(naira|dollars?|pounds?|euros?|cedis?|shillings?|rand)?\b(?=[^%]|$)/gi) ?? [];
  for (const m of money) {
    const parts = m.match(/(₦|ngn|\bn|\$|usd|£|gbp|€|eur|ksh|kes|gh₵|₵|ghs|zar|\br)?\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|mn|million|bn|billion|thousand)?\s?(naira|dollars?|pounds?|euros?|cedis?|shillings?|rand)?/i);
    if (!parts) continue;
    const symbol = `${parts[1] ?? ''} ${parts[4] ?? ''}`.trim();
    if (!symbol) continue;
    const cur = CURRENCY_PATTERNS.find(([, re]) => re.test(symbol))?.[0];
    if (!cur) continue;
    const amount = parseAmount(parts[2], parts[3]);
    if (amount >= 50) {
      c.budget = { amount: Math.round(amount), currency: cur };
      detected.push(`Budget: ${cur} ${Math.round(amount).toLocaleString()}`);
      break;
    }
  }

  const count = t.match(/\b(\d{1,3})\s+(?:\w+\s){0,2}(creators|influencers|ugc creators|content creators)\b/i);
  if (count) { c.creatorCount = Number(count[1]); detected.push(`${c.creatorCount} creators`); }

  const followerRange = t.match(/(\d[\d,.]*\s?k?)\s?(?:–|-|to)\s?(\d[\d,.]*\s?k?)\s+followers/i);
  const toNum = (s: string) => (/k/i.test(s) ? parseFloat(s) * 1000 : parseFloat(s.replace(/,/g, '')));
  if (followerRange) {
    c.followersMin = toNum(followerRange[1]); c.followersMax = toNum(followerRange[2]);
    detected.push(`Followers ${c.followersMin.toLocaleString()}–${c.followersMax.toLocaleString()}`);
  } else if (/\bnano\b/i.test(t)) { c.followersMin = 1000; c.followersMax = 10000; assumptions.push('Read “nano-influencers” as 1K–10K followers.'); }
  else if (/\bmicro\b/i.test(t)) { c.followersMin = 10000; c.followersMax = 50000; assumptions.push('Read “micro-influencers” as 10K–50K followers.'); }

  c.objective = OBJECTIVE_WORDS.find(([, re]) => re.test(t))?.[0] ?? null;
  if (c.objective) detected.push(`Objective: ${OBJECTIVES.find((o) => o.id === c.objective)?.label}`);

  c.platforms = PLATFORM_WORDS.filter(([, re]) => re.test(t)).map(([p]) => p);
  if (c.platforms.length) detected.push(`Platforms: ${c.platforms.join(', ')}`);
  c.formats = FORMAT_WORDS.filter(([, re]) => re.test(t)).map(([f]) => f);

  if (!c.platforms.length) assumptions.push('No platform named, so all platforms are considered.');
  if (!c.budget) assumptions.push('No budget found, so budget fit is not scored.');
  if (c.countries.length && !c.languages.length) assumptions.push('No language named. Add one if your content must be in a specific language.');
  return { criteria: c, interpretedBy: 'local', detected, assumptions };
}

const isCat = (x: unknown): x is Category => CATEGORIES.some((c) => c.id === x);
const isPlat = (x: unknown): x is Platform => PLATFORMS.some((p) => p.id === x);
const isFmt = (x: unknown): x is ContentFormat => FORMATS.some((f) => f.id === x);
const isObj = (x: unknown): x is Objective => OBJECTIVES.some((o) => o.id === x);
const num = (x: unknown, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : null);

/** Validate model output against our enums. Anything unexpected is dropped. */
export function sanitizeCriteria(raw: unknown): BriefCriteria {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const str = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');
  const b = r.budget as Record<string, unknown> | null | undefined;
  const ageMin = num(r.ageMin, 13, 80);
  const ageMax = num(r.ageMax, 13, 80);
  return {
    summary: str(r.summary, 240),
    categories: arr(r.categories).filter(isCat).slice(0, 4),
    countries: arr(r.countries).filter((x): x is string => typeof x === 'string' && COUNTRIES.includes(x)).slice(0, 6),
    languages: arr(r.languages).filter((x): x is string => typeof x === 'string' && LANGUAGES.includes(x)).slice(0, 6),
    gender: r.gender === 'female' || r.gender === 'male' || r.gender === 'all' ? r.gender : null,
    ageMin, ageMax: ageMin != null && ageMax != null && ageMax < ageMin ? null : ageMax,
    budget: b && num(b.amount, 1, 1e12) != null && CURRENCIES.includes(b.currency as Currency) ? { amount: Math.round(b.amount as number), currency: b.currency as Currency } : null,
    creatorCount: num(r.creatorCount, 1, 500),
    followersMin: num(r.followersMin, 0, 1e9),
    followersMax: num(r.followersMax, 0, 1e9),
    objective: isObj(r.objective) ? r.objective : null,
    platforms: arr(r.platforms).filter(isPlat),
    formats: arr(r.formats).filter(isFmt),
    interests: arr(r.interests).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 40)).slice(0, 8),
  };
}

/** JSON schema used for Meta structured output (kept here so client and server agree). */
export const CRITERIA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    categories: { type: 'array', items: { type: 'string', enum: CATEGORIES.map((c) => c.id) } },
    countries: { type: 'array', items: { type: 'string', enum: COUNTRIES } },
    languages: { type: 'array', items: { type: 'string', enum: LANGUAGES } },
    gender: { type: ['string', 'null'], enum: ['female', 'male', 'all', null] },
    ageMin: { type: ['integer', 'null'] },
    ageMax: { type: ['integer', 'null'] },
    budget: { type: ['object', 'null'], properties: { amount: { type: 'number' }, currency: { type: 'string', enum: CURRENCIES } }, required: ['amount', 'currency'] },
    creatorCount: { type: ['integer', 'null'] },
    followersMin: { type: ['integer', 'null'] },
    followersMax: { type: ['integer', 'null'] },
    objective: { type: ['string', 'null'], enum: [...OBJECTIVES.map((o) => o.id), null] },
    platforms: { type: 'array', items: { type: 'string', enum: PLATFORMS.map((p) => p.id) } },
    formats: { type: 'array', items: { type: 'string', enum: FORMATS.map((f) => f.id) } },
    interests: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'categories', 'countries', 'languages', 'gender', 'ageMin', 'ageMax', 'budget', 'creatorCount', 'followersMin', 'followersMax', 'objective', 'platforms', 'formats', 'interests'],
} as const;
