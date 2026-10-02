import { cueLanguage, isNoveltyVoice, normaliseLanguage, pickVoice, voicesForLanguage, voiceTier, type VoiceInfo } from '../voices';

const v = (identifier: string, name: string, language: string, quality = 'Default'): VoiceInfo => ({ identifier, name, language, quality });

const IOS: VoiceInfo[] = [
  v('com.apple.speech.synthesis.voice.Zarvox', 'Zarvox', 'en-US'),
  v('com.apple.eloquence.en-US.Rocko', 'Rocko', 'en-US'),
  v('com.apple.voice.compact.en-US.Samantha', 'Samantha', 'en-US'),
  v('com.apple.voice.compact.en-GB.Daniel', 'Daniel', 'en-GB'),
  v('com.apple.ttsbundle.siri_Martha_en-GB_compact', 'Martha', 'en-GB'),
  v('com.apple.voice.enhanced.en-US.Evan', 'Evan (Enhanced)', 'en-US', 'Enhanced'),
  v('com.apple.voice.compact.fr-FR.Thomas', 'Thomas', 'fr-FR'),
];

describe('voices', () => {
  it('ranks voice quality from what the platform reports', () => {
    expect(voiceTier(v('com.apple.voice.premium.en-GB.Malcolm', 'Malcolm', 'en-GB'))).toBe('Premium');
    expect(voiceTier(v('Microsoft Aria Online (Natural) - English (United States)', 'Microsoft Aria Online (Natural)', 'en-US'))).toBe('Premium');
    expect(voiceTier(IOS[5])).toBe('Enhanced');
    expect(voiceTier(IOS[4])).toBe('Siri');
    expect(voiceTier(IOS[2])).toBe('Standard');
  });

  it('spots the novelty voices', () => {
    expect(isNoveltyVoice(IOS[0])).toBe(true);
    expect(isNoveltyVoice(IOS[1])).toBe(true);
    expect(isNoveltyVoice(IOS[2])).toBe(false);
  });

  it('prefers Premium/Enhanced, then Siri, then the default, never a novelty voice', () => {
    expect(pickVoice(IOS, 'en-GB')?.name).toBe('Evan (Enhanced)');
    const noEnhanced = IOS.filter((x) => x.quality !== 'Enhanced');
    expect(pickVoice(noEnhanced, 'en-GB')?.name).toBe('Martha');
    // Same tier: the device's own accent wins.
    expect(pickVoice(noEnhanced.filter((x) => !x.identifier.includes('siri')), 'en-GB')?.name).toBe('Daniel');
    expect(pickVoice([IOS[0], IOS[1]], 'en-US')).toBeNull();
    expect(pickVoice([], 'en-US')).toBeNull();
    // Android: a local voice beats one that needs a network connection.
    const android = [v('en-us-x-iol-network', 'en-us-x-iol-network', 'en-US', 'Enhanced'), v('en-us-x-iol-local', 'en-us-x-iol-local', 'en-US', 'Enhanced')];
    expect(pickVoice(android, 'en-US')?.identifier).toBe('en-us-x-iol-local');
  });

  it('lists every accent of the language, best first', () => {
    const names = voicesForLanguage(IOS, 'en-US').map((x) => x.name);
    expect(names).toEqual(['Evan (Enhanced)', 'Martha', 'Samantha', 'Daniel']);
  });

  it('speaks English cues in the device accent, or US English otherwise', () => {
    expect(normaliseLanguage('en_gb')).toBe('en-GB');
    expect(cueLanguage('en-AU')).toBe('en-AU');
    expect(cueLanguage('en')).toBe('en-US');
    expect(cueLanguage('fr-FR')).toBe('en-US');
    expect(cueLanguage(undefined)).toBe('en-US');
  });
});
