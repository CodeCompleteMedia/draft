// The answer choices on the three Patiño Google Forms (2026–27). Cards use them to
// explain what each eSkill and trait means. If a form's choices change, update this
// file; answers that aren't listed still show, just without a description.

export const PERIOD_CHOICES = ['1st', '2nd', '5th']

// 16Personalities roles, as listed on the personality form.
export const PERSONALITY_ROLES = {
  INTJ: 'Architect',
  INTP: 'Logician',
  ENTJ: 'Commander',
  ENTP: 'Debater',
  INFJ: 'Advocate',
  INFP: 'Mediator',
  ENFJ: 'Protagonist',
  ENFP: 'Campaigner',
  ISTJ: 'Logistician',
  ISFJ: 'Defender',
  ESTJ: 'Executive',
  ESFJ: 'Consul',
  ISTP: 'Virtuoso',
  ISFP: 'Adventurer',
  ESTP: 'Entrepreneur',
  ESFP: 'Entertainer',
}

// The personality form's wording for a type, e.g. "Architect - (INTJ-A / INTJ-T)".
export function personalityChoice(type) {
  return PERSONALITY_ROLES[type] + ' - (' + type + '-A / ' + type + '-T)'
}

// 16Personalities groups the types into four Roles. Handy for spotting a team that's
// all one kind of thinker.
export const ROLE_GROUP_NAMES = ['Analysts', 'Diplomats', 'Sentinels', 'Explorers']
const ROLE_GROUPS = { NT: 'Analysts', NF: 'Diplomats', SJ: 'Sentinels', SP: 'Explorers' }

export function roleGroup(type) {
  const t = String(type == null ? '' : type).toUpperCase()
  if (!/^[IE][NS][TF][JP]/.test(t)) return null
  return t.charAt(1) === 'N' ? ROLE_GROUPS[t.charAt(1) + t.charAt(2)] : ROLE_GROUPS[t.charAt(1) + t.charAt(3)]
}

export const ESKILLS = [
  { label: 'Analyzing Text', description: 'making assumptions based on text' },
  { label: 'Analyzing Data', description: 'make a decision based on the data' },
  { label: 'Thinking Visually', description: 'able to sketch and draw ideas' },
  { label: 'Experimenting', description: 'learning by doing' },
  { label: 'Prototyping', description: 'developing and testing ideas' },
  { label: 'Feedback', description: 'use information to improve concepts and ideas' },
  { label: 'Reflecting', description: 'able to think back on tasks and assignments' },
  { label: 'Pitching', description: 'able to persuade someone or something' },
  { label: 'Writing', description: 'claim, explain, evidence, analysis' },
  { label: 'Storytelling', description: 'able to paint a picture of your objective with words' },
  { label: 'Working in Teams', description: 'cooperate and collaborate with peers' },
  { label: 'Ideating', description: 'problem solving, unfiltered brainstorming' },
]

export const BUSINESS_TRAITS = [
  { label: 'Leader' },
  { label: 'Planning' },
  { label: 'Organization' },
  { label: 'Research' },
  { label: 'Designing' },
  { label: 'Presenting' },
  { label: 'Ambitious' },
  { label: 'Intentional' },
  { label: 'Responsible' },
  { label: 'Independent' },
  { label: 'Positive' },
  { label: 'Creative' },
  { label: 'Precise' },
  { label: 'Reliable' },
  { label: 'Listening' },
  { label: 'Helpful' },
  { label: 'Outspoken' },
  { label: 'Welcoming' },
  {
    label: 'Improvisation',
    description: 'When you make or doing something not planned ahead of time.',
    choice: 'Improvisation - When you make or doing something not planned ahead of time.',
  },
  { label: 'Persistence', description: 'A person who never gives up.', choice: 'Persistence - A person who never gives up.' },
]

export function describeOption(label) {
  const match = ESKILLS.concat(BUSINESS_TRAITS).filter((option) => option.label === label)[0]
  return match && match.description ? match.description : null
}
