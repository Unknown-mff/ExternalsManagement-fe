import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Les rôles autorisés pour cette route, définis dans `data: { roles: [...] }`
  const allowedRoles = route.data?.['roles'] as string[];
  const userRoles = authService.getUserRoles();

  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = userRoles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      // Rediriger vers le tableau de bord si le rôle n'est pas autorisé
      return router.parseUrl('/dashboard');
    }
  }

  return true;
};
