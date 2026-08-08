/**
 * Counted nouns, so status lines and buttons never read "1 nodes". Irregular
 * plurals take the third argument; everything else gets an "s".
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
