import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, throwError } from 'rxjs';

export interface KeycloakTokenPayload {
  sub: string;
  preferred_username: string;
  email: string;
  given_name: string;
  family_name: string;
  realm_access: { roles: string[] };
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly KEYCLOAK_URL = 'http://localhost:9090';
  readonly REALM = 'externals-management';
  readonly CLIENT_ID = 'cv-management-frontend';

  private get tokenUrl(): string {
    return `${this.KEYCLOAK_URL}/realms/${this.REALM}/protocol/openid-connect/token`;
  }

  private get logoutUrl(): string {
    return `${this.KEYCLOAK_URL}/realms/${this.REALM}/protocol/openid-connect/logout`;
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  login(username: string, password: string): Observable<any> {
    const body = new URLSearchParams();
    body.set('client_id', this.CLIENT_ID);
    body.set('username', username);
    body.set('password', password);
    body.set('grant_type', 'password');

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    return this.http.post(this.tokenUrl, body.toString(), { headers }).pipe(
      tap((response: any) => {
        if (response && response.access_token) {
          this.saveToken(response.access_token);
          if (response.refresh_token) {
            sessionStorage.setItem('refresh_token', response.refresh_token);
          }
        }
      })
    );
  }

  refreshToken(): Observable<any> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return throwError(() => new Error('No refresh token'));

    const body = new URLSearchParams();
    body.set('client_id', this.CLIENT_ID);
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);

    const headers = new HttpHeaders({
      'Content-Type': 'application/x-www-form-urlencoded'
    });

    return this.http.post(this.tokenUrl, body.toString(), { headers }).pipe(
      tap((response: any) => {
        if (response && response.access_token) {
          this.saveToken(response.access_token);
          if (response.refresh_token) {
            sessionStorage.setItem('refresh_token', response.refresh_token);
          }
        }
      })
    );
  }

  // ─── Token Storage ────────────────────────────────────────────────────────────

  saveToken(token: string): void {
    sessionStorage.setItem('access_token', token);
  }

  getToken(): string | null {
    return sessionStorage.getItem('access_token');
  }

  getRefreshToken(): string | null {
    return sessionStorage.getItem('refresh_token');
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

  logout(): void {
    const refreshToken = this.getRefreshToken();

    if (refreshToken) {
      // Révocation côté Keycloak
      const body = new URLSearchParams();
      body.set('client_id', this.CLIENT_ID);
      body.set('refresh_token', refreshToken);

      const headers = new HttpHeaders({
        'Content-Type': 'application/x-www-form-urlencoded'
      });

      this.http.post(this.logoutUrl, body.toString(), { headers }).subscribe({
        next: () => this.clearSessionAndRedirect(),
        error: () => this.clearSessionAndRedirect() // On nettoie quand même
      });
    } else {
      this.clearSessionAndRedirect();
    }
  }

  private clearSessionAndRedirect(): void {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    this.router.navigate(['/auth/login']);
  }

  // ─── Decoded Token ────────────────────────────────────────────────────────────

  getDecodedToken(): KeycloakTokenPayload | null {
    const token = this.getToken();
    if (!token) return null;

    try {
      const payload = token.split('.')[1];
      return JSON.parse(atob(payload)) as KeycloakTokenPayload;
    } catch (e) {
      console.error('Erreur lors du décodage du token Keycloak', e);
      return null;
    }
  }

  getCurrentUser(): { sub: string; username: string; email: string; firstName: string; lastName: string; fullName: string } | null {
    const decoded = this.getDecodedToken();
    if (!decoded) return null;

    return {
      sub: decoded.sub,
      username: decoded.preferred_username,
      email: decoded.email ?? '',
      firstName: decoded.given_name ?? '',
      lastName: decoded.family_name ?? '',
      fullName: decoded.name ?? decoded.preferred_username
    };
  }

  getUserRoles(): string[] {
    const decoded = this.getDecodedToken();
    if (!decoded) return [];
    return decoded.realm_access?.roles || [];
  }

  isAdmin(): boolean {
    return this.getUserRoles().includes('ADMIN');
  }

  isManager(): boolean {
    return this.getUserRoles().includes('manager');
  }

  isAdminBsa(): boolean {
    return this.getUserRoles().includes('admin_bsa');
  }

  canAccessUserManagement(): boolean {
    return this.isAdmin() || this.isAdminBsa();
  }
}
