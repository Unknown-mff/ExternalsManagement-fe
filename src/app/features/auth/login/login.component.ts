import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';


@Component({
    selector: 'app-login',
    standalone: true,
    imports: [ButtonModule, CheckboxModule, InputTextModule, PasswordModule, FormsModule, RouterModule, RippleModule],
    templateUrl:'./login.component.html'
})
export class LoginComponent {
    authService = inject(AuthService);
    router = inject(Router);

    email: string = '';
    password: string = '';
    checked: boolean = false;
    errorMessage: string = '';
    isLoading: boolean = false;

    onLogin() {
        if (!this.email || !this.password) return;
        
        this.isLoading = true;
        this.errorMessage = '';
        
        this.authService.login(this.email, this.password).subscribe({
            next: (res) => {
                this.router.navigate(['/']);
            },
            error: (err) => {
                this.isLoading = false;
                console.error('Erreur Keycloak détaillée:', err);
                
                const keycloakError = err.error?.error_description || err.error?.error || '';
                
                if (err.status === 0) {
                    this.errorMessage = 'Erreur réseau ou CORS. Vérifiez que Keycloak autorise http://localhost:4200 dans "Web Origins".';
                } else if (err.status === 401 || err.status === 400) {
                    this.errorMessage = `Accès refusé par Keycloak : ${keycloakError || 'Identifiants incorrects'}`;
                } else {
                    this.errorMessage = 'Erreur ' + err.status + ' lors de la connexion.';
                }
            }
        });
    }
}
