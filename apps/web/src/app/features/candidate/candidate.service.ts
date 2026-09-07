import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  CandidateProfile,
  CandidateReplacement,
  CandidateResponse,
} from './candidate.models';

const candidateUrl = '/api/v1/candidate';

@Injectable({ providedIn: 'root' })
export class CandidateService {
  private readonly httpClient = inject(HttpClient);

  getCandidate(): Observable<CandidateProfile | null> {
    return this.httpClient
      .get<CandidateResponse>(candidateUrl)
      .pipe(map((response) => response.candidate));
  }

  replaceCandidate(candidate: CandidateReplacement): Observable<CandidateProfile> {
    return this.httpClient
      .put<CandidateResponse>(candidateUrl, candidate)
      .pipe(
        map((response) => {
          if (response.candidate === null) {
            throw new Error('Candidate replacement returned an empty response.');
          }

          return response.candidate;
        }),
      );
  }
}
