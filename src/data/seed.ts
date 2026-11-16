// Demo workspace. EVERYTHING here is fictional sample data: creators, brands,
// results and payments. Profiles carry `sample: true` and the UI labels them.
// Dates are generated relative to "now" so the demo always looks current.
import type {
  Campaign, Category, Collaboration, ContentFormat, CreatorProfile, Currency, DataSource, Database, Deliverable, Offer, Organization,
  PaymentRecord, Platform, RateCard, ResultEntry, Submission, User,
} from '../domain/types';
import { CATEGORIES, DEFAULT_PLANS, DEMO_FX_TO_USD, UPLOAD_TYPES } from '../domain/constants';
import { hashPassword } from '../lib/crypto';
import { DAY, seeded } from '../lib/utils';
import { defaultPrefs } from '../server/notify';

export const DEMO_PASSWORD = 'Tandem-demo-2026';

export const DEMO_ACCOUNTS = [
  { email: 'brand@tandem.demo', name: 'Ada Okafor', kind: 'brand', label: 'Brand', description: 'Owner at Lumi Skincare (Lagos)' },
  { email: 'agency@tandem.demo', name: 'Zainab Yusuf', kind: 'agency', label: 'Agency', description: 'Owner at Northbeam Collective, 2 clients' },
  { email: 'creator@tandem.demo', name: 'Ife Balogun', kind: 'creator', label: 'Creator', description: 'Beauty & lifestyle creator, Lagos' },
  { email: 'client@tandem.demo', name: 'Kwame Asante', kind: 'brand', label: 'Agency client', description: 'Client reviewer at Kora Foods' },
  { email: 'admin@tandem.demo', name: 'Platform Admin', kind: 'admin', label: 'Admin', description: 'Platform administration' },
] as const;

const EXTRA_USERS = [
  { id: 'usr_kemi', email: 'kemi@tandem.demo', name: 'Kemi Adeleke', kind: 'brand' as const },
  { id: 'usr_oliver', email: 'sable@tandem.demo', name: 'Oliver Grant', kind: 'brand' as const },
  { id: 'usr_dami', email: 'dami@tandem.demo', name: 'Dami Ojo', kind: 'agency' as const },
  { id: 'usr_seun', email: 'seun@tandem.demo', name: 'Seun Ogunleye', kind: 'creator' as const },
];

const LOCAL_CURRENCY: Record<string, Currency> = { Nigeria: 'NGN', Ghana: 'GHS', Kenya: 'KES', 'South Africa': 'ZAR', 'United Kingdom': 'GBP', France: 'EUR', Germany: 'EUR' };

type Spec = {
  id: string; name: string; handle: string; country: string; city?: string; cats: Category[]; langs: string[]; formats: ContentFormat[];
  socials: [Platform, number | null, number | null, DataSource][]; female?: number | null; ages?: [string, number][]; markets?: [string, number][];
  bio: string; availability?: CreatorProfile['availability']; verified?: boolean; hideRates?: boolean; hideAudience?: boolean; noRates?: boolean; userId?: string;
  portfolio?: string[]; collabs?: string[];
};

const FIXED: Spec[] = [
  { id: 'cr_ife', userId: 'usr_ife', name: 'Ife Balogun', handle: 'ifeglows', country: 'Nigeria', city: 'Lagos', cats: ['beauty', 'lifestyle'], langs: ['English', 'Yoruba', 'Pidgin'], formats: ['short_video', 'story', 'carousel', 'ugc_asset'],
    socials: [['instagram', 18400, 4.6, 'creator_submitted'], ['tiktok', 31200, 6.1, 'creator_submitted']], female: 78, ages: [['18-24', 34], ['25-34', 47], ['35-44', 13], ['45+', 6]], markets: [['Nigeria', 71], ['United Kingdom', 9], ['Ghana', 6]],
    bio: 'Lagos-based skincare and lifestyle creator. Honest routines for melanin-rich skin, budget dupes and what actually survives Lagos heat.', portfolio: ['Harmattan skin routine (Reel)', 'Five-step routine under ₦20k', 'Sunscreen white-cast test'], collabs: ['Velo Fitness'] },
  { id: 'cr_tomi', name: 'Tomi Akande', handle: 'tomiakande', country: 'Nigeria', city: 'Lagos', cats: ['beauty'], langs: ['English', 'Yoruba'], formats: ['short_video', 'story', 'long_video'],
    socials: [['instagram', 24300, 3.9, 'imported'], ['youtube', 8100, 5.2, 'creator_submitted']], female: 82, ages: [['18-24', 29], ['25-34', 51], ['35-44', 15], ['45+', 5]], markets: [['Nigeria', 76], ['United States', 6]],
    bio: 'Licensed aesthetician turned creator. Ingredient breakdowns, product reviews and acne-safe routines.', verified: true, portfolio: ['Niacinamide myths, explained', 'Acne-safe makeup routine'] },
  { id: 'cr_chiamaka', name: 'Chiamaka Nwosu', handle: 'chiamakaglam', country: 'Nigeria', city: 'Abuja', cats: ['beauty', 'fashion'], langs: ['English', 'Igbo', 'Pidgin'], formats: ['short_video', 'story'],
    socials: [['tiktok', 41200, 7.4, 'creator_submitted'], ['instagram', 12800, 3.1, 'creator_submitted']], female: 74, ages: [['18-24', 46], ['25-34', 38], ['35-44', 11], ['45+', 5]], markets: [['Nigeria', 68], ['Ghana', 7]],
    bio: 'GRWM, glam on a budget and Abuja nightlife looks. Comedy-first beauty content.' },
  { id: 'cr_ama', name: 'Ama Owusu', handle: 'amacooks', country: 'Ghana', city: 'Accra', cats: ['food'], langs: ['English', 'Twi'], formats: ['short_video', 'long_video', 'carousel'],
    socials: [['instagram', 27600, 4.2, 'imported'], ['youtube', 15900, 3.4, 'imported']], female: 64, ages: [['18-24', 22], ['25-34', 44], ['35-44', 24], ['45+', 10]], markets: [['Ghana', 63], ['Nigeria', 11], ['United Kingdom', 9]],
    bio: 'Home cook from Accra. Ghanaian classics, weeknight shortcuts and jollof debates I always win.', portfolio: ['One-pot jollof in 30 minutes', 'Waakye from scratch'] },
  { id: 'cr_kofi', name: 'Kofi Boateng', handle: 'kofieats', country: 'Ghana', city: 'Kumasi', cats: ['food', 'travel'], langs: ['English', 'Twi'], formats: ['short_video', 'story'],
    socials: [['tiktok', 9400, 8.3, 'creator_submitted']], female: 48, ages: [['18-24', 51], ['25-34', 33], ['35-44', 12], ['45+', 4]], markets: [['Ghana', 79]],
    bio: 'Street food reviews across Kumasi and Accra. Rating every chop bar so you don’t have to.' },
  { id: 'cr_thandi', name: 'Thandi Nkosi', handle: 'thandimoves', country: 'South Africa', city: 'Johannesburg', cats: ['fitness', 'lifestyle'], langs: ['English', 'Zulu'], formats: ['short_video', 'live', 'story'],
    socials: [['instagram', 36500, 3.6, 'verified'], ['tiktok', 22100, 5.0, 'creator_submitted']], female: 71, ages: [['18-24', 27], ['25-34', 49], ['35-44', 17], ['45+', 7]], markets: [['South Africa', 74], ['Nigeria', 5]],
    bio: 'Certified PT. Realistic home workouts and strength training for busy people.', verified: true, collabs: ['Velo Fitness'] },
  { id: 'cr_seun', userId: 'usr_seun', name: 'Seun Ogunleye', handle: 'seuntech', country: 'Nigeria', city: 'Lagos', cats: ['tech', 'finance'], langs: ['English', 'Pidgin'], formats: ['long_video', 'short_video'],
    socials: [['youtube', 19800, 4.4, 'creator_submitted'], ['x', 11200, 1.9, 'creator_submitted']], female: 31, ages: [['18-24', 38], ['25-34', 45], ['35-44', 13], ['45+', 4]], markets: [['Nigeria', 81]],
    bio: 'Gadget reviews and money apps, explained in Pidgin and English. No paid opinions without a disclosure.' },
  { id: 'cr_chloe', name: 'Chloe Bennett', handle: 'chloeknits', country: 'United Kingdom', city: 'Manchester', cats: ['fashion', 'lifestyle'], langs: ['English'], formats: ['carousel', 'static_post', 'short_video'],
    socials: [['instagram', 29900, 3.3, 'imported']], female: 86, ages: [['18-24', 18], ['25-34', 44], ['35-44', 26], ['45+', 12]], markets: [['United Kingdom', 72], ['United States', 9]],
    bio: 'Slow fashion, knitwear and capsule wardrobes from Manchester.' },
];

