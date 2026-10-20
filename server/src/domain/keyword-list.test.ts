import { describe, expect, it } from 'vitest';
import { KeywordList } from './keyword-list.js';

describe('KeywordList', () => {
  it('finds a word ignoring accents and case', () => {
    const list = new KeywordList(['fútbol']);
    expect(list.find('futbol')).toBe('fútbol');
    expect(list.find('FÚTBOL miércoles')).toBe('fútbol');
    expect(list.find('Futbol, miércoles')).toBe('fútbol');
  });

  it('finds a listed word written without the accent in the subject, and the reverse', () => {
    expect(new KeywordList(['futbol']).find('Fútbol')).toBe('futbol');
  });

  it('matches only whole words', () => {
    const list = new KeywordList(['cena']);
    expect(list.find('cena')).toBe('cena');
    expect(list.find('la cena de hoy')).toBe('cena');
    expect(list.find('escena')).toBeNull();
    expect(list.find('cenar')).toBeNull();
    expect(list.find('cena2')).toBeNull();
  });

  it('matches a phrase as a phrase, whatever the spacing', () => {
    const list = new KeywordList(['partido de']);
    expect(list.find('partido de la pachanga')).toBe('partido de');
    expect(list.find('partido  de ayer')).toBe('partido de');
    expect(list.find('partidos de ayer')).toBeNull();
    expect(list.find('partido')).toBeNull();
  });

  it('answers the first listed word found', () => {
    const list = new KeywordList(['pachanga', 'futbol']);
    expect(list.find('futbol y pachanga')).toBe('pachanga');
  });

  it('finds nothing in an empty subject', () => {
    const list = new KeywordList(['cena']);
    expect(list.find(null)).toBeNull();
    expect(list.find('')).toBeNull();
  });

  it('ignores empty words', () => {
    const list = new KeywordList(['', '  ']);
    expect(list.find('cena')).toBeNull();
    expect(list.find('')).toBeNull();
  });

  it('is not thrown by the characters of a regular expression in a word', () => {
    expect(new KeywordList(['c++']).find('curso de c++ hoy')).toBe('c++');
  });
});
