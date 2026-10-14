import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { KeycloakAdminService, KeycloakUser, KeycloakRole } from '../../core/services/keycloak-admin.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

interface UserRow extends KeycloakUser {
  displayRoles?: string[];
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    TableModule,
    DialogModule,
    SelectModule,
    ToastModule,
    TagModule,
    ConfirmDialogModule,
    ToggleSwitchModule,
    TooltipModule,
    TranslateModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss'
})
export class UserManagementComponent implements OnInit {
  private keycloakAdminService = inject(KeycloakAdminService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);
  private authService = inject(AuthService);

  /** true = admin_bsa: can only read, cannot create/edit/toggle users */
  isReadOnly = false;

  users: UserRow[] = [];
  availableRoles: KeycloakRole[] = [];
  filteredRoles: KeycloakRole[] = [];

  isLoadingUsers = false;
  isDialogVisible = false;
  isSaving = false;
  isEditMode = false;
  editingUserId: string | null = null;

  searchQuery = '';
  userForm!: FormGroup;

  // Rôles système à exclure de l'affichage
  private readonly SYSTEM_ROLES = [
    'default-roles-externals-management',
    'offline_access',
    'uma_authorization',
    'create-realm',
    'admin'
  ];

  ngOnInit(): void {
    this.isReadOnly = this.authService.isAdminBsa() && !this.authService.isAdmin();
    this.buildForm();
    if (!this.isReadOnly) {
      this.loadRoles(); // Uniquement pour les admins qui peuvent créer/modifier des users
    }
    this.loadUsers();
  }

