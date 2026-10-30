import type { Address } from 'viem';
import { type AirnodeV2Request, deriveRequestHash, fetchSignedResponse } from './airnode-v2.ts';

export const OPENALEX_AIRNODE_V2_URL = 'https://airnode-openalex.fly.dev/';

// The address that the OpenAlex Airnode v2 signs with, from the x-airnode extension of the document at its URL.
export const OPENALEX_AIRNODE_V2_ADDRESS: Address = '0xc5E9B3263ac154d7694Db5F3894997DaaB4F464c';

// "Deep learning" (LeCun, Bengio, Hinton, 2015). Not retracted.
export const DEFAULT_DOI = '10.1038/nature14539';

// The Airnode passes id into the URL path /works/{id} and rejects an empty part between slashes, so the
// https://doi.org/ form that its docs show answers 400. OpenAlex resolves doi:<doi> to the same work.
const DOI_ID_PREFIX = 'doi:';

// getWork answers with the whole work, and the projection cuts it down to
// {"doi":"https://doi.org/...","is_retracted":false,"title":"..."}. CitationEscrow.sol builds the same request hash.
const WORK_PROJECTION = { doi: '/doi', is_retracted: '/is_retracted', title: '/title' };

// Takes a bare DOI or a https://doi.org/ URL and returns the bare DOI in lowercase. OpenAlex signs DOIs in lowercase and
// DOIs ignore case, so one casing keeps the request hash the same for the same work. JSON.stringify would escape " and
// \ and the contract does not, so the DOI may only hold printable ASCII without them.
export const normalizeDoi = (input: string) => {
  const doi = input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .toLowerCase();
  if (!/^10\.\d{4,9}\/[\x21\x23-\x5b\x5d-\x7e]+$/.test(doi)) {
    throw new Error(`${input} is not a DOI of printable ASCII without " or \\`);
  }
  return doi;
};

export const buildWorkRequest = (doi: string): AirnodeV2Request => ({
  operation: 'getWork',
  parameters: { id: `${DOI_ID_PREFIX}${normalizeDoi(doi)}` },
  responseProjection: WORK_PROJECTION,
});

export const deriveWorkRequestHash = (doi: string) => deriveRequestHash(buildWorkRequest(doi));

export const fetchSignedWork = (doi: string, fetchFunction: typeof fetch = fetch) =>
  fetchSignedResponse(OPENALEX_AIRNODE_V2_URL, buildWorkRequest(doi), fetchFunction);

export interface SignedWork {
  doi: string;
  is_retracted: boolean;
  title: string;
}
