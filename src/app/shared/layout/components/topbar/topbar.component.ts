import { Component, ViewEncapsulation, OnInit, inject } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { StyleClassModule } from 'primeng/styleclass';
import { LayoutService } from '../../service/layout.service';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { LanguageService } from '../../../../../app/core/services/language.service';
import { AuthService } from '../../../../../app/core/services/auth.service';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [RouterModule, CommonModule, StyleClassModule, TranslateModule],
    styleUrl: './topbar.component.scss',
    templateUrl: './topbar.component.html'
})
export class AppTopbar implements OnInit {
    items!: MenuItem[];
    currentLang: string = 'en';

    currentUser: ReturnType<AuthService['getCurrentUser']> = null;
    isAdmin = false;
    canAccessUserMgmt = false;
    userInitials = '';

    constructor(
        public layoutService: LayoutService,
        private translate: TranslateService,
        private languageService: LanguageService,
        public authService: AuthService
    ) {}

    ngOnInit() {
        this.currentLang = this.languageService.getCurrentLanguage();
        this.translate.use(this.currentLang);
        this.languageService.getLanguageObservable().subscribe((lang) => {
            this.currentLang = lang;
            this.translate.use(lang);
        });

        this.currentUser = this.authService.getCurrentUser();
        this.isAdmin = this.authService.isAdmin();
        this.canAccessUserMgmt = this.authService.canAccessUserManagement();
        this.computeInitials();
    }

    private computeInitials(): void {
        const user = this.currentUser;
        if (!user) { this.userInitials = '?'; return; }
        if (user.firstName && user.lastName) {
            this.userInitials = (user.firstName[0] + user.lastName[0]).toUpperCase();
        } else {
            this.userInitials = user.username.substring(0, 2).toUpperCase();
        }
    }

    toggleDarkMode() {
        this.layoutService.layoutConfig.update((state) => ({ ...state, darkTheme: !state.darkTheme }));
    }

    switchLanguage(lang: string) {
        this.languageService.setLanguage(lang);
        this.translate.use(lang);
        this.currentLang = lang;
    }

    logout(): void {
        this.authService.logout();
    }
}
