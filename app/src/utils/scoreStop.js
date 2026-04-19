// Scoring & filtering for Feature 3 (Re-Plan with Alternatives).
// Takes a candidate stop from curatedStops.js and applies:
//   - family preference scoring (loves / avoids / serves)
//   - dietary vetoes (Helen vegetarian real-entrée rule)
//   - chain blacklist and tourist-trap vetoes
//   - novelty check against recent-meals log
//   - logistics (open-now, dwell time vs required, off-highway minutes)
//
// Returns a structured evaluation so the UI can render transparent reasoning.

import {
  FAMILY, CHAIN_BLACKLIST, FALLBACK_TIER, TOURIST_TRAP_SIGNALS, cuisineCategory,
} from '../data/preferences.js'
import { flagAppliesToStop, flagActiveOn } from './riskWatch.js'

export function evaluateStop(stop, {
  familyPresent = ['jonathan', 'helen', 'aurelia', 'rafa'],
  recentMeals = [],       // [{name, notes, date}]
  nowDate = new Date(),
  situation = null,       // 'running-late' | 'need-food' | etc.
  requireMeal = false,    // true when filling a meal slot
  riskFlags = [],         // active flags from riskWatch.listAllFlags()
} = {}) {
  const reasons = []
  const vetoes = []
  const hooks = {}
  let score = 0

  const nameLc = (stop.name || '').toLowerCase()

  // Hard vetoes first.
  if (CHAIN_BLACKLIST.some((c) => nameLc.includes(c))) {
    vetoes.push({ severity: 'hard', kind: 'chain', msg: 'Chain restaurant — never a real recommendation' })
  }
  if (TOURIST_TRAP_SIGNALS.some((c) => nameLc.includes(c))) {
    vetoes.push({ severity: 'hard', kind: 'tourist-trap', msg: 'Tourist-trap coded — skip' })
  }
  if (FALLBACK_TIER.some((c) => nameLc.includes(c)) || stop.cuisine === 'fallback') {
    vetoes.push({ severity: 'soft', kind: 'fallback-tier', msg: 'Fallback-tier only — not a top pick' })
  }

  // Helen dietary rule — a meal stop must have a real vegetarian entrée.
  if (requireMeal && familyPresent.includes('helen')) {
    const hasVegEntree = stopHasRealVegEntree(stop)
    if (!hasVegEntree) {
      vetoes.push({ severity: 'hard', kind: 'helen-veg', msg: "Fails Helen's dietary: no real vegetarian entrée" })
    }
  }

  // Dwell-time check — Rafa attention span + real-stop threshold.
  if (requireMeal && stop.dwellMin != null && stop.dwellMin < 30) {
    vetoes.push({ severity: 'hard', kind: 'too-short', msg: 'Under 30 min — photo-stop, not a meal' })
  }

  // Per-person serving reasons.
  for (const p of familyPresent) {
    const f = FAMILY[p]
    if (!f) continue
    const matchedLoves = (stop.tags || []).filter((t) => f.loves.includes(t))
    const matchedAvoids = (stop.tags || []).filter((t) => f.avoids.includes(t))
    if (matchedAvoids.length) {
      vetoes.push({
        severity: 'hard', kind: `${p}-avoid`,
        msg: `Fails ${cap(p)}'s avoid list (${matchedAvoids.join(', ')})`,
      })
    }
    if ((stop.serves || []).includes(p) || matchedLoves.length) {
      const reason = stop.servesReason?.[p] ||
        `matches ${cap(p)}'s ${matchedLoves.slice(0, 2).join(', ')}`
      hooks[p] = reason
      reasons.push({ person: p, reason })
      score += 3 + matchedLoves.length
    }
  }

  // Novelty check: does this cuisine repeat the last ≤ 2 days?
  let novelty = 'fresh'
  if (stop.cuisine) {
    const recentCats = recentMeals.map((m) => cuisineCategory(m.name, m.notes || ''))
    if (recentCats.includes(stop.cuisine)) {
      novelty = 'repeat'
      score -= 4
      reasons.push({
        person: 'all',
        reason: `Novelty check FAIL — ${stop.cuisine} already in the last 48h`,
      })
    } else if (recentCats.length > 0) {
      reasons.push({
        person: 'all',
        reason: `Novelty OK — ${stop.cuisine} differs from recent ${recentCats.slice(-2).join(', ')}`,
      })
    }
  }

  // Open-now check (if we have hours data).
  let openNow = null
  if (stop.openDays && stop.openTime && stop.closeTime) {
    openNow = isOpenAt(stop, nowDate)
    if (!openNow) {
      vetoes.push({ severity: 'hard', kind: 'closed', msg: `Closed at ${fmtClock(nowDate)}` })
    }
  } else if (stop.openDays === null && stop.openTime === null) {
    openNow = true // explicitly always-open
  }

  // Off-highway distance
  if (stop.offHwyMin != null && stop.offHwyMin > 10) {
    score -= 2
    reasons.push({ person: 'all', reason: `${stop.offHwyMin} min off highway — far` })
  }

  // Situational boosts
  if (situation === 'need-run-around' && (stop.tags || []).includes('running-space')) {
    score += 3
  }
  if (situation === 'running-late' && stop.dwellMin <= 30) {
    score += 1
  }

  // Feature 4 — Risk flag integration.
  // A candidate that matches an active flag for `nowDate` gets vetoed
  // (closed-weekday, closed-renovation, no-longer-operating) or a soft
  // warning (hours-restricted, construction, other).
  const hardRiskKinds = new Set([
    'closed-weekday', 'closed-seasonal', 'closed-renovation', 'no-longer-operating',
  ])
  const activeFlags = (riskFlags || []).filter(
    (f) => flagAppliesToStop(f, stop) && flagActiveOn(f, nowDate)
  )
  for (const f of activeFlags) {
    if (hardRiskKinds.has(f.riskType)) {
      vetoes.push({ severity: 'hard', kind: 'risk-flag', msg: `Risk flag: ${f.details}` })
    } else {
      vetoes.push({ severity: 'soft', kind: 'risk-flag', msg: `Heads-up: ${f.details}` })
      score -= 1
    }
  }

  const hardVeto = vetoes.some((v) => v.severity === 'hard')
  return {
    stop,
    score: hardVeto ? -1 : score,
    hardVeto,
    vetoes,
    hooks,
    reasons,
    novelty,
    openNow,
  }
}

