// Thursday Apr 23 drive-box + bail options.
// Extracted so both FilteredList (single-day filter) and DaySection
// (day-by-day view) render the same schedule summary and pivots.

export function ThursdayDriveBox() {
  return (
    <>
      <div className="drive-box">
        <strong>⚠️ Thursday compressed:</strong> Donna farewell dinner was
        moved to Tuesday night. No Donna breakfast Thursday. Axiom rules:
        closed-toe shoes; NO phones, iPads, or cameras inside — everything
        gets checked at reception.
        <br />
        <strong>7:00am:</strong> Depart Arlington (I-45 South). Car packed
        the night before.
        <br />
        <strong>~9:30am:</strong> Buc-ee&rsquo;s Madisonville — bathroom only
        (15 min max).
        <br />
        <strong>~11:30am:</strong> Arrive Montrose. Park at Menil lot (free).
        Bags stay in trunk.
        <br />
        <strong>12:00pm:</strong> Rothko Chapel (45 min) — Helen&rsquo;s
        pilgrimage, non-negotiable.
        <br />
        <strong>1:00pm:</strong> Menil Collection main building (75 min) —
        flexible; can compress to 60 min if running late.
        <br />
        <strong>2:15pm:</strong> Depart Montrose → Axiom Clear Lake (45 min).
        <br />
        <strong>3:00pm:</strong> Axiom EVA tour with Chris (~45&ndash;60 min).
        <br />
        <strong>~4:40pm:</strong> Rice University campus walk
        (Aurelia&rsquo;s request).
        <br />
        <strong>6:15pm:</strong> Dinner at Hugo&rsquo;s (14-item veg menu)
        — straight from Rice.
        <br />
        <strong>~8:30pm:</strong> Check into 1301 Marshall St, Houston.
      </div>
      <details className="bail-options">
        <summary>Bail options for Thursday</summary>
        <ul>
          <li>
            <strong>Running late out of Arlington (&gt; 7:30 AM):</strong> Drop
            the bathroom stop, drive through lunch, push art window to
            12:30–2:15 (cut Menil to 60 min, keep Rothko full).
          </li>
          <li>
            <strong>Rafa meltdown on the drive:</strong> Extend
            Buc-ee&rsquo;s, accept 15–30 min loss of art. Rothko is
            non-negotiable, Menil is flexible.
          </li>
          <li>
            <strong>Menil parking blocked:</strong> Street parking on Sul Ross
            or Branard (2-block walk).
          </li>
          <li>
            <strong>Axiom runs past 4 PM:</strong> Cut Rice campus walk,
            straight to Hugo&rsquo;s. Flag as last resort — Aurelia&rsquo;s
            Rice request is tagged non-negotiable.
          </li>
        </ul>
      </details>
    </>
  )
}
