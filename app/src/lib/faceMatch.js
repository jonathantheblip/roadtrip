// Pure face-embedding math — the part of the recognizer that turns a
// 512-d face "fingerprint" into "which of the four family members is
// this (or nobody)". No model, no DOM, no network: just vector
// arithmetic on numbers the embedder already produced. Kept separate
// from faceModel.js (the browser-only detector + embedder) so this
// logic runs under `node --test` and survives a future model swap —
// the same isolation the EXIF adapter uses (exifRead.js).
//
// Privacy note: nothing here leaves the device. These are local
// computations on embeddings; the load-bearing "faces never leave the
// iPad" promise is upheld upstream in faceModel.js, which runs the
// detector + embedder entirely on-device.
//
// The family is FIXED (4 people), so recognition is *matching against
// a few enrolled people*, not open-world clustering: embed a face,
// find the nearest enrolled person by cosine similarity, accept it
// only if it clears a distance threshold.

// L2-normalize a vector to unit length. Face embedders output vectors
// whose *direction* encodes identity; normalizing lets us compare with
// a plain dot product (= cosine similarity). Returns a Float32Array.
// A zero vector is returned unchanged (no divide-by-zero).
export function l2normalize(vec) {
  const out = new Float32Array(vec.length)
  let sum = 0
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i]
  const norm = Math.sqrt(sum)
  if (norm === 0 || !Number.isFinite(norm)) return out
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm
  return out
}

// Dot product. With both inputs L2-normalized this IS cosine similarity.
export function dot(a, b) {
  if (a.length !== b.length) {
    throw new Error(`embedding length mismatch: ${a.length} vs ${b.length}`)
  }
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

// Cosine similarity in [-1, 1]; 1 = identical direction. Normalizes
// defensively so callers can pass raw or pre-normalized vectors.
export function cosineSimilarity(a, b) {
  return dot(l2normalize(a), l2normalize(b))
}

// Cosine distance in [0, 2]; 0 = identical.
export function cosineDistance(a, b) {
  return 1 - cosineSimilarity(a, b)
}

// Average several embeddings of the same person into one reference
// "centroid", re-normalized. Averaging a few clear photos is steadier
// than trusting any single shot (lighting / angle vary). Empty list
// throws — a person must enroll at least one face.
export function meanEmbedding(embeddings) {
  if (!embeddings || embeddings.length === 0) {
    throw new Error('meanEmbedding: need at least one embedding')
  }
  const dim = embeddings[0].length
  const acc = new Float64Array(dim)
  for (const e of embeddings) {
    if (e.length !== dim) {
      throw new Error(`meanEmbedding: dim mismatch ${e.length} vs ${dim}`)
    }
    const n = l2normalize(e)
    for (let i = 0; i < dim; i++) acc[i] += n[i]
  }
  for (let i = 0; i < dim; i++) acc[i] /= embeddings.length
  return l2normalize(acc)
}

// Build one enrolled person from their reference photos' embeddings.
// → { personId, centroid: Float32Array, count }
export function enrollPerson(personId, embeddings) {
  return { personId, centroid: meanEmbedding(embeddings), count: embeddings.length }
}

// Rank a face against every enrolled person, nearest first.
// → [{ personId, similarity }] sorted desc. Empty if no one enrolled.
export function rankMatches(embedding, enrolled) {
  const q = l2normalize(embedding)
  return enrolled
    .map((p) => ({ personId: p.personId, similarity: dot(q, l2normalize(p.centroid)) }))
    .sort((a, b) => b.similarity - a.similarity)
}

// Cosine-similarity threshold for accepting a match. Provisional —
// the on-device spike measures the real same-vs-different separation on
// the kids' faces and we tune this from the numbers. With normalized
// ArcFace/MobileFaceNet embeddings, same-person pairs typically score
// well above different-person pairs; ~0.36 is a reasonable starting
// gate that favors not mislabeling one child as another.
export const DEFAULT_MATCH_THRESHOLD = 0.36

// Decide who a face is. Returns the nearest enrolled person ONLY if it
// clears the threshold, else null ("nobody I recognize"). margin = gap
// to the runner-up (useful for surfacing low-confidence calls in the UI
// and for the "no, that's not me" correction later).
// → { personId, similarity, margin } | null
export function matchToEnrolled(embedding, enrolled, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_MATCH_THRESHOLD
  if (!enrolled || enrolled.length === 0) return null
  const ranked = rankMatches(embedding, enrolled)
  const top = ranked[0]
  if (!top || top.similarity < threshold) return null
  const margin = ranked.length > 1 ? top.similarity - ranked[1].similarity : top.similarity
  return { personId: top.personId, similarity: top.similarity, margin }
}
