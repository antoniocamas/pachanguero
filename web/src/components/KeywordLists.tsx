import { useState } from 'react';
import { withWord, withoutWord } from '../lib/bankPanel';

/** The two lists of words in a Bizum's subject: those that keep it and those that discard it. */
export function KeywordLists({
  include,
  exclude,
  busy,
  onChange,
}: {
  include: string[];
  exclude: string[];
  busy: boolean;
  onChange: (include: string[], exclude: string[]) => void;
}) {
  return (
    <div className="card" data-testid="bank-words">
      <h2>Palabras</h2>
      <div className="bank-body">
        <WordList
          title="Palabras que mantienen un Bizum en la lista"
          words={include}
          busy={busy}
          onChange={words => onChange(words, exclude)}
        />
        <WordList
          title="Palabras que descartan un Bizum"
          words={exclude}
          busy={busy}
          onChange={words => onChange(include, words)}
        />
        <p className="muted">
          Un Bizum descartado no se guarda y no se puede recuperar. Cambiar las
          listas no afecta a los Bizums ya procesados.
        </p>
      </div>
    </div>
  );
}

function WordList({
  title,
  words,
  busy,
  onChange,
}: {
  title: string;
  words: string[];
  busy: boolean;
  onChange: (words: string[]) => void;
}) {
  const [word, setWord] = useState('');
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      <div className="chips wrap">
        {words.map(each => (
          <span className="chip" key={each}>
            {each}
            <button
              className="btn link"
              aria-label={`Quitar ${each}`}
              disabled={busy}
              onClick={() => onChange(withoutWord(words, each))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="setting">
        <input
          aria-label={`Añadir a: ${title}`}
          value={word}
          onChange={e => setWord(e.target.value)}
        />
        <button
          className="btn"
          disabled={busy || word.trim() === ''}
          onClick={() => {
            onChange(withWord(words, word));
            setWord('');
          }}
        >
          Añadir
        </button>
      </div>
    </section>
  );
}
