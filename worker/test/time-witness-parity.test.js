// PARITY + mutation-style unit tests: worker/src/timeWitness.js mirrors
// app/src/lib/timeWitness.js (BUILD_PLAN_WITNESS_FLEET_2.md W8, "the
// time-witness pack"). The two files are byte-identical (no imports on either
// side), but this test gates them against drift the way every other mirror
// pair in this codebase does, AND is the mutation-style coverage the plan asks
// for (boundary accepted, near-miss rejected — the vision-label.test.js style).

import { describe, it, expect } from 'vitest'
import * as workerTW from '../src/timeWitness.js'
import * as clientTW from '../../app/src/lib/timeWitness.js'

describe('timeWitness.js parity (worker mirror ≡ client)', () => {
  it('exports match on both sides', () => {
    expect(Object.keys(workerTW).sort()).toEqual(Object.keys(clientTW).sort())
    expect(workerTW.CAMERA_ATSRC).toEqual(clientTW.CAMERA_ATSRC)
    expect(workerTW.LONG_LAG_MS).toBe(clientTW.LONG_LAG_MS)
    expect(workerTW.SHORT_LAG_MS).toBe(clientTW.SHORT_LAG_MS)
  })
})

for (const [label, TW] of [['worker', workerTW], ['client', clientTW]]) {
  describe(`timeWitness.js (${label})`, () => {
    describe('isCameraAtSrc / isSuggestionGradeAtSrc', () => {
      it('camera-EXIF atSrc values are camera, file-mtime is not', () => {
        expect(TW.isCameraAtSrc('exif-original')).toBe(true)
        expect(TW.isCameraAtSrc('exif-create')).toBe(true)
        expect(TW.isCameraAtSrc('exif-modify')).toBe(true)
        expect(TW.isCameraAtSrc('file-mtime')).toBe(false)
        expect(TW.isCameraAtSrc('test')).toBe(false)
        expect(TW.isCameraAtSrc(undefined)).toBe(false)
        expect(TW.isCameraAtSrc(null)).toBe(false)
        expect(TW.isCameraAtSrc('exif-bogus')).toBe(false) // near-miss, never coerced
      })

      it('suggestion-grade is ONLY file-mtime — absent atSrc is unknown, not suggestion-grade', () => {
        expect(TW.isSuggestionGradeAtSrc('file-mtime')).toBe(true)
        expect(TW.isSuggestionGradeAtSrc('exif-original')).toBe(false)
        expect(TW.isSuggestionGradeAtSrc(undefined)).toBe(false)
        expect(TW.isSuggestionGradeAtSrc(null)).toBe(false)
        expect(TW.isSuggestionGradeAtSrc('')).toBe(false)
      })
    })

    describe('importLagClass — direction-asymmetric, atSrc-aware', () => {
      const T0 = Date.parse('2026-07-01T12:00:00.000Z')

      it('a LONG lag always demotes, regardless of atSrc', () => {
        const createdAtMs = T0 + TW.LONG_LAG_MS + 1000
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'exif-original' })).toBe('long-demote')
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'file-mtime' })).toBe('long-demote')
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: undefined })).toBe('long-demote')
      })

      it('a SHORT lag corroborates ONLY for genuine camera-EXIF atSrc', () => {
        const createdAtMs = T0 + TW.SHORT_LAG_MS - 1000
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'exif-original' })).toBe('short-corroborate')
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'exif-create' })).toBe('short-corroborate')
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'exif-modify' })).toBe('short-corroborate')
      })

      it('a SHORT lag is EXCLUDED (never corroborates) for file-mtime — rule 3, same file-system clock', () => {
        const createdAtMs = T0 + TW.SHORT_LAG_MS - 1000
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'file-mtime' })).toBe('short-excluded')
      })

      it('a SHORT lag is EXCLUDED for ABSENT atSrc too — the pre-sidecar archive majority', () => {
        const createdAtMs = T0 + TW.SHORT_LAG_MS - 1000
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: undefined })).toBe('short-excluded')
      })

      it('between short and long is genuinely uninformative — no-signal, not a guess either way', () => {
        const createdAtMs = T0 + TW.SHORT_LAG_MS + 3600000 // an hour past the short window, well under long
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'exif-original' })).toBe('no-signal')
      })

      it('a negative lag (uploaded "before" capture) abstains rather than misclassifying', () => {
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs: T0 - 1000, atSrc: 'exif-original' })).toBe('no-signal')
      })

      it('missing/non-finite inputs abstain, never throw', () => {
        expect(TW.importLagClass({})).toBe('no-signal')
        expect(TW.importLagClass({ capturedAtMs: NaN, createdAtMs: T0 })).toBe('no-signal')
        expect(TW.importLagClass()).toBe('no-signal')
      })

      it('the boundary itself: exactly LONG_LAG_MS is still short/no-signal territory, not long-demote (> not >=)', () => {
        const createdAtMs = T0 + TW.LONG_LAG_MS
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'exif-original' })).not.toBe('long-demote')
      })

      it('the boundary itself: exactly SHORT_LAG_MS still corroborates (<=)', () => {
        const createdAtMs = T0 + TW.SHORT_LAG_MS
        expect(TW.importLagClass({ capturedAtMs: T0, createdAtMs, atSrc: 'exif-original' })).toBe('short-corroborate')
      })
    })

    describe('isPassengerRef — screenshot/graphic demotion', () => {
      it('a real camera photo (camera extension) is never a passenger, even with no meta', () => {
        expect(TW.isPassengerRef({ srcName: 'IMG_1234.HEIC' })).toBe(false)
        expect(TW.isPassengerRef({ srcName: 'IMG_1234.jpg' })).toBe(false)
        expect(TW.isPassengerRef({ srcName: 'MOV_0001.MOV' })).toBe(false)
      })

      it('a non-camera extension WITH meta present is not a passenger (EXIF found — a real photo saved oddly)', () => {
        expect(TW.isPassengerRef({ srcName: 'IMG_1234.PNG', meta: { make: 'Apple' } })).toBe(false)
      })

      it('a non-camera extension with meta ABSENT is a passenger (the primary design: extension + meta-absent corroborator)', () => {
        expect(TW.isPassengerRef({ srcName: 'IMG_1234.PNG' })).toBe(true)
        expect(TW.isPassengerRef({ srcName: 'Screenshot_2026-07-01.png', meta: {} })).toBe(true)
        expect(TW.isPassengerRef({ srcName: 'clip.gif' })).toBe(true)
      })

      it('no srcName at all abstains — nothing to classify (archive screenshots stay undetectable, forward-only)', () => {
        expect(TW.isPassengerRef({})).toBe(false)
        expect(TW.isPassengerRef(null)).toBe(false)
        expect(TW.isPassengerRef({ srcName: '' })).toBe(false)
      })

      it('an unparseable srcName (no extension) abstains, never throws', () => {
        expect(TW.isPassengerRef({ srcName: 'no-extension-here' })).toBe(false)
      })
    })
  })
}