  private buildForm(): void {
    this.userForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      role: [null, Validators.required],
      enabled: [true]
    });
  }

  private loadRoles(): void {
    this.keycloakAdminService.getRealmRoles().subscribe({
      next: (roles) => {
        this.availableRoles = roles.filter(r => !this.SYSTEM_ROLES.includes(r.name));
        this.filteredRoles = [...this.availableRoles];
      },
      error: () => this.showError(this.translate.instant('userMgmt.errorLoadRoles'))
    });
  }

  loadUsers(): void {
    this.isLoadingUsers = true;
    this.keycloakAdminService.getUsers(this.searchQuery || undefined).subscribe({
      next: async (users) => {
        // Charger les rôles de chaque utilisateur
        const enriched: UserRow[] = [];
        for (const user of users) {
          if (user.id) {
            try {
              const roles = await this.keycloakAdminService.getUserRealmRoles(user.id).toPromise();
              enriched.push({
                ...user,
                displayRoles: (roles || [])
                  .map(r => r.name)
                  .filter(n => !this.SYSTEM_ROLES.includes(n))
              });
            } catch {
              enriched.push({ ...user, displayRoles: [] });
            }
          }
        }
        this.users = enriched;
        this.isLoadingUsers = false;
      },
      error: () => {
        this.isLoadingUsers = false;
        this.showError(this.translate.instant('userMgmt.errorLoadUsers'));
      }
    });
  }

  // ─── Dialog: Create ─────────────────────────────────────────────────────────

  openCreateDialog(): void {
    this.isEditMode = false;
    this.editingUserId = null;
    this.userForm.reset({ enabled: true });
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('username')?.enable();
    this.isDialogVisible = true;
  }

  // ─── Dialog: Edit ────────────────────────────────────────────────────────────

  openEditDialog(user: UserRow): void {
    this.isEditMode = true;
    this.editingUserId = user.id ?? null;
    // En mode édition, le mot de passe est optionnel
    this.userForm.get('password')?.clearValidators();
    this.userForm.get('password')?.updateValueAndValidity();
    this.userForm.get('username')?.disable();

    const userRole = this.availableRoles.find(r => user.displayRoles?.includes(r.name)) ?? null;

    this.userForm.patchValue({
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      enabled: user.enabled,
      role: userRole,
      password: ''
    });

    this.isDialogVisible = true;
  }

  closeDialog(): void {
    this.isDialogVisible = false;
    this.userForm.reset();
  }

  // ─── Save (Create or Update) ─────────────────────────────────────────────────

  onSave(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    const { username, firstName, lastName, email, password, role, enabled } = this.userForm.getRawValue();

    if (this.isEditMode && this.editingUserId) {
      this.updateUser(this.editingUserId, { firstName, lastName, email, enabled }, password, role);
    } else {
      this.createUser({ username, firstName, lastName, email, enabled }, password, role);
    }
  }

  private createUser(userData: Omit<KeycloakUser, 'credentials'>, password: string, role: KeycloakRole): void {
    const userPayload: KeycloakUser = {
      ...userData,
      emailVerified: true,
      credentials: [{ type: 'password', value: password, temporary: false }]
    };

    this.keycloakAdminService.createUser(userPayload).subscribe({
      next: (response) => {
        // Extraire l'ID du nouvel utilisateur depuis le header Location
        const newUserId = this.keycloakAdminService.extractUserIdFromLocation(response);

        if (newUserId && role) {
          // Assigner le rôle directement via l'ID extrait du header Location
          this.keycloakAdminService.assignRealmRoles(newUserId, [role]).subscribe({
            next: () => {
              this.isSaving = false;
              this.isDialogVisible = false;
              this.showSuccess(this.translate.instant('userMgmt.userCreated', { username: userData.username }));
              this.loadUsers();
            },
            error: (err) => {
              this.isSaving = false;
              this.showError(this.translate.instant('userMgmt.userCreatedRoleError') + ': ' + (err?.error?.errorMessage || err?.message || ''));
              this.loadUsers();
            }
          });
        } else {
          this.isSaving = false;
          this.isDialogVisible = false;
          this.showSuccess(this.translate.instant('userMgmt.userCreated', { username: userData.username }));
          this.loadUsers();
        }
      },
      error: (err) => {
        this.isSaving = false;
        const msg = err?.error?.errorMessage || err?.message || this.translate.instant('userMgmt.errorCreate');
        this.showError(msg);
      }
    });
  }

  private updateUser(userId: string, data: Partial<KeycloakUser>, password: string, role: KeycloakRole): void {
    this.keycloakAdminService.updateUser(userId, data).subscribe({
      next: () => {
        const tasks: Promise<any>[] = [];

        // Réinitialiser le mot de passe si fourni
        if (password) {
          tasks.push(this.keycloakAdminService.resetPassword(userId, password, true).toPromise());
        }

        // Mettre à jour le rôle
        if (role) {
          tasks.push(
            this.keycloakAdminService.getUserRealmRoles(userId).toPromise().then((currentRoles) => {
              const toRemove = (currentRoles || []).filter(r => !this.SYSTEM_ROLES.includes(r.name));
              const removePromise = toRemove.length
                ? this.keycloakAdminService.removeRealmRoles(userId, toRemove).toPromise()
                : Promise.resolve();
              return removePromise.then(() =>
                this.keycloakAdminService.assignRealmRoles(userId, [role]).toPromise()
              );
            })
          );
        }

        Promise.all(tasks).then(() => {
          this.isSaving = false;
          this.isDialogVisible = false;
          this.showSuccess(this.translate.instant('userMgmt.userUpdated'));
          this.loadUsers();
        }).catch(() => {
          this.isSaving = false;
          this.showError(this.translate.instant('userMgmt.errorUpdatePartial'));
          this.loadUsers();
        });
      },
      error: (err) => {
        this.isSaving = false;
        this.showError(err?.error?.errorMessage || this.translate.instant('userMgmt.errorCreate'));
      }
    });
  }

  // ─── Toggle Enabled ───────────────────────────────────────────────────────────

  toggleUserEnabled(user: UserRow): void {
    const isDisabling = user.enabled;
    this.confirmationService.confirm({
      message: isDisabling
        ? this.translate.instant('userMgmt.confirmDisable', { username: user.username })
        : this.translate.instant('userMgmt.confirmEnable', { username: user.username }),
      header: this.translate.instant('userMgmt.confirmationHeader'),
      icon: user.enabled ? 'pi pi-ban' : 'pi pi-check-circle',
      acceptLabel: this.translate.instant('userMgmt.confirmLabel'),
      rejectLabel: this.translate.instant('userMgmt.cancelLabel'),
      accept: () => {
        const newState = !user.enabled;
        this.keycloakAdminService.setUserEnabled(user.id!, newState).subscribe({
          next: () => {
            user.enabled = newState;
            this.showSuccess(
              newState
                ? this.translate.instant('userMgmt.userEnabled', { username: user.username })
                : this.translate.instant('userMgmt.userDisabled', { username: user.username })
            );
          },
          error: () => this.showError(this.translate.instant('userMgmt.errorToggle'))
        });
      }
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  getRoleSeverity(role: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    const map: Record<string, 'success' | 'info' | 'warn' | 'danger' | 'secondary'> = {
      ADMIN: 'danger',
      RECRUITER: 'info',
      CANDIDAT: 'success',
      manager: 'warn',
      admin_bsa: 'secondary'
    };
    return map[role] ?? 'secondary';
  }

  onSearch(): void {
    this.loadUsers();
  }

  private showSuccess(msg: string): void {
    this.messageService.add({ severity: 'success', summary: this.translate.instant('userMgmt.successSummary'), detail: msg });
  }

  private showError(msg: string): void {
    this.messageService.add({ severity: 'error', summary: this.translate.instant('userMgmt.errorSummary'), detail: msg });
  }
}
