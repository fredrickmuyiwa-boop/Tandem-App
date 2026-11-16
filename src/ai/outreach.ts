// Personalised outreach drafts, built only from real profile and campaign data.
// Drafts are never sent automatically: the user edits and sends them.
import type { Campaign } from '../domain/types';
import type { CreatorView } from '../server/services/creators';
import { categoryLabel, formatLabel, objectiveLabel, platformLabel } from '../domain/constants';
import { firstName, formatDate } from '../lib/utils';

export function draftInvitation(input: { creator: CreatorView; campaign: Campaign; orgName: string; senderName: string; productName?: string; reasons?: string[] }): string {
  const { creator: c, campaign: k } = input;
  const shared = c.categories.filter((x) => k.categories.includes(x));
  const sample = c.portfolio.find((p) => p.title);
  const market = c.audience?.topCountries?.find((t) => k.locations.includes(t.country));
  const deliverables = k.deliverables.map((d) => `${d.quantity} × ${formatLabel(d.format).toLowerCase()} on ${platformLabel(d.platform)}`).join(', ');
  const lines = [
    `Hi ${firstName(c.displayName)},`,
    '',
    `I’m ${firstName(input.senderName)} from ${input.orgName}. We’re running “${k.name}”, a ${objectiveLabel(k.objective).toLowerCase()} campaign${input.productName ? ` for ${input.productName}` : ''}${k.locations.length ? ` in ${k.locations.join(' and ')}` : ''}, and your work is a strong fit.`,
    '',
    [
      shared.length ? `Your ${shared.map(categoryLabel).join(' and ').toLowerCase()} content matches what we’re looking for` : `Your content style caught our attention`,
      sample ? `, and “${sample.title}” is the kind of piece we have in mind` : '',
      market ? `. It also helps that a large part of your audience is in ${market.country}` : '',
      '.',
    ].join(''),
    '',
    `What we’d love to create together: ${deliverables}, between ${formatDate(k.startDate)} and ${formatDate(k.endDate)}.`,
    k.guidelines ? `We keep the brief light — you know your audience best.` : '',
    '',
    `The proposed terms are attached to this invitation. Happy to talk through anything — reply here with questions or a counteroffer.`,
    '',
    `Thanks,`,
    `${input.senderName}`,
    `${input.orgName}`,
  ];
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').replace(/\n{3,}/g, '\n\n');
}
