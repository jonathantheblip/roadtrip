// YouTube data for the Media tab. Channel URLs (https://www.youtube.com/@…)
// hand off to the YouTube app on iOS via Universal Links. Search URLs open
// in Safari and the app typically intercepts those too when installed.

const YT_SEARCH = (q) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
const YT_CHANNEL = (handle) => `https://www.youtube.com/${handle}`
const YT_VIDEOS = (handle) => `https://www.youtube.com/${handle}/videos`

export const YOUTUBE_RAFA = {
  title: 'WATCH ON THE ROAD \uD83E\uDD96\uD83D\uDD77\uD83D\uDD25',
  categories: [
    {
      title: 'MONSTER FIGHTS \uD83D\uDD25',
      items: [
        { label: 'Godzilla vs King Ghidorah', url: YT_SEARCH('Godzilla vs King Ghidorah fight scenes') },
        { label: 'MonsterVerse Fights', url: YT_SEARCH('MonsterVerse fight compilation') },
        { label: 'Godzilla vs Kong', url: YT_SEARCH('Godzilla vs Kong best scenes') },
      ],
      note: 'Rafa likes the parts where Godzilla is fighting. Fast-forward available.',
    },
    {
      title: 'SIZE COMPARISONS \uD83D\uDCCF',
      items: [
        { label: 'Dinosaur Sizes', url: YT_SEARCH('dinosaur size comparison 3D') },
        { label: 'Planet Gravity', url: YT_SEARCH('planet gravity comparison') },
        { label: 'Animal Speed', url: YT_SEARCH('animal speed comparison') },
        { label: 'Biggest Things', url: YT_SEARCH('biggest things in the universe comparison') },
      ],
    },
    {
      title: 'SPIDER-VERSE \uD83D\uDD77',
      items: [
        { label: 'Into the Spider-Verse Clips', url: YT_SEARCH('Into the Spider-Verse clips') },
        { label: 'Tom Holland Spider-Man', url: YT_SEARCH('Tom Holland Spider-Man scenes') },
        { label: 'Spidey & His Amazing Friends', url: YT_SEARCH('Spidey and His Amazing Friends') },
      ],
    },
    {
      title: 'FAVORITE CHANNELS \u26A1',
      items: [
        { label: '@GrayStillPlays', url: YT_CHANNEL('@GrayStillPlays') },
        { label: '@BeckBroJack', url: YT_CHANNEL('@BeckBroJack') },
        { label: 'Fast Friends (Sonic \u00b7 Knuckles)', url: YT_SEARCH('Fast Friends Sonic Knuckles reaction') },
        { label: '@CrazyFrogOfficial', url: YT_CHANNEL('@CrazyFrogOfficial') },
        { label: '@LeonPicaron', url: YT_CHANNEL('@LeonPicaron') },
        { label: 'Survival Stickman', url: YT_SEARCH('Survival Stickman') },
        { label: 'KLT Space', url: YT_SEARCH('KLT space channel') },
      ],
    },
    {
      title: 'SPACE STUFF FOR AXIOM \uD83D\uDE80',
      items: [
        { label: '@AxiomSpace', url: YT_CHANNEL('@AxiomSpace') },
        { label: 'Axiom Mission 4', url: YT_SEARCH('Axiom Mission 4 launch highlights') },
        { label: 'ISS Live Feed', url: YT_SEARCH('ISS live stream') },
        { label: 'Spacewalk Compilation', url: YT_SEARCH('ISS spacewalk compilation') },
        { label: 'How Astronauts Eat & Sleep', url: YT_SEARCH('how do astronauts eat sleep in space') },
      ],
      note: "Watch a couple of these before the Axiom tour with Uncle Chris so you know what you\u2019re looking at.",
    },
  ],
}

export const YOUTUBE_AURELIA = {
  title: 'watch list \u2728',
  categories: [
    {
      title: 'faves \uD83C\uDF80',
      items: [
        { label: '@MiaMaples', url: YT_CHANNEL('@MiaMaples') },
        { label: '@MoriahElizabeth', url: YT_CHANNEL('@MoriahElizabeth') },
        { label: '@HangwithHope', url: YT_CHANNEL('@HangwithHope') },
        { label: '@hopescope', url: YT_CHANNEL('@hopescope') },
        { label: '@SerenaNeel', url: YT_CHANNEL('@SerenaNeel') },
      ],
    },
    {
      title: 'for the drive \uD83C\uDFA7',
      items: [
        { label: 'Mia Maples \u2014 latest', url: YT_VIDEOS('@MiaMaples') },
        { label: 'Moriah Elizabeth \u2014 latest', url: YT_VIDEOS('@MoriahElizabeth') },
        { label: 'Hang with Hope \u2014 latest', url: YT_VIDEOS('@HangwithHope') },
        { label: 'HopeScope \u2014 latest', url: YT_VIDEOS('@hopescope') },
        { label: 'Serena Neel \u2014 latest', url: YT_VIDEOS('@SerenaNeel') },
      ],
      note: "Channel pages sorted by latest \u2014 pick whatever\u2019s new when boredom hits.",
    },
    {
      title: 'the hills \uD83D\uDCFA',
      items: [
        { label: 'The Hills on YouTube', url: YT_SEARCH('The Hills full episodes') },
      ],
    },
  ],
}
