import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface KeycloakUser {
  id?: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  emailVerified?: boolean;
  credentials?: { type: string; value: string; temporary: boolean }[];
}

export interface KeycloakRole {
  id: string;
  name: string;
  description?: string;
}

@Injectable({
  providedIn: 'root'
})
export class KeycloakAdminService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private get adminBaseUrl(): string {
    // Utilise une URL relative → passe par le proxy Angular dev server
    // qui forward /admin/* vers http://localhost:9090/admin/*
    // Cela évite le problème CORS pour les appels POST/PUT/DELETE vers l'Admin API
    return `/admin/realms/${this.authService.REALM}`;
  }

  private get accountUrl(): string {
    return `${this.authService.KEYCLOAK_URL}/realms/${this.authService.REALM}/account`;
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  // ─── Current User Profile ─────────────────────────────────────────────────────

  /**
   * Récupère le profil de l'utilisateur connecté via /account
   */
  getCurrentUserProfile(): Observable<any> {
    return this.http.get(this.accountUrl, { headers: this.getAuthHeaders() });
  }

  /**
   * Met à jour le profil de l'utilisateur connecté
   * Keycloak /account attend un POST avec le profil complet
   */
  updateCurrentUserProfile(profile: { firstName: string; lastName: string; email: string }): Observable<any> {
    return this.http.post(this.accountUrl, profile, {
      headers: this.getAuthHeaders(),
      responseType: 'text' as const
    });
  }

  // ─── Admin: Users ─────────────────────────────────────────────────────────────

  /**
   * Liste tous les utilisateurs du realm
   */
  getUsers(search?: string): Observable<KeycloakUser[]> {
    let url = `${this.adminBaseUrl}/users`;
    if (search) {
      url += `?search=${encodeURIComponent(search)}`;
    }
    return this.http.get<KeycloakUser[]>(url, { headers: this.getAuthHeaders() });
  }

  /**
   * Récupère un utilisateur par son ID
   */
  getUserById(userId: string): Observable<KeycloakUser> {
    return this.http.get<KeycloakUser>(`${this.adminBaseUrl}/users/${userId}`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Crée un nouvel utilisateur dans Keycloak.
   * Keycloak retourne 201 avec body vide + header Location contenant l'ID.
   * On utilise observe:'response' pour éviter l'erreur de parsing JSON.
   */
  createUser(user: KeycloakUser): Observable<HttpResponse<any>> {
    return this.http.post(`${this.adminBaseUrl}/users`, user, {
      headers: this.getAuthHeaders(),
      observe: 'response',
      responseType: 'text' as const
    }) as unknown as Observable<HttpResponse<any>>;
  }

  /**
   * Extrait l'ID utilisateur depuis le header Location retourné par Keycloak
   * Location: http://host/admin/realms/{realm}/users/{id}
   */
  extractUserIdFromLocation(response: HttpResponse<any>): string | null {
    const location = response.headers.get('Location');
    if (!location) return null;
    const parts = location.split('/');
    return parts[parts.length - 1] || null;
  }

  /**
   * Met à jour un utilisateur existant
   */
  updateUser(userId: string, user: Partial<KeycloakUser>): Observable<any> {
    return this.http.put(`${this.adminBaseUrl}/users/${userId}`, user, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Active ou désactive un utilisateur
   */
  setUserEnabled(userId: string, enabled: boolean): Observable<any> {
    return this.http.put(
      `${this.adminBaseUrl}/users/${userId}`,
      { enabled },
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Réinitialise le mot de passe d'un utilisateur
   */
  resetPassword(userId: string, password: string, temporary = true): Observable<any> {
    return this.http.put(
      `${this.adminBaseUrl}/users/${userId}/reset-password`,
      { type: 'password', value: password, temporary },
      { headers: this.getAuthHeaders() }
    );
  }

  // ─── Admin: Roles ──────────────────────────────────────────────────────────────

  /**
   * Liste tous les rôles du realm
   */
  getRealmRoles(): Observable<KeycloakRole[]> {
    return this.http.get<KeycloakRole[]>(`${this.adminBaseUrl}/roles`, {
      headers: this.getAuthHeaders()
    });
  }

  /**
   * Récupère les rôles realm actuels d'un utilisateur
   */
  getUserRealmRoles(userId: string): Observable<KeycloakRole[]> {
    return this.http.get<KeycloakRole[]>(
      `${this.adminBaseUrl}/users/${userId}/role-mappings/realm`,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Assigne un ou plusieurs rôles realm à un utilisateur
   */
  assignRealmRoles(userId: string, roles: KeycloakRole[]): Observable<any> {
    return this.http.post(
      `${this.adminBaseUrl}/users/${userId}/role-mappings/realm`,
      roles,
      { headers: this.getAuthHeaders() }
    );
  }

  /**
   * Supprime un ou plusieurs rôles realm d'un utilisateur
   */
  removeRealmRoles(userId: string, roles: KeycloakRole[]): Observable<any> {
    return this.http.delete(
      `${this.adminBaseUrl}/users/${userId}/role-mappings/realm`,
      { headers: this.getAuthHeaders(), body: roles }
    );
  }
}
