import { BUSINESS_TRAITS, ESKILLS, PERSONALITY_ROLES } from './formOptions.js'

// Fake answers shaped like the unified sheet: the personality capture script's
// "Slider Responses" columns plus the eSkills and Personal Traits forms. Used by
// `npm run dev` and the Sheet's "Add fake students for testing".

export const SAMPLE_HEADER = [
  'First Name',
  'Last Name',
  'Email',
  'Class',
  'Type',
  'Type Code',
  'Identity Letter',
  "Selected Type's Code",
  'Type Match',
  'Energy (as shown)',
  'Mind (as shown)',
  'Nature (as shown)',
  'Tactics (as shown)',
  'Identity (as shown)',
  'Energy 0-100 (0=Extraverted, 100=Introverted)',
  'Mind 0-100 (0=Intuitive, 100=Observant)',
  'Nature 0-100 (0=Thinking, 100=Feeling)',
  'Tactics 0-100 (0=Judging, 100=Prospecting)',
  'Identity 0-100 (0=Assertive, 100=Turbulent)',
  'eSkill #1',
  'eSkill #2',
  'eSkill #3',
  'My First Business Trait',
  'My Second Business Trait',
  'My Third Business Trait',
]

const FIRST = [
  'Maya', 'Jordan', 'Luis', 'Aaliyah', 'Ethan', 'Sofia', 'Dev', 'Hannah', 'Marcus', 'Priya',
  'Caleb', 'Zoe', 'Mateo', 'Imani', 'Noah', 'Lena', 'Omar', 'Grace', 'Diego', 'Ava',
  'Kenji', 'Layla', 'Isaac', 'Nia', 'Ryan', 'Elena', 'Tariq', 'Chloe', 'Andre', 'Mia',
  'Samuel', 'Yara', 'Owen', 'Jasmine', 'Leo', 'Fatima', 'Eli', 'Rosa', 'Theo', 'Keisha',
  'Gabriel', 'Amara', 'Wyatt', 'Lucia', 'Jamal', 'Ruby', 'Adrian', 'Kayla', 'Joaquin', 'Destiny',
  'Benjamin', 'Olivia', 'Xavier', 'Isabella', 'Nathan', 'Camila', 'Darius', 'Emily', 'Julian', 'Samantha',
  'Miles', 'Naomi', 'Christian', 'Valentina', 'Dylan', 'Maya', 'Elijah', 'Bianca', 'Nolan', 'Serena',
  'Malcolm', 'Isabel', 'Landon', 'Kiara', 'Victor', 'Madeline', 'Rafael', 'Sydney', 'Dominic', 'Alana',
  'Trevor', 'Marisol', 'Jaden', 'Carolina', 'Brandon', 'Ariana', 'Cole', 'Vivian', 'Javier', 'Tessa',
  'Marcus', 'Nadia', 'Connor', 'Gabriela', 'Derek', 'Melanie', 'Antonio', 'Kylie', 'Tristan', 'Selena',
]
const LAST = [
  'Rodriguez', 'Nguyen', 'Johnson', 'Hernandez', 'Lee', 'Garcia', 'Vang', 'Martinez', 'Smith', 'Lopez',
  'Xiong', 'Patel', 'Brown', 'Ramirez', 'Thao', 'Kim', 'Davis', 'Flores', 'Chavez', 'Moua',
  'Singh', 'Torres', 'Wilson', 'Cruz', 'Her', 'Gonzalez', 'Jackson', 'Reyes', 'Lor', 'Sanchez',
  'Anderson', 'Bennett', 'Campbell', 'Carter', 'Collins', 'Cooper', 'Edwards', 'Evans', 'Foster', 'Graham',
  'Green', 'Hall', 'Harris', 'Hill', 'Howard', 'Jenkins', 'King', 'Lewis', 'Mitchell', 'Morgan',
  'Morris', 'Nelson', 'Parker', 'Phillips', 'Robinson', 'Scott', 'Stewart', 'Taylor', 'Thomas', 'Walker',
]
const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd' }
const TYPE_LIST = Object.keys(PERSONALITY_ROLES)
// The word shown for each end of the five scales, in header order.
const SIDE_WORDS = [
  ['Extraverted', 'Introverted'],
  ['Intuitive', 'Observant'],
  ['Thinking', 'Feeling'],
  ['Judging', 'Prospecting'],
  ['Assertive', 'Turbulent'],
]
// Which letter each end of the five scales stands for, in header order.
const SCALES = [
  ['E', 'I'],
  ['N', 'S'],
  ['T', 'F'],
  ['J', 'P'],
  ['A', 'T'],
]

// counts: { [period]: numberOfStudents }
export function sampleRows(counts, random) {
  const pick = (list) => list[Math.floor(random() * list.length)]
  const skills = ESKILLS.map((o) => o.label)
  const traits = BUSINESS_TRAITS.map((o) => o.choice || o.label)
  const rows = []
  let n = 0

  Object.keys(counts).forEach((period) => {
    for (let i = 0; i < counts[period]; i++, n++) {
      const first = FIRST[n % FIRST.length]
      const last = LAST[(n * 7) % LAST.length]
      // Scales first, so the type code always agrees with them.
      const values = SCALES.map(() => {
        // 16Personalities never reports 50%: every trait leans one way.
        const percent = 51 + Math.floor(random() * 49)
        return random() < 0.5 ? 100 - percent : percent
      })
      const letters = SCALES.map(([low, high], s) => (values[s] <= 50 ? low : high))
      const type = letters.slice(0, 4).join('')
      // Now and then a student picks a type that doesn't match the sliders they set.
      const picked = random() < 0.12 ? TYPE_LIST[Math.floor(random() * TYPE_LIST.length)] : type
      const asShown = values.map((v, s) => (v <= 50 ? 100 - v : v) + '% ' + SIDE_WORDS[s][v <= 50 ? 0 : 1])
      const answered = [PERSONALITY_ROLES[picked], type + '-' + letters[4], letters[4], picked, picked === type ? 'Yes' : 'No'].concat(
        asShown,
        values,
      )
      // Blanks are counted from the answered row, never written out by hand: a
      // hard-coded width silently goes stale the moment a column is added, and
      // setValues then rejects the whole batch.
      const personality = random() < 0.05 ? new Array(answered.length).fill('') : answered

      rows.push(
        [
          random() < 0.1 ? first.toLowerCase() : first,
          random() < 0.1 ? last.toLowerCase() : last,
          (first + '.' + last + n + '@students.example.org').toLowerCase(),
          ORDINALS[period] || period + 'th',
        ].concat(
          personality,
          // Dropdowns don't stop a student from picking the same answer twice.
          random() < 0.06 ? ['', '', ''] : [pick(skills), pick(skills), pick(skills)],
          random() < 0.06 ? ['', '', ''] : [pick(traits), pick(traits), pick(traits)],
        ),
      )
    }
  })
  return rows
}
