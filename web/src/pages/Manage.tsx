import { useState } from 'react';
import type { Player, Season } from '../api';
import { PlayersSection } from '../components/PlayersSection';
import { RulesSection } from '../components/RulesSection';
import { SeasonSection } from '../components/SeasonSection';
import { SectionTabs } from '../components/SectionTabs';

const SECTIONS = [
  { key: 'players', label: 'Jugones' },
  { key: 'rules', label: 'Reglas' },
  { key: 'season', label: 'Temporada' },
] as const;

/** Players and season rules, one section at a time. Not the everyday screen — set up and forget. */
export function Manage({
  season,
  seasons,
  players,
  onChanged,
  onSelectSeason,
}: {
  season: Season;
  seasons: Season[];
  players: Player[];
  onChanged: () => void;
  onSelectSeason: (season: Season) => void;
}) {
  const [section, setSection] =
    useState<(typeof SECTIONS)[number]['key']>('players');
  const [error, setError] = useState<string | null>(null);

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      onChanged();
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <SectionTabs
        sections={SECTIONS}
        current={section}
        onChange={key => {
          setSection(key);
          setError(null);
        }}
      />
      {error && <div className="err">{error}</div>}
      {section === 'players' ? (
        <PlayersSection
          season={season}
          players={players}
          guard={guard}
          onChanged={onChanged}
        />
      ) : section === 'rules' ? (
        <RulesSection season={season} guard={guard} />
      ) : (
        <SeasonSection
          season={season}
          seasons={seasons}
          guard={guard}
          onSelectSeason={onSelectSeason}
        />
      )}
    </>
  );
}
