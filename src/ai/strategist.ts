// Local campaign strategist. Deterministic answers built from
// the active workspace's data only. Output marks what is fact vs suggestion.
import type { Campaign, ContentFormat, Objective, Platform } from '../domain/types';
import { categoryLabel, compensationLabel, formatLabel, objectiveLabel, platformLabel, SOURCE_META } from '../domain/constants';
import { compact, formatDate, money, pct, DAY } from '../lib/utils';
import { interpretLocally } from './brief';

export interface StrategistContext {
  org: { name: string; type: string; country: string; industry?: string; products: { name: string; description: string }[] };
  senderName: string;
  campaign?: Campaign;
  budget?: { total: number; committed: number; platformFee: number; agencyFee: number; remaining: number; currency: Campaign['currency']; allocations: { creatorName: string; fee: number; bonus: number }[] };
  pipeline?: { invited: number; applied: number; negotiating: number; agreed: number; declined: number };
  deliverables?: { total: number; approved: number; inReview: number; revisions: number; overdue: number };
  analytics?: { reach: number | null; impressions: number | null; engagements: number | null; clicks: number | null; conversions: number | null; engagementRate: number | null; cpe: number | null; cpc: number | null; sources: string[]; sample: boolean; spend: number } | null;
  topMatches?: { name: string; handle: string; score: number; confidence: string; role: string; reasons: string[]; concerns: string[]; fee?: string; budgetFit: string }[];
  tierStats?: { tier: string; medianRate: number | null; sampleSize: number }[];
  draftInvite?: string;
}

export interface StrategistReply { text: string; intent: string; basedOn: string[] }

export const STRATEGIST_PROMPTS = [
  'Draft a campaign brief',
  'Which creator categories should we target?',
  'Suggest creators for this campaign',
  'Give me campaign ideas',
  'What deliverables should we ask for?',
  'How should we allocate the budget?',
  'Recommend a timeline',
  'Draft an invitation to the top match',
  'What are the risks?',
  'Summarise performance so far',
];

const DELIVERABLES_BY_OBJECTIVE: Record<Objective, { platform: Platform; format: ContentFormat; why: string }[]> = {
  awareness: [{ platform: 'tiktok', format: 'short_video', why: 'Highest organic reach per post for new audiences.' }, { platform: 'instagram', format: 'short_video', why: 'Reels extend reach and are easy to repurpose.' }, { platform: 'instagram', format: 'story', why: 'Frequent, low-cost reminders over the campaign.' }],
  launch: [{ platform: 'instagram', format: 'short_video', why: 'First-impression unboxing or reveal.' }, { platform: 'tiktok', format: 'short_video', why: 'Trend-led formats for launch-week momentum.' }, { platform: 'instagram', format: 'story', why: 'Countdown and launch-day stories with link stickers.' }, { platform: 'youtube', format: 'long_video', why: 'An honest in-depth review from one or two hero creators.' }],
  engagement: [{ platform: 'instagram', format: 'carousel', why: 'Saves and shares on tips-style content.' }, { platform: 'tiktok', format: 'short_video', why: 'Duets and comments prompts.' }, { platform: 'instagram', format: 'live', why: 'Live Q&A for real-time conversation.' }],
  traffic: [{ platform: 'instagram', format: 'story', why: 'Link stickers are the most direct click path.' }, { platform: 'youtube', format: 'long_video', why: 'Description links from high-intent viewers.' }, { platform: 'instagram', format: 'ugc_asset', why: 'Assets you can run as link ads.' }],
  leads: [{ platform: 'instagram', format: 'story', why: 'Link to a sign-up page with a creator-specific code.' }, { platform: 'linkedin', format: 'static_post', why: 'For B2B audiences.' }, { platform: 'youtube', format: 'long_video', why: 'Explainers that pre-qualify sign-ups.' }],
  sales: [{ platform: 'instagram', format: 'ugc_asset', why: 'Proven creator content for paid and product pages.' }, { platform: 'tiktok', format: 'short_video', why: 'Demonstration with a creator code.' }, { platform: 'instagram', format: 'story', why: 'Swipe-up with unique discount codes for attribution.' }],
  app_downloads: [{ platform: 'tiktok', format: 'short_video', why: 'Show the app solving a real problem in under 30s.' }, { platform: 'youtube', format: 'long_video', why: 'Walkthroughs for considered downloads.' }, { platform: 'instagram', format: 'ugc_asset', why: 'Assets for app-install ads.' }],
  community: [{ platform: 'instagram', format: 'live', why: 'Co-hosted lives drive follows.' }, { platform: 'tiktok', format: 'short_video', why: 'Series content that rewards following.' }],
  event: [{ platform: 'instagram', format: 'story', why: 'Countdown and day-of coverage.' }, { platform: 'tiktok', format: 'short_video', why: 'Pre-event hype and recap.' }, { platform: 'instagram', format: 'static_post', why: 'Announcement with ticket link.' }],
};