const POOL = {
  Nigeria: { f: ['Funmi', 'Ngozi', 'Bisi', 'Hauwa', 'Ebube', 'Temi', 'Zara'], m: ['Tunde', 'Chidi', 'Emeka', 'Femi', 'Ibrahim', 'Kelechi'], last: ['Adeyemi', 'Bello', 'Eze', 'Oyelaran', 'Danjuma', 'Akintola', 'Okeke', 'Lawal'], cities: ['Lagos', 'Abuja', 'Ibadan', 'Port Harcourt'], langs: ['English', 'Yoruba', 'Igbo', 'Hausa', 'Pidgin'] },
  Ghana: { f: ['Akosua', 'Efua', 'Adwoa'], m: ['Kwabena', 'Yaw', 'Kojo'], last: ['Mensah', 'Asante', 'Addo', 'Ofori'], cities: ['Accra', 'Kumasi'], langs: ['English', 'Twi'] },
  Kenya: { f: ['Wanjiru', 'Achieng', 'Njeri'], m: ['Otieno', 'Kamau'], last: ['Odhiambo', 'Wambui', 'Kiptoo', 'Mwangi'], cities: ['Nairobi', 'Mombasa'], langs: ['English', 'Swahili'] },
  'South Africa': { f: ['Lerato', 'Naledi', 'Zanele'], m: ['Sipho', 'Thabo'], last: ['Dlamini', 'Mokoena', 'Khumalo'], cities: ['Johannesburg', 'Cape Town', 'Durban'], langs: ['English', 'Zulu'] },
  'United Kingdom': { f: ['Priya', 'Maya', 'Imogen'], m: ['Jordan', 'Callum'], last: ['Shah', 'Harris', 'Okafor-Reid', 'Clarke'], cities: ['London', 'Birmingham', 'Leeds'], langs: ['English'] },
  'United States': { f: ['Jasmine', 'Aaliyah'], m: ['Marcus', 'Tyler'], last: ['Brooks', 'Rivera', 'Coleman'], cities: ['Atlanta', 'Houston', 'New York'], langs: ['English', 'Spanish'] },
  Egypt: { f: ['Nour', 'Salma'], m: ['Omar'], last: ['Hassan', 'Fathy'], cities: ['Cairo', 'Alexandria'], langs: ['Arabic', 'English'] },
} as const;

const BIO: Record<Category, string[]> = {
  beauty: ['Skincare routines that respect your budget and your skin type.', 'Makeup for real life: work, weddings and the commute.'],
  fashion: ['Thrift flips, local designers and outfit formulas.', 'Everyday style with a focus on local brands.'],
  lifestyle: ['Little upgrades for city living, honest reviews and weekend resets.', 'Home, routines and the small things that make life easier.'],
  food: ['Quick recipes, restaurant reviews and family favourites.', 'Cooking classic dishes the shortcut way.'],
  fitness: ['Home workouts and nutrition without the extremes.', 'Running, strength and staying consistent.'],
  tech: ['Phones, laptops and apps reviewed for real budgets.', 'Tech explained simply for everyday people.'],
  travel: ['Weekend getaways and hidden local spots.', 'Hotels, flights and itineraries that make sense.'],
  education: ['Study tips, scholarships and career advice.', 'Learning made practical for students and graduates.'],
  entertainment: ['Comedy skits and pop-culture commentary.', 'Music, film and everything trending.'],
  parenting: ['Parenting honestly: school runs, toddlers and family life.', 'Raising kids in a busy city.'],
  finance: ['Saving, investing and side hustles, explained.', 'Money tips for young professionals.'],
  gaming: ['Mobile and console gaming, tournaments and reviews.', 'Streams, setups and gaming news.'],
};

