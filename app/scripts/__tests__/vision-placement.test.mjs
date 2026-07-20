import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visionWitnesses, buildVisionExemplars, inferStopType } from '../../src/lib/visionPlacement.js'
import { buildEvidenceBench } from '../../src/lib/evidenceBench.js'
import { settle } from '../../src/lib/settlingEngine.js'

const at = (h, m = 0) => Date.UTC(2026, 6, 4, h, m)
const P = (arr, w) => arr.filter((e) => e.witness === w)

test('signage → the place it NAMES (observed, graded); abstains without a sign or a match', () => {
  const places = [{ id: 'af', name: 'Angel Foods' }, { id: 'hc', name: 'Herring Cove' }]
  const ev = visionWitnesses([{ id: 'p', signage: 'ANGEL FOODS' }, { id: 'q' /* no signage */ }], places)
  const sig = P(ev, 'signage')
  assert.equal(sig.length, 1, 'only the photo with a legible sign speaks')
  assert.equal(sig[0].photoId, 'p')
  assert.ok(sig[0].support.af > 0.9 && !('hc' in sig[0].support), 'names Angel Foods, not the harbour')
  assert.equal(sig[0].tier, 'observed', 'a sign naming a place is a real observation')
})

test('placeType → broad support across same-type stops (CONFLICT, not a pick); tier derived', () => {
  const places = [{ id: 'b1', name: 'Town beach' }, { id: 'b2', name: 'Herring Cove' }, { id: 'm1', name: 'The museum' }]
  const ev = P(visionWitnesses([{ id: 'p', placeType: 'beach' }], places), 'placeType')
  assert.equal(ev.length, 1)
  assert.ok('b1' in ev[0].support && 'b2' in ev[0].support, 'both beaches supported at once — genuine conflict')
  assert.ok(!('m1' in ev[0].support), 'the museum is not a beach')
  assert.equal(ev[0].tier, 'derived', 'a category is a soft, broad voice — never files alone')
})

test('lookalike → "looks like what I filed at X" (derived); and it NEVER recognises itself/siblings', () => {
  const filed = [{ id: 'e1', memoryId: 'm1', currentStopId: 'X', placeType: 'beach', labels: ['sand', 'ocean', 'kids'] }]
  const exemplars = buildVisionExemplars(filed)
  const places = [{ id: 'X' }, { id: 'Y' }]

  const stranger = P(visionWitnesses([{ id: 'q', memoryId: 'mq', placeType: 'beach', labels: ['sand', 'ocean'] }], places, { exemplars }), 'lookalike')
  assert.equal(stranger.length, 1)
  assert.ok(stranger[0].support.X > 0, 'a new beach photo is lent a prior for the place beach photos were filed to')
  assert.equal(stranger[0].tier, 'derived')

  // the holdout: a photo from the SAME memory as the exemplar must not recognise itself
  const self = P(visionWitnesses([{ id: 'q2', memoryId: 'm1', placeType: 'beach', labels: ['sand', 'ocean'] }], places, { exemplars }), 'lookalike')
  assert.equal(self.length, 0, 'no cheating: an exemplar can never vouch for its own memory')
})

test('lookalike abstains with no reference corpus (emergent channel)', () => {
  assert.equal(P(visionWitnesses([{ id: 'p', placeType: 'beach', labels: ['sand'] }], [{ id: 'X' }]), 'lookalike').length, 0)
})

test('inferStopType reads a stop’s kind from its name, and honestly abstains when it can’t', () => {
  assert.equal(inferStopType('Herring Cove'), 'beach')
  assert.equal(inferStopType('Angel Foods'), 'restaurant')
  assert.equal(inferStopType('The Museum'), 'museum')
  assert.equal(inferStopType('Art Omi'), null, 'a name that names no type → abstain, never guess')
})

test('the machine SEES a GPS-less photo through vision alone (the §16 point)', () => {
  const places = [{ id: 'af', name: 'Angel Foods', lat: 42, lng: -70 }, { id: 'hc', name: 'Herring Cove', lat: 42.2, lng: -70.3 }]
  // no coordinate, no time-of-day match — only a sign in the frame
  const bench = buildEvidenceBench([{ id: 'p', at: at(14), signage: 'Angel Foods' }], places)
  const p = settle(bench, places).photos.get('p')
  assert.equal(p.top, 'af', 'placed by the sign it read, with no GPS at all')
  assert.notEqual(p.destination, 'leave', 'the machine is no longer blind to a vision-only photo')
})
