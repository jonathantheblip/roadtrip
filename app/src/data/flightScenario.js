// Friday Apr 24 return-flight scenario flag.
//
// 'b6932' — currently booked JetBlue B6 932, 1:17 PM CDT. Pack-and-go morning.
// 'ua592' — proposed United UA 592, 4:52 PM CDT. Full Rothko + Menil morning.
//
// Default to 'b6932' until Jonathan confirms the UA 592 swap is booked.
// Flip this single export to activate the other scenario across all views.

export const FLIGHT_SCENARIO = 'b6932'

export const FLIGHT_SCENARIOS = {
  b6932: {
    airline: 'JetBlue',
    code: 'B6 932',
    depart: '1:17 PM CDT',
    arrive: '5:58 PM EDT',
    label: 'B6 932 · IAH → BOS · 1:17 PM',
  },
  ua592: {
    airline: 'United',
    code: 'UA 592',
    depart: '4:52 PM CDT',
    arrive: '9:46 PM EDT',
    label: 'UA 592 · IAH → BOS · 4:52 PM',
  },
}

export const activeFlight = () => FLIGHT_SCENARIOS[FLIGHT_SCENARIO]