const IDEAS: Record<string, string[]> = {
  beauty: ['**Routine audit:** creators film their real routine, swap one step for the product, and report back after 14 days.', '**Climate check:** how the product holds up in heat, humidity or harmattan — specific to the market.', '**Shade/skin-type honesty series:** creators with different skin types each answer one common question.'],
  food: ['**Recipe remix:** each creator builds a signature dish around the product.', '**Street-to-home:** recreate a famous local dish at home and compare.', '**Taste test with family:** unscripted reactions from parents, siblings or friends.'],
  fitness: ['**30-day challenge:** a shared programme with weekly check-ins from each creator.', '**Myth vs fact:** creators debunk one fitness myth using the product.', '**Commute workouts:** realistic routines for busy city schedules.'],
  fashion: ['**One item, five looks:** style a single piece for different occasions.', '**Market-day haul:** pair the brand with local designers and markets.', '**Get ready with me:** event-led styling stories.'],
  tech: ['**Real-life stress test:** a week of daily use with honest pros and cons.', '**Problem → fix:** one everyday problem the product solves, in under 30 seconds.', '**Side-by-side:** an honest comparison with what the creator used before.'],
  finance: ['**Money diaries:** a week of real decisions using the product.', '**Explain it simply:** creators teach one concept their audience asks about.', '**Goal tracker:** a savings or investing goal followed over the campaign.'],
  travel: ['**48 hours in…:** itinerary content anchored on the property or service.', '**Budget vs premium:** the same trip at two price points.', '**Local secrets:** creators share places only locals know.'],
  education: ['**Study with me:** live or recorded sessions featuring the product.', '**Before/after skills:** progress over the campaign period.', '**Ask an expert:** creators interview a teacher or alumnus.'],
  parenting: ['**Real mornings:** unscripted school-run routines.', '**Parent hacks:** practical tips with the product in context.', '**First-time parent Q&A:** answer common questions honestly.'],
  gaming: ['**Challenge runs:** creators compete on a shared challenge.', '**Setup tour:** how the product fits their setup.', '**Community tournament:** creator-hosted bracket for followers.'],
  entertainment: ['**Skit series:** recurring characters encounter the product.', '**Behind the scenes:** the making of a performance.', '**Fan challenge:** a sound or dance followers can join.'],
  lifestyle: ['**Day in my life:** the product in a realistic daily routine.', '**Home refresh:** small upgrades with big impact.', '**Weekend reset:** routines that resonate with busy professionals.'],
};

const has = (q: string, re: RegExp) => re.test(q.toLowerCase());

