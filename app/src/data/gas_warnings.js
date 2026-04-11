// Gas spacing warnings per ROADTRIP_PWA_ADDENDUM.md §7.
// Flags driving stretches over 60 miles where gas is sparse enough
// that it's worth topping off before heading into it.
//
// The addendum explicitly names two stretches. Vicksburg → Terrell is
// long but has Buc-ee's and truck stops on I-20 — not a warning.

export const GAS_WARNINGS = {
  sat18: {
    miles: 100,
    route: 'Catskills → Scranton',
    note:
      'Top off before leaving the Catskills — it\u2019s ~100 miles to the first decent cluster and rural NY stations get sparse.',
  },
  mon20: {
    miles: 80,
    route: 'McComb → Jackson via US-51',
    note:
      'Rural Mississippi with limited stations. Fill up in McComb before the push north.',
  },
}
