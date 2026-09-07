import { Routes } from '@angular/router';

export const APPLICATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./application-list/application-list').then(
        (module) => module.ApplicationList,
      ),
    title: 'Applications | Job Hunting AI',
  },
  {
    path: 'new',
    loadComponent: () =>
      import('./application-detail/application-detail').then(
        (module) => module.ApplicationDetail,
      ),
    title: 'New application | Job Hunting AI',
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./application-detail/application-detail').then(
        (module) => module.ApplicationDetail,
      ),
    title: 'Application | Job Hunting AI',
  },
];
