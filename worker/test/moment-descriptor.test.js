// momentDescriptorForm (S1) — the {moment} label normalizer. The moment's
// dominant vision name → the confirm question's noun-phrase slot.
import { describe, it, expect } from 'vitest'
import { momentDescriptorForm } from '../src/sessionHeal.js'

describe('momentDescriptorForm', () => {
  it('rewrites a leading "At the" / "At" into a noun-phrase slot', () => {
    expect(momentDescriptorForm('At the beach')).toBe('the beach')      // "look like the beach —", not "at the beach"
    expect(momentDescriptorForm('At the museum')).toBe('the museum')
    expect(momentDescriptorForm('At A-House')).toBe('A-House')
  })
  it('warms a common activity lead to lowercase; leaves a proper noun capitalized', () => {
    expect(momentDescriptorForm('Walking around town')).toBe('walking around town') // warmer mid-sentence
    expect(momentDescriptorForm('Playing at the park')).toBe('playing at the park')
    expect(momentDescriptorForm('Dinner out')).toBe('dinner out')
    expect(momentDescriptorForm('July 4th parade')).toBe('July 4th parade') // proper noun untouched (safelist)
    expect(momentDescriptorForm('Farmers market')).toBe('Farmers market')   // not in the safelist → left as-is
  })
  it('does not fire on an "at" that is not a leading preposition', () => {
    expect(momentDescriptorForm('Batting practice')).toBe('Batting practice') // "at" mid-word untouched
  })
  it('empty / whitespace / non-string → empty (the card falls back)', () => {
    expect(momentDescriptorForm('')).toBe('')
    expect(momentDescriptorForm('   ')).toBe('')
    expect(momentDescriptorForm(null)).toBe('')
    expect(momentDescriptorForm(42)).toBe('')
  })
})
