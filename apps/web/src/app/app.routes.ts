import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'applications',
    loadChildren: () =>
      import('./features/application/application.routes').then(
        (module) => module.APPLICATION_ROUTES,
      ),
  },
  {
    path: 'candidate',
    loadChildren: () =>
      import('./features/candidate/candidate.routes').then(
        (module) => module.CANDIDATE_ROUTES,
      ),
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'candidate',
  },
];
