import { Routes } from '@angular/router';

export const CANDIDATE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./candidate-page/candidate-page').then(
        (module) => module.CandidatePage,
      ),
    title: 'Candidate profile | Job Hunting AI',
  },
];