export function localStrategist(question: string, ctx: StrategistContext): StrategistReply {
  const q = question.trim();
  const c = ctx.campaign;
  const need = (what: string): StrategistReply => ({ intent: 'needs_campaign', text: `Select a campaign above so I can ${what} using its actual brief, budget and creators.`, basedOn: [] });

  if (has(q, /\b(brief)\b/)) return brief(ctx);
  if (has(q, /categor|niche/)) return categories(ctx);
  if (has(q, /invit|outreach|message to|draft (an )?(email|message)/)) {
    if (!c) return need('draft an invitation');
    if (!ctx.draftInvite) return { intent: 'outreach', text: 'There are no matching creators to invite yet. Widen the campaign’s categories or markets and try again.', basedOn: [] };
    return { intent: 'outreach', text: `### Invitation draft for ${ctx.topMatches?.[0]?.name}\nEdit it before sending — nothing is sent automatically.\n\n\`\`\`\n${ctx.draftInvite}\n\`\`\``, basedOn: ['Creator profile (shared fields only)', 'Campaign brief'] };
  }
  if (has(q, /suggest(ed)? creators|recommend creators|which creators|who should|top (creators|matches)|creators for/)) return creators(ctx, need);
  if (has(q, /idea|concept|creative|angle/)) return ideas(ctx);
  if (has(q, /deliverable|content type|format|what should we ask/)) return deliverables(ctx);
  if (has(q, /budget|allocat|spend|split|afford/)) return budget(ctx, need);
  if (has(q, /timeline|schedule|when should|plan the dates|calendar/)) return timeline(ctx, need);
  if (has(q, /risk|concern|worr|what could go wrong/)) return risks(ctx, need);
  if (has(q, /perform|result|summar|report|how (is|are) .* doing/)) return performance(ctx, need);
  return {
    intent: 'help',
    text: `I can help plan and run creator campaigns for ${ctx.org.name}${c ? `, starting with “${c.name}”` : ''}. Try:\n${['Draft a campaign brief', 'Suggest creators for this campaign', 'How should we allocate the budget?', 'What are the risks?', 'Summarise performance so far'].map((x) => `- ${x}`).join('\n')}`,
    basedOn: [],
  };
}

function brief(ctx: StrategistContext): StrategistReply {
  const c = ctx.campaign;
  const product = ctx.org.products[0];
  const obj = c ? objectiveLabel(c.objective) : 'Product launch';
  const audience = c ? `${c.audience.genders.includes('all') ? 'All genders' : c.audience.genders.join(' & ')}${c.audience.ageMin ? `, ages ${c.audience.ageMin}–${c.audience.ageMax}` : ''}${c.locations.length ? `, in ${c.locations.join(', ')}` : ''}` : `Define age range, gender and market for ${ctx.org.country}`;
  const dels = c ? c.deliverables.map((d) => `- ${d.quantity} × ${formatLabel(d.format)} on ${platformLabel(d.platform)}`).join('\n') : deliverables(ctx).text.split('\n').filter((l) => l.startsWith('- ')).join('\n');
  return {
    intent: 'brief',
    basedOn: c ? ['Campaign settings'] : ['Organisation profile'],
    text: [
      `### Campaign brief — ${c?.name ?? product?.name ?? ctx.org.name}`,
      `_AI-suggested draft. Review and edit before sharing with creators._`,
      '',
      `**Objective:** ${obj}.${c?.performanceTargets ? ` Target: ${c.performanceTargets}` : ' Set one measurable target (e.g. link clicks or code redemptions).'}`,
      `**Audience:** ${audience}.`,
      `**Product:** ${product ? `${product.name} — ${product.description}` : 'Add a product in Settings so briefs can describe it.'}`,
      `**Key message:** one sentence a viewer should remember. Let creators say it in their own words.`,
      `**Deliverables:**\n${dels}`,
      `**Do:** show real use, disclose the partnership clearly (#ad / “Paid partnership”), keep the creator’s voice.`,
      `**Don’t:** make medical, financial or before/after claims you can’t substantiate; script word-for-word.`,
      `**Approvals:** ${c ? `${c.approval.internal ? 'Internal review' : 'No internal review'}${c.approval.client ? ' then client approval' : ''}` : 'Decide who signs off and how fast'}. Give feedback within 2 working days.`,
      `**Compensation:** ${c ? compensationLabel(c.compensationModel) : 'Guaranteed base fee plus an optional performance bonus is the fairest default'}.`,
    ].join('\n'),
  };
}

