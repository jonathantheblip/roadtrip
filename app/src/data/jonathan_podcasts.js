// Jonathan's general listening queue — not route-matched, not tied to
// specific stops. Shows in Jonathan's Media tab only. Ported from
// Jonathan_Podcast_Queue.md. All links point to Overcast feeds.
//
// Organized into the same categories Jonathan gave me so the page
// reads the way his text file reads.

export const JONATHAN_QUEUE = {
  eyebrow: 'Listen',
  title: 'Podcast queue',
  lede:
    'General listening queue for the road trip and beyond. Not tied to route locations \u2014 these are just good shows. All links open in Overcast.',
  sections: [
    {
      key: 'retry',
      title: 'Currently listening / retry',
      items: [
        {
          show: 'The Silt Verses',
          url: 'https://overcast.fm/itunes1547222295',
          pitch:
            'Commercialized gods, outlawed river worship, and the most inventive mythology in audio drama. Retry from ep 1.',
        },
        {
          show: 'Stellar Firma',
          url: 'https://overcast.fm/itunes1451762036',
          pitch:
            'Semi-improvised sci-fi comedy from the Magnus Archives team \u2014 incompetent planet designer plus desperate clone assistant. Retry from ep 1.',
        },
      ],
    },
    {
      key: 'format_forward',
      title: 'New queue — format-forward picks',
      subtitle: 'start here',
      items: [
        {
          show: 'Within the Wires',
          url: 'https://overcast.fm/itunes1121391184',
          pitch:
            'Each season is a different found-audio format (relaxation tapes, museum guides, voicemails) from an alternate dystopia. Night Vale co-creator. Give it 3 eps.',
        },
        {
          show: 'SAYER',
          url: 'https://overcast.fm/itunes831100527',
          pitch:
            'A corporate AI on a moon base addresses YOU in second person. The format is the horror. Give it 2\u20133 eps.',
        },
        {
          show: 'Dreamboy',
          url: 'https://overcast.fm/itunes1437904233',
          pitch:
            'Musical surrealist audio drama where inner thoughts become original songs. Cosmic horror + queer romance. Only 8 episodes. NSFW. Give it 2 eps.',
        },
        {
          show: 'Kakos Industries',
          url: 'https://overcast.fm/itunes823315247',
          pitch:
            "Evil megacorp shareholder announcements. Night Vale's format crossed with Venture Brothers' tone. Give it 2\u20133 eps.",
        },
        {
          show: 'Death by Dying',
          url: 'https://overcast.fm/itunes1437812269',
          pitch:
            'Every episode is an obituary for the fictional town of Crestfall, Idaho. Dark comedy mystery told backward from confirmed deaths. Give it 2\u20133 eps.',
        },
        {
          show: 'Camp Here & There',
          url: 'https://overcast.fm/itunes1566268240',
          pitch:
            'Summer camp PA announcements that cheerfully cover meal schedules and supernatural terrors in the same breath. Will Wood soundtrack. Give it 3\u20134 eps.',
        },
        {
          show: 'Moonbase Theta, Out',
          url: 'https://overcast.fm/itunes1439047722',
          pitch:
            'Five-minute weekly reports from the last guy on a decommissioning moonbase. Micro-format, massive emotional compression. Give it 5 eps (25 min total).',
        },
      ],
    },
    {
      key: 'anthologies',
      title: 'New queue — anthologies',
      subtitle: 'for The Program fans',
      items: [
        {
          show: 'The Truth',
          url: 'https://overcast.fm/itunes502304410',
          pitch:
            'Gold standard standalone fiction anthology. Movies for your ears. Pick any well-rated episode. Give it 1\u20133 eps.',
        },
        {
          show: 'Zero Hours',
          url: 'https://overcast.fm/itunes1483241955',
          pitch:
            'Seven standalone end-of-the-world stories set 99 years apart. From the Wolf 359 team. Only 7 episodes. Give it 1\u20132 eps.',
        },
        {
          show: 'Knifepoint Horror',
          url: 'https://overcast.fm/itunes406250030',
          pitch:
            "Radical minimalist horror. One narrator, no music, no effects. Start with \u201cstaircase\u201d or \u201cpenpal.\u201d Give it 1 ep.",
        },
      ],
    },
    {
      key: 'completed',
      title: 'New queue — completed narratives',
      items: [
        {
          show: 'Steal the Stars',
          url: 'https://overcast.fm/itunes1259505930',
          pitch:
            'Noir sci-fi heist in first person. Security chief plans to steal a crashed alien body from her own facility. 14 episodes. Give it 2\u20133 eps.',
        },
        {
          show: 'The Hyacinth Disaster',
          url: 'https://overcast.fm/itunes1321203327',
          pitch:
            'Black box recordings from a doomed mining vessel. Seven episodes, devastating. Give it 1\u20132 eps.',
        },
      ],
    },
    {
      key: 'literary',
      title: 'New queue — literary / slow burn',
      items: [
        {
          show: 'Mabel',
          url: 'https://overcast.fm/itunes1160860118',
          pitch:
            'Voicemails from a home health aide that crack open into folklore horror and a love story. Poetic, deliberately opaque. Give it 3\u20134 eps.',
        },
        {
          show: 'Palimpsest',
          url: 'https://overcast.fm/itunes1288069795',
          pitch:
            'Audio journal literary horror. Each season is a self-contained arc in a different setting. Elegant prose, psychological terror. Give it 2\u20133 eps.',
        },
      ],
    },
    {
      key: 'long_shot',
      title: 'New queue — long shot',
      items: [
        {
          show: 'WOE.BEGONE',
          url: 'https://overcast.fm/itunes1542792309',
          pitch:
            'Podcast-within-a-podcast about a violent online ARG involving time travel. Unique original score every episode. Answers questions instead of vamping, but 235+ episodes deep. Give it 3\u20135 eps.',
        },
      ],
    },
    {
      key: 'previously_recommended',
      title: 'Previously recommended, not yet tried',
      items: [
        {
          show: 'Ars Paradoxica',
          url: 'https://overcast.fm/itunes1006173000',
          pitch:
            'Physicist thrown back to 1940s America; time travel as both physics problem and political weapon. Completed, 3 seasons. Give it 3 eps.',
        },
        {
          show: 'I Am In Eskew',
          url: 'https://overcast.fm/itunes1339770338',
          pitch:
            'Man trapped in a nightmarish, impossible city records everything. From the Silt Verses creators. 25 episodes, no filler. Give it 2 eps.',
        },
      ],
    },
  ],
}
