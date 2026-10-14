import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError, switchMap } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  let requestToForward = req;

  // Ajoute l'entête Authorization pour les requêtes API (sauf la récupération du token vers Keycloak et l'upload de CV local)
  if (token && !req.url.includes('/protocol/openid-connect/token') && !req.url.includes('/api/v1/cv/')) {
    requestToForward = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  return next(requestToForward).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && authService.getRefreshToken() && !req.url.includes('/protocol/openid-connect/token')) {
        return authService.refreshToken().pipe(
          switchMap((newTokenResponse: any) => {
             const newToken = newTokenResponse.access_token;
             const newReq = req.clone({
               headers: req.headers.set('Authorization', `Bearer ${newToken}`)
             });
             return next(newReq);
          }),
          catchError((refreshErr) => {
             authService.logout();
             return throwError(() => refreshErr);
          })
        );
      } else if (error.status === 401) {
        // Le token a expiré ou est invalide et impossible de rafraîchir
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
