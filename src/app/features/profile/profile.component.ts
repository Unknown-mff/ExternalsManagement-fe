import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { KeycloakAdminService } from '../../core/services/keycloak-admin.service';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { MessageModule } from 'primeng/message';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    DividerModule,
    MessageModule,
    ToastModule,
    TranslateModule
  ],
  providers: [MessageService],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private keycloakAdminService = inject(KeycloakAdminService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private translate = inject(TranslateService);

  profileForm!: FormGroup;
  isLoading = false;
  isSaving = false;
  currentUser = this.authService.getCurrentUser();
  userInitials = '';
  userRoles: string[] = [];

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      username: [{ value: '', disabled: true }]
    });

    this.loadProfile();
  }

  private loadProfile(): void {
    this.isLoading = true;
    const user = this.currentUser;
    if (user) {
      this.profileForm.patchValue({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username
      });
      this.userInitials = this.getInitials(user.firstName, user.lastName, user.username);
    }
    this.userRoles = this.authService.getUserRoles().filter(r =>
      !['default-roles-externals-management', 'offline_access', 'uma_authorization'].includes(r)
    );
    this.isLoading = false;
  }

  private getInitials(firstName: string, lastName: string, username: string): string {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  }

  onSave(): void {
    if (this.profileForm.invalid) return;

    this.isSaving = true;
    const { firstName, lastName, email } = this.profileForm.value;

    this.keycloakAdminService.updateCurrentUserProfile({ firstName, lastName, email }).subscribe({
      next: () => {
        this.isSaving = false;
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant('profilePage.successSummary'),
          detail: this.translate.instant('profilePage.successDetail')
        });
      },
      error: (err) => {
        this.isSaving = false;
        const msg = err?.error?.errorMessage || this.translate.instant('profilePage.errorDetail');
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('profilePage.errorSummary'),
          detail: msg
        });
      }
    });
  }
}
