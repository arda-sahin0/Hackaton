import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keccak256, toHex } from 'viem';
import { deriveWorkRequestHash, normalizeDoi } from './openalex.ts';

test('the request hash is over the exact string that CitationEscrow.sol builds', () => {
  const expected =
    '["getWork",[["id","doi:10.1038/nature14539"]],' +
    '[["doi","/doi"],["is_retracted","/is_retracted"],["title","/title"]]]';
  assert.equal(deriveWorkRequestHash('10.1038/nature14539'), keccak256(toHex(expected)));
});

test('a DOI in any casing or form gives the same request hash', () => {
  const hash = deriveWorkRequestHash('10.1038/nature14539');
  assert.equal(deriveWorkRequestHash('https://doi.org/10.1038/NATURE14539'), hash);
  assert.equal(deriveWorkRequestHash('doi:10.1038/Nature14539'), hash);
});

test('a DOI that JSON.stringify would escape is rejected', () => {
  assert.throws(() => normalizeDoi('10.1000/a"b'));
  assert.throws(() => normalizeDoi('10.1000/a\\b'));
  assert.throws(() => normalizeDoi('10.1000/a b'));
  assert.throws(() => normalizeDoi('not-a-doi'));
});

test('DOIs with brackets keep them', () => {
  assert.equal(normalizeDoi('10.1016/S0140-6736(20)30367-6'), '10.1016/s0140-6736(20)30367-6');
});