function rateCards(rand: () => number, followers: number, platforms: Platform[], currency: Currency): RateCard[] {
  const usd = followers < 10_000 ? 60 : followers < 50_000 ? 120 + followers * 0.012 : followers < 250_000 ? 900 + followers * 0.01 : 4000;
  const toLocal = (n: number) => {
    const v = n / DEMO_FX_TO_USD[currency];
    const step = currency === 'NGN' ? 5000 : currency === 'KES' ? 500 : currency === 'ZAR' || currency === 'GHS' ? 50 : 10;
    return Math.max(step, Math.round(v / step) * step);
  };
  return platforms.slice(0, 2).map((p, i) => {
    const base = usd * (i === 0 ? 1 : 0.7) * (0.85 + rand() * 0.3);
    return { platform: p, format: p === 'youtube' ? 'long_video' : 'short_video', min: toLocal(base), max: toLocal(base * 1.5), currency };
  });
}

export function buildCreators(now: number): CreatorProfile[] {
  const rand = seeded(42);
  const iso = (d: number) => new Date(now - d * DAY).toISOString();
  const out: CreatorProfile[] = [];
  const make = (s: Spec, i: number): CreatorProfile => {
    const currency = LOCAL_CURRENCY[s.country] ?? 'USD';
    const followers = s.socials.reduce((a, x) => a + (x[1] ?? 0), 0);
    return {
      id: s.id, userId: s.userId, displayName: s.name, handle: s.handle, bio: s.bio, country: s.country, city: s.city, languages: s.langs, categories: s.cats, formats: s.formats,
      socials: s.socials.map(([platform, f, er, source], j) => ({ id: `${s.id}_soc${j}`, platform, handle: s.handle, followers: f, engagementRate: er, source, updatedAt: iso(5 + j * 9) })),
      audience: s.female === undefined && !s.markets ? { source: 'creator_submitted' } : { female: s.female ?? null, male: s.female != null ? 100 - s.female - 2 : null, ageBands: s.ages?.map(([band, pct]) => ({ band, pct })), topCountries: s.markets?.map(([country, pct]) => ({ country, pct })), source: s.socials.some((x) => x[3] === 'verified') ? 'verified' : s.socials[0][3] === 'imported' ? 'imported' : 'creator_submitted', updatedAt: iso(12) },
      rates: s.noRates ? [] : rateCards(rand, followers, s.socials.map((x) => x[0]), currency),
      portfolio: (s.portfolio ?? []).map((title, j) => ({ id: `${s.id}_pf${j}`, title, kind: 'link' as const, url: `https://example.com/portfolio/${s.handle}/${j + 1}`, caption: 'Sample portfolio item (fictional)', createdAt: iso(30 + j * 20) })),
      preferredCollabs: ['Long-term ambassadorships', 'Product reviews', 'Paid partnerships with clear briefs'].slice(0, 1 + (i % 3)),
      availability: s.availability ?? 'available', identityVerification: s.verified ? 'verified' : 'unverified',
      visibility: { listed: true, showLocation: true, showRates: !s.hideRates, showAudience: !s.hideAudience, showCollabHistory: true },
      avatarHue: Math.floor(rand() * 360), sample: true, createdAt: iso(60 + i * 3), updatedAt: iso(i % 20),
    };
  };
  FIXED.forEach((s, i) => out.push(make(s, i)));

  const countries = Object.keys(POOL) as (keyof typeof POOL)[];
  const weights = ['Nigeria', 'Nigeria', 'Nigeria', 'Ghana', 'Kenya', 'South Africa', 'United Kingdom', 'Nigeria', 'United States', 'Kenya', 'Egypt', 'Ghana'];
  const allCats = CATEGORIES.map((c) => c.id);
  for (let i = 0; i < 40; i++) {
    const country = weights[i % weights.length] as (typeof countries)[number];
    const p = POOL[country];
    const female = rand() < 0.62;
    const first = (female ? p.f : p.m)[Math.floor(rand() * (female ? p.f : p.m).length)];
    const last = p.last[Math.floor(rand() * p.last.length)];
    const primary = allCats[(i * 5 + 3) % allCats.length];
    const secondary = rand() < 0.5 ? allCats[(i * 7 + 1) % allCats.length] : null;
    const cats = [...new Set([primary, ...(secondary ? [secondary] : [])])] as Category[];
    const tierRoll = rand();
    const base = tierRoll < 0.2 ? 3000 + rand() * 6500 : tierRoll < 0.82 ? 10000 + rand() * 40000 : tierRoll < 0.95 ? 50000 + rand() * 150000 : 260000 + rand() * 300000;
    const platforms: Platform[] = cats.includes('tech') || cats.includes('gaming') ? ['youtube', 'tiktok'] : cats.includes('finance') ? ['instagram', 'x'] : rand() < 0.5 ? ['instagram', 'tiktok'] : ['tiktok', 'instagram'];
    const erBase = base < 10000 ? 4.5 : base < 50000 ? 3.4 : base < 250000 ? 2.2 : 1.5;
    const src: DataSource = rand() < 0.6 ? 'creator_submitted' : rand() < 0.7 ? 'imported' : 'verified';
    const twoAccounts = rand() < 0.55;
    const missingEr = i % 9 === 4;
    const missingAudience = i % 7 === 2;
    const handle = `${first}${last}`.toLowerCase().replace(/[^a-z]/g, '').slice(0, 14) + (i % 4 === 0 ? 'tv' : i % 4 === 1 ? '' : i % 4 === 2 ? '.co' : 'x');
    const markets: [string, number][] = [[country, Math.round(55 + rand() * 30)]];
    if (rand() < 0.5) markets.push([country === 'Nigeria' ? 'Ghana' : 'Nigeria', Math.round(4 + rand() * 8)]);
    const femalePct = cats.includes('beauty') || cats.includes('parenting') || cats.includes('fashion') ? Math.round(68 + rand() * 20) : cats.includes('gaming') || cats.includes('tech') ? Math.round(18 + rand() * 20) : Math.round(40 + rand() * 25);
    const spec: Spec = {
      id: `cr_s${String(i + 1).padStart(2, '0')}`, name: `${first} ${last}`, handle: [...out].some((c) => c.handle === handle) ? `${handle}${i}` : handle,
      country, city: p.cities[Math.floor(rand() * p.cities.length)], cats, langs: [...new Set([p.langs[0], ...(rand() < 0.6 ? [p.langs[Math.floor(rand() * p.langs.length)]] : [])])],
      formats: (['short_video', 'story', ...(rand() < 0.4 ? ['carousel'] : []), ...(rand() < 0.3 ? ['ugc_asset'] : []), ...(platforms.includes('youtube') ? ['long_video'] : [])] as ContentFormat[]),
      socials: [[platforms[0], Math.round(base), missingEr ? null : +(erBase * (0.6 + rand() * 0.9)).toFixed(1), src], ...(twoAccounts ? [[platforms[1], Math.round(base * (0.2 + rand() * 0.6)), missingEr ? null : +(erBase * (0.6 + rand() * 0.8)).toFixed(1), 'creator_submitted'] as [Platform, number, number | null, DataSource]] : [])],
      female: missingAudience ? undefined : femalePct, ages: missingAudience ? undefined : [['18-24', Math.round(25 + rand() * 20)], ['25-34', Math.round(30 + rand() * 15)], ['35-44', Math.round(8 + rand() * 10)], ['45+', Math.round(2 + rand() * 6)]],
      markets: missingAudience ? undefined : markets,
      bio: `${p.cities[0] === 'Lagos' ? 'Nigerian' : country === 'United Kingdom' ? 'UK' : country === 'United States' ? 'US' : country} creator. ${BIO[primary][i % 2]}`,
      availability: i % 11 === 5 ? 'limited' : i % 17 === 9 ? 'unavailable' : 'available',
      verified: src === 'verified' && rand() < 0.7, hideRates: i % 13 === 6, hideAudience: i % 15 === 10, noRates: i % 19 === 7,
      portfolio: rand() < 0.6 ? [`${BIO[primary][0].split(' ').slice(0, 3).join(' ')} — sample`] : [],
    };
    out.push(make(spec, i + FIXED.length));
  }
  // One creator chooses not to be listed in discovery.
  out[out.length - 3].visibility.listed = false;
  return out;
}