function stopHasRealVegEntree(stop) {
  // Explicit serves-helen OR cuisine with reliable veg depth OR servesReason
  // that names a veg entrée.
  if (stop.vetoes?.some((v) => v.includes('helen') || v.includes('veg'))) return false
  if ((stop.serves || []).includes('helen')) {
    const reason = stop.servesReason?.helen || ''
    if (/veggie|vegetarian|grain|pasta|falafel|hummus|beyond|pizza|mediterranean|indian|thai/i.test(reason)) {
      return true
    }
  }
  // Cuisines with reliable veg depth:
  const safeCuisines = ['mediterranean', 'indian', 'thai', 'vietnamese']
  if (safeCuisines.includes(stop.cuisine)) return true
  return false
}

function isOpenAt(stop, date) {
  const dow = date.getDay()
  if (!stop.openDays.includes(dow)) return false
  const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  return hhmm >= stop.openTime && hhmm <= stop.closeTime
}

function pad(n) { return n.toString().padStart(2, '0') }
function cap(s) { return s[0].toUpperCase() + s.slice(1) }
function fmtClock(d) {
  const h = d.getHours(); const m = d.getMinutes()
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${pad(m)} ${ap}`
}

// Rank a batch of candidates.
export function rankCandidates(candidates, context) {
  const evaluated = candidates.map((s) => evaluateStop(s, context))
  return evaluated
    .filter((e) => !e.hardVeto)
    .sort((a, b) => b.score - a.score)
}
