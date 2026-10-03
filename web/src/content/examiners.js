// Stock 2D examiner designs. In the admin panel an admin picks one of these, changes the name, colours,
// voice and language, and publishes it; students then choose from the published characters.

export const DEFAULT_LOOK = {
  name: 'Dr. Mentor', gender: 'male', skinTone: '#efc29a', hairColor: '#c9cfd2', hairStyle: 'short',
  outfitColor: '#127a53', accentColor: '#c39a3c', glasses: true, facialHair: true,
};

export const STOCK_EXAMINERS = [
  { preset: 'mentor', label: 'Senior professor', ...DEFAULT_LOOK },
  { preset: 'lecturer-m', label: 'Young lecturer', name: 'Mr. Perera', gender: 'male', skinTone: '#c68863', hairColor: '#1f1a17', hairStyle: 'side', outfitColor: '#1f3f6b', accentColor: '#c9a15a', glasses: false, facialHair: false },
  { preset: 'industry-m', label: 'Industry expert', name: 'Mr. Silva', gender: 'male', skinTone: '#8d5a3b', hairColor: '#111111', hairStyle: 'bald', outfitColor: '#33363b', accentColor: '#b5832f', glasses: true, facialHair: true },
  { preset: 'curly-m', label: 'Friendly tutor', name: 'Dr. Fernando', gender: 'male', skinTone: '#d9a07a', hairColor: '#3a2618', hairStyle: 'curly', outfitColor: '#5b4a8a', accentColor: '#f2c77a', glasses: false, facialHair: false },
  { preset: 'professor-f', label: 'Senior professor', name: 'Prof. Jayasinghe', gender: 'female', skinTone: '#c98b64', hairColor: '#2b2b2b', hairStyle: 'bun', outfitColor: '#7a2f3d', accentColor: '#d8b25c', glasses: true, facialHair: false },
  { preset: 'lecturer-f', label: 'Young lecturer', name: 'Ms. Dias', gender: 'female', skinTone: '#e2ab84', hairColor: '#20160f', hairStyle: 'long', outfitColor: '#1f6f7f', accentColor: '#f2c77a', glasses: false, facialHair: false },
  { preset: 'industry-f', label: 'Industry expert', name: 'Dr. Wickrama', gender: 'female', skinTone: '#9c6644', hairColor: '#4a2c1d', hairStyle: 'curly', outfitColor: '#2b4467', accentColor: '#c39a3c', glasses: true, facialHair: false },
  { preset: 'tutor-f', label: 'Friendly tutor', name: 'Ms. Kumari', gender: 'female', skinTone: '#f0c7a4', hairColor: '#6b4428', hairStyle: 'long', outfitColor: '#3d7a52', accentColor: '#e8c37a', glasses: true, facialHair: false },
];

export const LANGUAGES = [
  ['en-GB', 'English (British)'],
  ['en-US', 'English (American)'],
  ['en-IN', 'English (South Asian)'],
];

/** Accents students can pick for the microphone (speech recognition). */
export const ACCENTS = [
  ['en-US', 'English (American)'],
  ['en-GB', 'English (British)'],
  ['en-IN', 'English (Indian / Sri Lankan)'],
  ['en-AU', 'English (Australian)'],
];

/** A character from the API as the `look` the Examiner component draws. */
export const lookOf = c => (c ? {
  name: c.name, gender: c.gender, skinTone: c.skinTone, hairColor: c.hairColor, hairStyle: c.hairStyle,
  outfitColor: c.outfitColor, accentColor: c.accentColor, glasses: c.glasses, facialHair: c.facialHair,
} : DEFAULT_LOOK);
