import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Vérifie si un jeton est présent
  if (authService.isLoggedIn()) {
    return true;
  }

  // Redirige vers la page de connexion si aucun jeton
  return router.parseUrl('/auth/login');
};
