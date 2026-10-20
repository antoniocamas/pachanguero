import { useState, type ReactNode } from 'react';
import type { Player, Season } from '../api';
import { PlayersSection } from '../components/PlayersSection';
import { RulesSection } from '../components/RulesSection';
import { SeasonSection } from '../components/SeasonSection';
import { SectionTabs } from '../components/SectionTabs';

const SECTIONS = [
  { key: 'players', label: 'Jugones' },
  { key: 'rules', label: 'Reglas' },
  { key: 'season', label: 'Temporada' },
  { key: 'account', label: 'Mi cuenta' },
  { key: 'bank', label: 'Banco' },
] as const;

export type ManageSection = (typeof SECTIONS)[number]['key'];

/** Players and season rules, one section at a time. Not the everyday screen — set up and forget. */
export function Manage({
  season,
  seasons,
  players,
  onChanged,
  onSelectSeason,
  account,
  bank,
  section,
  onSection,
}: {
  season: Season;
  seasons: Season[];
  players: Player[];
  onChanged: () => void;
  onSelectSeason: (season: Season) => void;
  /** The signed-in user's own account settings; Manage knows nothing of users. */
  account: ReactNode;
  /** The bank access panel; Manage knows nothing of the bank. */
  bank: ReactNode;
  /** Controlled, so the banner and the bank's redirect can open a section from outside. */
  section: ManageSection;
  onSection: (section: ManageSection) => void;
}) {
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
          onSection(key);
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
      ) : section === 'account' ? (
        account
      ) : section === 'bank' ? (
        bank
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