function categories(ctx: StrategistContext): StrategistReply {
  const source = [ctx.org.industry, ...ctx.org.products.map((p) => `${p.name} ${p.description}`), ctx.campaign?.description].filter(Boolean).join('. ');
  const found = interpretLocally(source).criteria.categories;
  const primary = ctx.campaign?.categories.length ? ctx.campaign.categories : found;
  const adj: Record<string, string[]> = { beauty: ['lifestyle', 'fashion'], food: ['lifestyle', 'parenting'], fitness: ['lifestyle', 'food'], fashion: ['beauty', 'lifestyle'], tech: ['education', 'gaming'], finance: ['education', 'lifestyle'], travel: ['lifestyle', 'food'] };
  const secondary = [...new Set(primary.flatMap((p) => adj[p] ?? []))].filter((x) => !primary.includes(x as never));
  if (!primary.length) return { intent: 'categories', basedOn: [], text: 'I couldn’t infer a category. Add your industry and a product in Settings, or describe the product here.' };
  return {
    intent: 'categories', basedOn: ['Organisation profile', 'Products'],
    text: [`### Suggested creator categories`, `**Primary:** ${primary.map((x) => categoryLabel(x as never)).join(', ')} — closest to what you sell.`, secondary.length ? `**Secondary:** ${secondary.map((x) => categoryLabel(x as never)).join(', ')} — reach adjacent audiences who still care about the product.` : '', `_Suggestion based on your industry and product descriptions._`].filter(Boolean).join('\n'),
  };
}

function creators(ctx: StrategistContext, need: (w: string) => StrategistReply): StrategistReply {
  if (!ctx.campaign) return need('suggest creators');
  const m = ctx.topMatches ?? [];
  if (!m.length) return { intent: 'creators', basedOn: [], text: 'No listed creators match this campaign yet. Try widening categories, markets or the budget per creator.' };
  return {
    intent: 'creators', basedOn: ['Creator profiles (shared fields only)', 'Campaign brief'],
    text: [`### Top matches for “${ctx.campaign.name}”`, ...m.slice(0, 5).map((x, i) => `${i + 1}. **${x.name}** (@${x.handle}) — match ${x.score}/100, ${x.confidence} confidence. ${x.role}. ${x.reasons[0] ?? ''}${x.concerns[0] ? ` _Watch: ${x.concerns[0]}_` : ''}${x.fee ? ` Typical rate ${x.fee} (${x.budgetFit === 'within' ? 'within budget' : x.budgetFit === 'stretch' ? 'a stretch' : x.budgetFit === 'over' ? 'over budget' : 'unknown fit'}).` : ''}`), '', `Open **Recommendations** on the campaign for the full factor-by-factor breakdown.`].join('\n'),
  };
}

function ideas(ctx: StrategistContext): StrategistReply {
  const cats = ctx.campaign?.categories.length ? ctx.campaign.categories : interpretLocally(`${ctx.org.industry ?? ''} ${ctx.org.products.map((p) => p.description).join(' ')}`).criteria.categories;
  const list = (cats.length ? cats : ['lifestyle']).flatMap((cat) => IDEAS[cat] ?? IDEAS.lifestyle).slice(0, 4);
  return { intent: 'ideas', basedOn: ['Campaign categories'], text: [`### Campaign ideas`, `_AI suggestions — let creators adapt them to their own style._`, ...list.map((x) => `- ${x}`)].join('\n') };
}