export async function buildSeed(now = Date.now()): Promise<Database> {
  const iso = (daysAgo: number, h = 10) => { const d = new Date(now - daysAgo * DAY); if (daysAgo !== 0) d.setHours(h, (daysAgo * 7) % 60, 0, 0); return d.toISOString(); };
  const day = (offset: number) => new Date(now + offset * DAY).toISOString().slice(0, 10);

  const accounts = [
    { id: 'usr_ada', ...DEMO_ACCOUNTS[0] }, { id: 'usr_zainab', ...DEMO_ACCOUNTS[1] }, { id: 'usr_ife', ...DEMO_ACCOUNTS[2] },
    { id: 'usr_kwame', ...DEMO_ACCOUNTS[3] }, { id: 'usr_admin', ...DEMO_ACCOUNTS[4] }, ...EXTRA_USERS,
  ];
  const salt = '9f2c4e1a7b3d5f60a1b2c3d4e5f60718';
  const { hash } = await hashPassword(DEMO_PASSWORD, salt);
  const users: User[] = accounts.map((a, i) => ({
    id: a.id, email: a.email, name: a.name, kind: a.kind, platformRole: a.kind === 'admin' ? 'admin' : 'user', status: 'active', emailVerified: true,
    passwordHash: hash, passwordSalt: salt, mfaEnabled: false, createdAt: iso(90 - i), onboarded: true,
  }));

  const org = (o: Partial<Organization> & Pick<Organization, 'id' | 'name' | 'type' | 'country' | 'planId'>): Organization => ({ status: 'active', createdAt: iso(85), products: [], ...o });
  const organizations: Organization[] = [
    org({ id: 'org_lumi', name: 'Lumi Skincare', type: 'brand', country: 'Nigeria', industry: 'Beauty & skincare', website: 'https://example.com/lumi', planId: 'brand_growth', description: 'Fictional demo brand. Skincare formulated for hot, humid climates and melanin-rich skin.',
      products: [{ id: 'prd_glow', name: 'Glow Serum', description: 'Lightweight vitamin C and niacinamide serum for uneven tone.', priceHint: '₦18,500' }, { id: 'prd_spf', name: 'Everyday SPF 50', description: 'No-white-cast sunscreen for daily wear.', priceHint: '₦14,000' }] }),
    org({ id: 'org_sable', name: 'Sable & Co', type: 'brand', country: 'United Kingdom', industry: 'Fashion', planId: 'brand_starter', description: 'Fictional demo knitwear label.', products: [{ id: 'prd_knit', name: 'AW26 Knitwear', description: 'Merino knitwear capsule.' }] }),
    org({ id: 'org_northbeam', name: 'Northbeam Collective', type: 'agency', country: 'Nigeria', industry: 'Creator marketing agency', planId: 'agency_studio', agencyFeePct: 15, description: 'Fictional demo agency running creator programmes across West and Southern Africa.' }),
    org({ id: 'org_kora', name: 'Kora Foods', type: 'client', parentOrgId: 'org_northbeam', country: 'Ghana', industry: 'Food & beverage', planId: 'agency_studio', products: [{ id: 'prd_spice', name: 'Kora Jollof Spice', description: 'Ready-blended spice mix for jollof and stews.' }] }),
    org({ id: 'org_velo', name: 'Velo Fitness', type: 'client', parentOrgId: 'org_northbeam', country: 'South Africa', industry: 'Fitness & wellness', planId: 'agency_studio', products: [{ id: 'prd_app', name: 'Velo app', description: 'Home workout app with 20-minute programmes.' }] }),
  ];

  const mem = (id: string, orgId: string, userId: string, role: 'owner' | 'admin' | 'manager' | 'member' | 'client_reviewer') => ({ id, orgId, userId, role, createdAt: iso(80) });
  const memberships = [
    mem('mem1', 'org_lumi', 'usr_ada', 'owner'), mem('mem2', 'org_lumi', 'usr_kemi', 'member'),
    mem('mem3', 'org_sable', 'usr_oliver', 'owner'),
    mem('mem4', 'org_northbeam', 'usr_zainab', 'owner'), mem('mem5', 'org_northbeam', 'usr_dami', 'manager'),
    mem('mem6', 'org_kora', 'usr_kwame', 'client_reviewer'),
  ];

  const creators = buildCreators(now);
  const cr = (id: string) => creators.find((c) => c.id === id)!;

  const camp = (c: Partial<Campaign> & Pick<Campaign, 'id' | 'orgId' | 'name' | 'description' | 'objective' | 'budget' | 'currency' | 'status'>): Campaign => ({
    audience: { genders: ['female'], ageMin: 20, ageMax: 35, interests: [] }, locations: [], languages: ['English'], platforms: ['instagram', 'tiktok'], categories: [],
    startDate: day(-10), endDate: day(20), deliverables: [], requirements: '', guidelines: '', approval: { internal: true, client: false }, compensationModel: 'fixed_plus_bonus',
    performanceTargets: '', visibility: 'public', createdBy: 'usr_ada', createdAt: iso(30), updatedAt: iso(2), sample: true, ...c,
  });
  const dl = (id: string, platform: Platform, format: ContentFormat, quantity = 1, notes?: string) => ({ id, platform, format, quantity, notes });

  const campaigns: Campaign[] = [
    camp({ id: 'cmp_glow', orgId: 'org_lumi', name: 'Glow Serum launch — Lagos', productId: 'prd_glow', description: 'Launch Glow Serum to women aged 20–35 in Lagos and Abuja with honest, routine-led content that shows real results over two weeks.', objective: 'launch', budget: 5_000_000, currency: 'NGN', status: 'active', categories: ['beauty'], locations: ['Nigeria'], languages: ['English', 'Pidgin'],
      deliverables: [dl('d1', 'instagram', 'short_video', 1, 'Routine Reel featuring Glow Serum'), dl('d2', 'tiktok', 'short_video', 1, '14-day check-in TikTok')], requirements: 'Show the product in your real morning routine. Disclose the partnership.', guidelines: 'No before/after claims. Avoid medical language.', performanceTargets: '2% engagement rate on launch posts; 1,500 link clicks.', startDate: day(-10), endDate: day(20) }),
    camp({ id: 'cmp_harmattan', orgId: 'org_lumi', name: 'Harmattan skin-barrier series', productId: 'prd_glow', description: 'A three-week education series on protecting the skin barrier during harmattan. Looking for beauty and lifestyle creators in Nigeria with engaged audiences.', objective: 'awareness', budget: 3_000_000, currency: 'NGN', status: 'recruiting', categories: ['beauty', 'lifestyle'], locations: ['Nigeria'],
      deliverables: [dl('d3', 'instagram', 'short_video', 1, 'Barrier-repair routine'), dl('d4', 'instagram', 'story', 3, 'Daily skin check stories')], startDate: day(12), endDate: day(45), compensationModel: 'fixed', createdAt: iso(6), updatedAt: iso(1) }),
    camp({ id: 'cmp_spf', orgId: 'org_lumi', name: 'Everyday SPF education', productId: 'prd_spf', description: 'Explain why daily sunscreen matters for darker skin tones, and show a no-white-cast application test.', objective: 'engagement', budget: 2_500_000, currency: 'NGN', status: 'draft', categories: ['beauty'], locations: ['Nigeria', 'Ghana'], deliverables: [dl('d5', 'tiktok', 'short_video', 2)], startDate: day(30), endDate: day(60), createdAt: iso(2), updatedAt: iso(0) }),
    camp({ id: 'cmp_sable', orgId: 'org_sable', name: 'AW26 knitwear edit', productId: 'prd_knit', description: 'Autumn styling content for the AW26 merino capsule, UK audience aged 25–44.', objective: 'sales', budget: 18_000, currency: 'GBP', status: 'active', categories: ['fashion'], locations: ['United Kingdom'], audience: { genders: ['female'], ageMin: 25, ageMax: 44, interests: [] }, platforms: ['instagram'], deliverables: [dl('d6', 'instagram', 'carousel', 1)], visibility: 'invite_only', createdBy: 'usr_oliver' }),
    camp({ id: 'cmp_kora', orgId: 'org_kora', name: 'Kora Jollof Spice — Accra', productId: 'prd_spice', description: 'Recipe-led content showing Kora Jollof Spice in family cooking, for home cooks in Ghana.', objective: 'sales', budget: 60_000, currency: 'GHS', status: 'active', categories: ['food'], locations: ['Ghana'], languages: ['English', 'Twi'], audience: { genders: ['all'], ageMin: 22, ageMax: 45, interests: ['home cooking'] }, approval: { internal: true, client: true }, visibility: 'invite_only', deliverables: [dl('d7', 'instagram', 'short_video', 1, 'Recipe Reel'), dl('d8', 'tiktok', 'short_video', 1, 'Taste-test TikTok')], createdBy: 'usr_dami', startDate: day(-6), endDate: day(24) }),
    camp({ id: 'cmp_velo30', orgId: 'org_velo', name: 'Velo 30-day challenge', productId: 'prd_app', description: '30-day home workout challenge using the Velo app.', objective: 'app_downloads', budget: 120_000, currency: 'ZAR', status: 'completed', categories: ['fitness', 'lifestyle'], locations: ['South Africa', 'Nigeria'], audience: { genders: ['all'], ageMin: 20, ageMax: 40, interests: [] }, deliverables: [dl('d9', 'instagram', 'short_video', 1)], startDate: day(-70), endDate: day(-38), createdBy: 'usr_zainab', createdAt: iso(85), updatedAt: iso(36) }),
    camp({ id: 'cmp_summer', orgId: 'org_velo', name: 'Summer Strong — Johannesburg & Lagos', productId: 'prd_app', description: 'Short, energetic workout content for the summer programme. Open to fitness and lifestyle creators in South Africa and Nigeria.', objective: 'app_downloads', budget: 150_000, currency: 'ZAR', status: 'recruiting', categories: ['fitness', 'lifestyle'], locations: ['South Africa', 'Nigeria'], audience: { genders: ['all'], ageMin: 18, ageMax: 35, interests: [] }, deliverables: [dl('d10', 'tiktok', 'short_video', 2), dl('d11', 'instagram', 'story', 2)], startDate: day(20), endDate: day(50), compensationModel: 'negotiated', createdBy: 'usr_zainab', createdAt: iso(4), updatedAt: iso(3) }),
  ];

  const terms = (c: Campaign, fee: number, bonus?: number, deadlineOffset = 6) => ({ fee, currency: c.currency, bonus: bonus ? { amount: bonus, condition: '2% engagement rate on the main post' } : null, deliverables: c.deliverables, deadline: day(deadlineOffset), usageRights: 'Organic use on brand channels for 6 months', exclusivity: 'No competing skincare brands for 30 days', revisionLimit: 2 });
  const C = Object.fromEntries(campaigns.map((c) => [c.id, c]));
  const offers: Offer[] = [];
  const collaborations: Collaboration[] = [];
  const deliverables: Deliverable[] = [];
  const payments: PaymentRecord[] = [];
  const submissions: Submission[] = [];
  const messages: Database['messages'] = [];
  const activity: Database['activity'] = [];

  const addCollab = (id: string, c: Campaign, creatorId: string, t: ReturnType<typeof terms>, status: Collaboration['status'], dStatus: Deliverable['status'][], createdDaysAgo: number) => {
    const offerId = `ofr_${id}`;
    offers.push({ id: offerId, campaignId: c.id, orgId: c.orgId, creatorId, from: 'org', terms: t, message: 'We’d love to work with you on this.', status: 'accepted', createdBy: c.createdBy, createdAt: iso(createdDaysAgo + 2), respondedAt: iso(createdDaysAgo) });
    collaborations.push({ id, campaignId: c.id, orgId: c.orgId, creatorId, offerId, terms: t, status, createdAt: iso(createdDaysAgo) });
    const specs = t.deliverables.flatMap((s) => Array.from({ length: s.quantity }, () => s));
    specs.forEach((s, i) => deliverables.push({ id: `${id}_d${i}`, collaborationId: id, orgId: c.orgId, creatorId, title: s.notes ?? `${s.format.replace('_', ' ')} on ${s.platform}`, platform: s.platform, format: s.format, dueDate: t.deadline, status: dStatus[i] ?? 'not_started', revisionCount: dStatus[i] === 'revision_requested' ? 1 : 0 }));
    const allApproved = dStatus.length === specs.length && dStatus.every((x) => x === 'approved');
    payments.push({ id: `pay_${id}_base`, orgId: c.orgId, campaignId: c.id, collaborationId: id, creatorId, label: 'Base fee (net 14 after deadline)', kind: 'base', amount: t.fee, currency: c.currency, status: status === 'completed' ? 'paid' : allApproved ? 'pending' : 'scheduled', dueDate: new Date(new Date(t.deadline).getTime() + 14 * DAY).toISOString().slice(0, 10), paidAt: status === 'completed' ? iso(30) : undefined, reference: status === 'completed' ? `TRF-${id.slice(-4).toUpperCase()}-2207` : undefined });
    if (t.bonus) payments.push({ id: `pay_${id}_bonus`, orgId: c.orgId, campaignId: c.id, collaborationId: id, creatorId, label: `Performance bonus — ${t.bonus.condition}`, kind: 'bonus', amount: t.bonus.amount, currency: c.currency, status: status === 'completed' ? 'paid' : 'scheduled', dueDate: new Date(new Date(t.deadline).getTime() + 30 * DAY).toISOString().slice(0, 10), paidAt: status === 'completed' ? iso(28) : undefined, reference: status === 'completed' ? 'TRF-BONUS-0911' : undefined });
    messages.push({ id: `msg_${id}_1`, campaignId: c.id, orgId: c.orgId, creatorId, from: 'org', senderName: 'Brand team', body: 'We’d love to work with you on this.', kind: 'message', createdAt: iso(createdDaysAgo + 2) });
    messages.push({ id: `msg_${id}_2`, campaignId: c.id, orgId: c.orgId, creatorId, from: 'system', senderName: 'Tandem', body: `Terms agreed. This records the agreed commercial terms; it is not a signed legal contract.`, kind: 'system', createdAt: iso(createdDaysAgo) });
    activity.push({ id: `act_${id}`, orgId: c.orgId, campaignId: c.id, collaborationId: id, creatorId, actorId: c.createdBy, actorName: 'Brand team', action: `agreed terms with ${cr(creatorId).displayName} — collaboration started`, at: iso(createdDaysAgo) });
  };

  addCollab('col_glow_tomi', C.cmp_glow, 'cr_tomi', terms(C.cmp_glow, 450_000, 100_000), 'active', ['approved', 'in_review'], 14);
  addCollab('col_glow_chi', C.cmp_glow, 'cr_chiamaka', terms(C.cmp_glow, 650_000), 'active', ['revision_requested', 'approved'], 13);
  addCollab('col_sable_chloe', C.cmp_sable, 'cr_chloe', { ...terms(C.cmp_sable, 1400), exclusivity: 'None' }, 'active', ['in_review'], 9);
  addCollab('col_kora_ama', C.cmp_kora, 'cr_ama', { ...terms(C.cmp_kora, 9500, undefined, 9), exclusivity: 'No competing spice brands for 60 days' }, 'active', ['awaiting_client', 'not_started'], 5);
  addCollab('col_kora_kofi', C.cmp_kora, 'cr_kofi', { ...terms(C.cmp_kora, 3800, undefined, 11), exclusivity: 'None' }, 'active', ['not_started', 'not_started'], 4);
  addCollab('col_velo_ife', C.cmp_velo30, 'cr_ife', { ...terms(C.cmp_velo30, 14000, 3000, -45), bonus: { amount: 3000, condition: '500 tracked app installs' }, exclusivity: 'No competing fitness apps for 30 days' }, 'completed', ['approved'], 66);
  addCollab('col_velo_thandi', C.cmp_velo30, 'cr_thandi', { ...terms(C.cmp_velo30, 22000, undefined, -45), exclusivity: 'None' }, 'completed', ['approved'], 66);

  const sub = (id: string, delId: string, collabId: string, status: Submission['status'], version: number, daysAgo: number, caption: string, reviews: Submission['reviews'] = []) => {
    const d = deliverables.find((x) => x.id === delId)!;
    submissions.push({ id, deliverableId: delId, collaborationId: collabId, orgId: d.orgId, creatorId: d.creatorId, version, caption, links: [`https://example.com/drafts/${id}`], fileIds: [], note: 'Draft link is a sample placeholder.', status, submittedAt: iso(daysAgo), reviews });
  };
  sub('sub_t1', 'col_glow_tomi_d0', 'col_glow_tomi', 'approved', 1, 6, 'My 6am routine just got an upgrade ☀️ Glow Serum goes on right after cleansing. #ad #LumiPartner', [{ id: 'rv1', reviewerId: 'usr_ada', reviewerName: 'Ada Okafor', stage: 'internal', decision: 'approved', comment: 'Lovely — natural and on-brief.', at: iso(5) }]);
  sub('sub_t2', 'col_glow_tomi_d1', 'col_glow_tomi', 'in_review', 1, 0, 'Day 14 check-in: here’s what changed (and what didn’t). #ad', []);
  sub('sub_c1', 'col_glow_chi_d0', 'col_glow_chi', 'revision_requested', 1, 4, 'POV: your skin finally behaves 😂 #ad', [{ id: 'rv2', reviewerId: 'usr_ada', reviewerName: 'Ada Okafor', stage: 'internal', decision: 'revision_requested', comment: 'Love the energy! Please add “Paid partnership” and show the bottle clearly in the first 3 seconds.', at: iso(3) }]);
  sub('sub_c2', 'col_glow_chi_d1', 'col_glow_chi', 'approved', 1, 5, 'Two weeks in. Honest thoughts. #ad', [{ id: 'rv3', reviewerId: 'usr_ada', reviewerName: 'Ada Okafor', stage: 'internal', decision: 'approved', comment: 'Approved, thank you.', at: iso(4) }]);
  sub('sub_ch1', 'col_sable_chloe_d0', 'col_sable_chloe', 'in_review', 1, 1, 'Three ways to wear the AW26 roll-neck. #ad', []);
  sub('sub_a1', 'col_kora_ama_d0', 'col_kora_ama', 'awaiting_client', 1, 1, 'Sunday jollof, the shortcut way. Kora Jollof Spice did the heavy lifting 🍛 #ad', [{ id: 'rv4', reviewerId: 'usr_dami', reviewerName: 'Dami Ojo', stage: 'internal', decision: 'approved', comment: 'Approved internally — sending to Kora for sign-off.', at: iso(0, 9) }]);
  sub('sub_i1', 'col_velo_ife_d0', 'col_velo_ife', 'approved', 1, 50, 'Day 1 of 30 with Velo 💪 #ad', [{ id: 'rv5', reviewerId: 'usr_zainab', reviewerName: 'Zainab Yusuf', stage: 'internal', decision: 'approved', comment: 'Great.', at: iso(49) }]);
  sub('sub_th1', 'col_velo_thandi_d0', 'col_velo_thandi', 'approved', 1, 50, '20 minutes, no equipment. #ad', [{ id: 'rv6', reviewerId: 'usr_zainab', reviewerName: 'Zainab Yusuf', stage: 'internal', decision: 'approved', comment: 'Great.', at: iso(49) }]);

  // Open negotiation threads on the recruiting Harmattan campaign.
  const harm = C.cmp_harmattan;
  const applications: Database['applications'] = [
    { id: 'app_h1', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s01', pitch: 'I post a skin check every morning — harmattan is my audience’s biggest pain point every year. Happy to do a 3-week diary format.', proposedFee: 280_000, currency: 'NGN', status: 'submitted', createdAt: iso(1, 15) },
    { id: 'app_h2', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s08', pitch: 'Lifestyle creator in Abuja; my followers ask about dry skin constantly. I’d film the routine with my mum for a two-generation angle.', proposedFee: 350_000, currency: 'NGN', status: 'shortlisted', createdAt: iso(2, 11), reviewedAt: iso(1) },
    { id: 'app_v1', campaignId: 'cmp_summer', orgId: 'org_velo', creatorId: 'cr_ife', pitch: 'I did the Velo 30-day challenge last time and my audience loved the check-ins. For Summer Strong I’d film quick 10-minute sessions before work in Lagos heat.', proposedFee: 15000, currency: 'ZAR', status: 'submitted', createdAt: iso(2, 9) },
  ];
  messages.push(
    { id: 'msg_h1', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s01', from: 'creator', senderName: cr('cr_s01').displayName, body: applications[0].pitch, kind: 'message', createdAt: iso(1, 15) },
    { id: 'msg_h2', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s08', from: 'creator', senderName: cr('cr_s08').displayName, body: applications[1].pitch, kind: 'message', createdAt: iso(2, 11) },
    { id: 'msg_v1', campaignId: 'cmp_summer', orgId: 'org_velo', creatorId: 'cr_ife', from: 'creator', senderName: 'Ife Balogun', body: applications[2].pitch, kind: 'message', createdAt: iso(2, 9) },
  );
  const invTerms = terms(harm, 300_000, undefined, 40);
  const invitations: Database['invitations'] = [
    { id: 'inv_h1', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s15', message: 'Hi! We love your routines and think the harmattan series would suit your audience.', terms: invTerms, status: 'countered', createdBy: 'usr_ada', createdAt: iso(3) },
  ];
  offers.push(
    { id: 'ofr_h1', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s15', from: 'org', terms: invTerms, message: invitations[0].message, status: 'superseded', createdBy: 'usr_ada', createdAt: iso(3) },
    { id: 'ofr_h2', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s15', from: 'creator', terms: { ...invTerms, fee: 380_000, revisionLimit: 1 }, message: 'Thanks! Stories daily for three weeks is a lot of production — could we do ₦380,000 with one revision round?', status: 'open', createdBy: 'cr_s15', createdAt: iso(1, 18) },
  );
  messages.push(
    { id: 'msg_h3', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s15', from: 'org', senderName: 'Ada Okafor · Lumi Skincare', body: invitations[0].message, kind: 'message', createdAt: iso(3) },
    { id: 'msg_h4', campaignId: harm.id, orgId: harm.orgId, creatorId: 'cr_s15', from: 'creator', senderName: cr('cr_s15').displayName, body: offers[offers.length - 1].message, kind: 'message', createdAt: iso(1, 18) },
  );

  // Sample results — fictional, labelled in the UI as sample, manually submitted.
  const rand = seeded(7);
  const results: ResultEntry[] = [];
  const addResults = (c: Campaign, creatorId: string, collabId: string, days: number[], scale: number, platform: Platform) => days.forEach((d, i) => {
    const reach = Math.round(scale * (1.6 - i * 0.12) * (0.85 + rand() * 0.3));
    const impressions = Math.round(reach * (1.3 + rand() * 0.3));
    const engagements = Math.round(impressions * (0.025 + rand() * 0.03));
    results.push({ id: `res_${collabId}_${i}`, orgId: c.orgId, campaignId: c.id, collaborationId: collabId, creatorId, date: day(-d), platform, reach, impressions, engagements, clicks: Math.round(engagements * (0.08 + rand() * 0.06)), conversions: Math.round(engagements * (0.01 + rand() * 0.01)), source: 'manual', note: 'Sample data (fictional)', enteredBy: 'usr_ada', createdAt: iso(d), sample: true });
  });
  addResults(C.cmp_glow, 'cr_tomi', 'col_glow_tomi', [8, 7, 6, 5, 4, 3, 2], 9000, 'instagram');
  addResults(C.cmp_glow, 'cr_chiamaka', 'col_glow_chi', [7, 6, 5, 4, 3, 2], 13000, 'tiktok');
  addResults(C.cmp_velo30, 'cr_ife', 'col_velo_ife', [60, 55, 50, 45, 40], 11000, 'instagram');
  addResults(C.cmp_velo30, 'cr_thandi', 'col_velo_thandi', [60, 55, 50, 45, 40], 15000, 'instagram');

  const collections: Database['collections'] = [
    { id: 'coll_lumi', orgId: 'org_lumi', name: 'Lagos beauty shortlist', description: 'Strong skincare voices for 2026 launches.', creatorIds: ['cr_ife', 'cr_tomi', 'cr_chiamaka', 'cr_s01', 'cr_s15'], sharedWithClients: false, createdBy: 'usr_ada', createdAt: iso(20) },
    { id: 'coll_nb', orgId: 'org_northbeam', name: 'West Africa food creators', description: 'Agency-wide shared database.', creatorIds: ['cr_ama', 'cr_kofi', 'cr_s04', 'cr_s12'], sharedWithClients: false, createdBy: 'usr_zainab', createdAt: iso(40) },
    { id: 'coll_kora', orgId: 'org_kora', name: 'Kora approved creators', description: 'Shared with the Kora team.', creatorIds: ['cr_ama', 'cr_kofi'], sharedWithClients: true, createdBy: 'usr_dami', createdAt: iso(10) },
    { id: 'coll_sable', orgId: 'org_sable', name: 'UK knitwear', creatorIds: ['cr_chloe'], sharedWithClients: false, createdBy: 'usr_oliver', createdAt: iso(25) },
  ];

  const crm: Database['crm'] = [
    { id: 'crm1', orgId: 'org_lumi', creatorId: 'cr_tomi', status: 'active', tags: ['aesthetician', 'high trust'], notes: [{ id: 'n1', text: 'Very responsive. Prefers WhatsApp for quick questions but keep approvals in Tandem.', authorName: 'Ada Okafor', at: iso(12) }], reminders: [{ id: 'r1', text: 'Discuss an always-on ambassador deal', due: day(5), done: false }], preferredContact: 'In-platform messages', updatedAt: iso(2) },
    { id: 'crm2', orgId: 'org_lumi', creatorId: 'cr_chiamaka', status: 'active', tags: ['comedy', 'tiktok'], notes: [{ id: 'n2', text: 'Great reach on TikTok; give feedback on disclosure early.', authorName: 'Kemi Adeleke', at: iso(4) }], reminders: [{ id: 'r2', text: 'Check revised Reel', due: day(0), done: false }], updatedAt: iso(3) },
    { id: 'crm3', orgId: 'org_lumi', creatorId: 'cr_ife', status: 'prospect', tags: ['lagos', 'skincare'], notes: [{ id: 'n3', text: 'Loved her harmattan routine — invite to the next launch.', authorName: 'Ada Okafor', at: iso(8) }], reminders: [], updatedAt: iso(8) },
    { id: 'crm4', orgId: 'org_sable', creatorId: 'cr_chloe', status: 'active', tags: ['private-note'], notes: [{ id: 'n4', text: 'Sable-only note: negotiating exclusivity for SS27.', authorName: 'Oliver Grant', at: iso(5) }], reminders: [], updatedAt: iso(5) },
  ];

  const notifications: Database['notifications'] = [
    { id: 'n_a1', userId: 'usr_ada', type: 'submission', title: 'Tomi Akande submitted content', body: '“14-day check-in TikTok” for Glow Serum launch — version 1.', link: '/app/collaborations/col_glow_tomi', read: false, createdAt: iso(0), emailQueued: true },
    { id: 'n_a2', userId: 'usr_ada', type: 'offer', title: `${cr('cr_s15').displayName} sent a counteroffer`, body: '₦380,000 for “Harmattan skin-barrier series”.', link: `/app/campaigns/cmp_harmattan?tab=deals&creator=cr_s15`, read: false, createdAt: iso(1, 18), emailQueued: true },
    { id: 'n_a3', userId: 'usr_ada', type: 'application', title: 'New application for “Harmattan skin-barrier series”', body: `${cr('cr_s01').displayName} proposed ₦280,000.`, link: '/app/campaigns/cmp_harmattan?tab=deals', read: true, createdAt: iso(1, 15), emailQueued: true },
    { id: 'n_k1', userId: 'usr_kwame', type: 'review', title: 'Content is ready for your approval', body: '“Recipe Reel” for Kora Jollof Spice — Accra.', link: '/app/approvals', read: false, createdAt: iso(0, 9), emailQueued: true },
    { id: 'n_i1', userId: 'usr_ife', type: 'payment', title: 'A payment was recorded as paid', body: 'Velo Fitness recorded your base fee. Check your account for the transfer.', link: '/creator/earnings', read: false, createdAt: iso(30), emailQueued: true },
  ];

  const audit: Database['audit'] = [
    { id: 'aud1', at: iso(1, 8), actorEmail: 'unknown@example.com', action: 'auth.login_failed', severity: 'warning' },
    { id: 'aud2', at: iso(3, 14), actorId: 'usr_ada', actorEmail: 'brand@tandem.demo', orgId: 'org_lumi', action: 'campaign.created', target: 'Harmattan skin-barrier series', severity: 'info' },
  ];

  return {
    version: 1,
    seededAt: new Date(now).toISOString(),
    users,
    sessions: [],
    loginAttempts: {},
    organizations,
    memberships,
    teamInvites: [],
    creators,
    campaigns,
    activity: [
      ...activity,
      { id: 'act_h1', orgId: 'org_lumi', campaignId: 'cmp_harmattan', actorId: 'usr_ada', actorName: 'Ada Okafor', action: 'created and published the campaign', at: iso(6) },
      { id: 'act_g1', orgId: 'org_lumi', campaignId: 'cmp_glow', actorId: 'usr_ada', actorName: 'Ada Okafor', action: 'moved the campaign from Recruiting to Active', at: iso(10) },
    ],
    invitations,
    applications,
    offers,
    messages,
    collaborations,
    deliverables,
    submissions,
    files: [],
    payments,
    results,
    collections,
    crm,
    notifications,
    notificationPrefs: users.map((u) => defaultPrefs(u.id)),
    audit,
    verificationRequests: [{ id: 'ver1', creatorId: 'cr_seun', userId: 'usr_seun', evidence: 'YouTube channel About page links to my Tandem profile; I can also verify via a video call.', status: 'pending', createdAt: iso(2) }],
    reports: [{ id: 'rep1', reporterId: 'usr_ada', targetType: 'creator', targetId: 'cr_s22', reason: 'Engagement rate looks inconsistent with comments on recent posts.', status: 'open', createdAt: iso(1) }],
    settings: {
      platformFeePct: 8,
      defaultAgencyFeePct: 15,
      categories: CATEGORIES.map((c) => ({ ...c, enabled: true })),
      plans: DEFAULT_PLANS,
      maxUploadMb: 50,
      allowedUploadTypes: UPLOAD_TYPES,
    },
  };
}
