/** A row of sections, one of which is showing. Knows nothing of what they hold. */
export function SectionTabs<K extends string>({
  sections,
  current,
  onChange,
}: {
  sections: readonly { key: K; label: string }[];
  current: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="chips section-tabs" role="tablist">
      {sections.map(s => (
        <button
          key={s.key}
          role="tab"
          aria-selected={s.key === current}
          className="chip"
          data-on={s.key === current}
          onClick={() => onChange(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