function deliverables(ctx: StrategistContext): StrategistReply {
  const obj = ctx.campaign?.objective ?? 'awareness';
  const list = DELIVERABLES_BY_OBJECTIVE[obj].filter((d) => !ctx.campaign?.platforms.length || ctx.campaign.platforms.includes(d.platform) || d.format === 'ugc_asset');
  return { intent: 'deliverables', basedOn: ['Campaign objective'], text: [`### Suggested deliverables for ${objectiveLabel(obj).toLowerCase()}`, ...(list.length ? list : DELIVERABLES_BY_OBJECTIVE[obj]).map((d) => `- ${formatLabel(d.format)} on ${platformLabel(d.platform)} — ${d.why}`), `\nKeep it to 2–3 deliverables per creator for micro creators; more usually lowers quality.`].join('\n') };
}

function budget(ctx: StrategistContext, need: (w: string) => StrategistReply): StrategistReply {
  const c = ctx.campaign;
  if (!c || !ctx.budget) return need('suggest an allocation');
  const b = ctx.budget;
  const split = c.objective === 'awareness' || c.objective === 'launch' ? [['mid', 0.3], ['micro', 0.45], ['nano', 0.15]] : c.objective === 'sales' || c.objective === 'traffic' ? [['micro', 0.5], ['nano', 0.25], ['mid', 0.15]] : [['micro', 0.55], ['nano', 0.3], ['mid', 0.05]];
  const lines = split.map(([t, share]) => {
    const st = ctx.tierStats?.find((x) => x.tier === t);
    const amount = b.total * (share as number);
    const n = st?.medianRate ? Math.floor(amount / st.medianRate) : null;
    return `- **${t === 'mid' ? 'Mid-tier' : t === 'micro' ? 'Micro' : 'Nano'} (${Math.round((share as number) * 100)}%)** — ${money(amount, c.currency)}${n != null ? `, roughly ${n} creator${n === 1 ? '' : 's'} at the median shared rate of ${money(st!.medianRate, c.currency)} (${st!.sampleSize} profiles)` : ' — not enough shared rates to estimate creator count'}.`;
  });
  return {
    intent: 'budget', basedOn: ['Campaign budget', 'Indicative rates creators chose to share'],
    text: [`### Suggested allocation for ${money(b.total, c.currency)}`, `_Estimate. Rates are creator-submitted and converted at reference FX where needed. No outcome is guaranteed._`, ...lines, `- **Contingency (10%)** — ${money(b.total * 0.1, c.currency)} for bonuses, extra revisions or a late hero swap.`, '', `**Committed so far:** ${money(b.committed, c.currency)} in agreed fees${b.platformFee ? ` + ${money(b.platformFee, c.currency)} platform fee` : ''}${b.agencyFee ? ` + ${money(b.agencyFee, c.currency)} agency fee` : ''}. **Uncommitted:** ${money(b.remaining, c.currency)}.`].join('\n'),
  };
}

function timeline(ctx: StrategistContext, need: (w: string) => StrategistReply): StrategistReply {
  const c = ctx.campaign;
  if (!c) return need('plan a timeline');
  const start = new Date(c.startDate).getTime();
  const end = new Date(c.endDate).getTime();
  const span = Math.max(end - start, 14 * DAY);
  const at = (f: number) => formatDate(new Date(start + span * f).toISOString(), { year: undefined });
  const before = (d: number) => formatDate(new Date(start - d * DAY).toISOString(), { year: undefined });
  return {
    intent: 'timeline', basedOn: ['Campaign dates'],
    text: [`### Recommended timeline`, `- **${before(21)} – ${before(10)}** — shortlist, invite and agree terms`, `- **${before(10)}** — send product and final brief`, `- **${before(7)} – ${before(2)}** — first drafts due; reviews within 2 working days`, `- **${at(0)}** — campaign goes live`, `- **${at(0.5)}** — mid-campaign check: re-share top performers, adjust stories`, `- **${at(1)}** — last posts live`, `- **${formatDate(new Date(end + 7 * DAY).toISOString(), { year: undefined })}** — collect results and screenshots, record them in Analytics`, `\n_Suggestion. Allow more time if client approval is required (${c.approval.client ? 'it is' : 'it isn’t'} on this campaign)._`].join('\n'),
  };
}

function risks(ctx: StrategistContext, need: (w: string) => StrategistReply): StrategistReply {
  const c = ctx.campaign;
  if (!c) return need('check risks');
  const out: string[] = [];
  const days = Math.round((new Date(c.startDate).getTime() - Date.now()) / DAY);
  if (ctx.budget && ctx.budget.remaining < 0) out.push(`**Over budget:** commitments exceed the budget by ${money(-ctx.budget.remaining, c.currency)}.`);
  else if (ctx.budget && ctx.budget.remaining < ctx.budget.total * 0.1 && (ctx.pipeline?.negotiating ?? 0) > 0) out.push(`**Budget tight:** only ${money(ctx.budget.remaining, c.currency)} uncommitted with ${ctx.pipeline?.negotiating} negotiation(s) open.`);
  if (days >= 0 && days < 10 && (ctx.pipeline?.agreed ?? 0) === 0) out.push(`**Timing:** starts in ${days} days with no agreed creators yet.`);
  if ((ctx.deliverables?.overdue ?? 0) > 0) out.push(`**Overdue content:** ${ctx.deliverables!.overdue} deliverable(s) past their deadline.`);
  if ((ctx.deliverables?.inReview ?? 0) > 2) out.push(`**Review backlog:** ${ctx.deliverables!.inReview} submissions waiting — slow feedback delays posting.`);
  if (c.approval.client) out.push('**Two-stage approval:** client sign-off adds time. Agree a turnaround with the client.');
  const selfReported = ctx.topMatches?.filter((m) => m.concerns.some((x) => x.includes('self-reported'))).length ?? 0;
  if (selfReported) out.push(`**Unverified audience data:** ${selfReported} of the top matches report their own figures. Ask for recent insights screenshots before agreeing fees.`);
  if (c.compensationModel === 'gifting') out.push('**Gifting only:** expect lower acceptance and less control over timing. Consider a small base fee.');
  if (['beauty', 'fitness', 'finance'].some((x) => c.categories.includes(x as never))) out.push('**Claims:** this category is sensitive to health or financial claims. Review captions against local advertising rules.');
  out.push('**Disclosure:** make sure every post is clearly labelled as a paid partnership.');
  return { intent: 'risks', basedOn: ['Campaign', 'Budget', 'Pipeline', 'Deliverables'], text: [`### Risk check — ${c.name}`, ...out.map((x) => `- ${x}`)].join('\n') };
}

function performance(ctx: StrategistContext, need: (w: string) => StrategistReply): StrategistReply {
  const c = ctx.campaign;
  if (!c) return need('summarise performance');
  const a = ctx.analytics;
  if (!a || (a.reach == null && a.engagements == null && a.clicks == null)) return { intent: 'performance', basedOn: [], text: `No results recorded for “${c.name}” yet. Add results from creator insights in **Analytics** — I won’t estimate performance without data.` };
  const srcs = a.sources.map((s) => SOURCE_META[s as keyof typeof SOURCE_META]?.label ?? s).join(', ');
  return {
    intent: 'performance', basedOn: [`Recorded results (${srcs})`, 'Agreed fees'],
    text: [
      `### Performance so far — ${c.name}`,
      a.sample ? '_Includes fictional sample data from the demo workspace._' : '',
      `- **Reach:** ${compact(a.reach)} · **Impressions:** ${compact(a.impressions)}`,
      `- **Engagements:** ${compact(a.engagements)} (${pct(a.engagementRate)} of impressions)`,
      `- **Clicks:** ${compact(a.clicks)} · **Conversions:** ${compact(a.conversions)}`,
      `- **Cost per engagement:** ${a.cpe != null ? money(a.cpe, c.currency) : '—'} · **Cost per click:** ${a.cpc != null ? money(a.cpc, c.currency) : '—'} _(calculated from agreed fees of ${money(a.spend, c.currency)})_`,
      ``,
      `Source: ${srcs}. These figures are only as reliable as what was submitted.`,
    ].filter(Boolean).join('\n'),
  };
}
