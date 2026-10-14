import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenuItemComponent } from '../menuitem/menu-item.component';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../../../core/services/auth.service';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, MenuItemComponent, RouterModule, TranslateModule],
    templateUrl: './menu.component.html'
})
export class MenuComponent implements OnInit {
    model: MenuItem[] = [];

    constructor(private translate: TranslateService, private authService: AuthService) {}

    ngOnInit() {
        this.buildMenu();

        this.translate.onLangChange.subscribe(() => {
            this.buildMenu();
        });
    }

    buildMenu() {
        const roles = this.authService.getUserRoles();
        const isAdmin = roles.includes('ADMIN');
        const isRecruiter = roles.includes('RECRUITER');
        const isManager = roles.includes('manager');
        const isAdminBsa = roles.includes('admin_bsa');

        // Visibilité par section
        const canSeePrompts = isAdmin || isRecruiter;
        const canSeeInterviews = isAdmin || isRecruiter || isManager;
        const canSeeNewOffer = isAdmin || isRecruiter || isManager || isAdminBsa;
        const canSeeCandidateList = isAdmin || isRecruiter || isManager || isAdminBsa;
        const canSeeUserMgmt = isAdmin || isAdminBsa;

        this.model = [
            {
                items: [{
                    label: this.translate.instant('dashboardMenu'),
                    icon: 'pi pi-fw pi-chart-bar',
                    routerLink: ['/']
                }]
            },
            {
                label: this.translate.instant('candidates'),
                items: [
                    {
                        label: this.translate.instant('newCV'),
                        icon: 'pi pi-fw pi-user-plus',
                        routerLink: ['/candidates/new-cv']
                    },
                    {
                        label: this.translate.instant('candidateListMenu'),
                        icon: 'pi pi-fw pi-list',
                        routerLink: ['/candidates/candidate-list'],
                        visible: canSeeCandidateList
                    }
                ]
            },
            {
                label: this.translate.instant('offerManagement'),
                items: [
                    {
                        label: this.translate.instant('newOfferMenu'),
                        icon: 'pi pi-briefcase',
                        routerLink: ['/offers/new-offer'],
                        visible: canSeeNewOffer
                    },
                    {
                        label: this.translate.instant('offerListMenu'),
                        icon: 'pi pi-fw pi-list',
                        routerLink: ['/offers']
                    }
                ]
            },
            {
                label: this.translate.instant('promptManagement'),
                visible: canSeePrompts,
                items: [
                    {
                        label: this.translate.instant('newPromptMenu'),
                        icon: 'pi pi-fw pi-microchip-ai',
                        routerLink: ['/prompts/new-prompt']
                    },
                    {
                        label: this.translate.instant('promptListMenu'),
                        icon: 'pi pi-fw pi-list',
                        routerLink: ['/prompts/prompt-list']
                    }
                ]
            },
            {
                label: this.translate.instant('interviewsManagement'),
                visible: canSeeInterviews,
                items: [
                    {
                        label: this.translate.instant('interviewListMenu'),
                        icon: 'pi pi-fw pi-list',
                        routerLink: ['/interviews/interview-list']
                    }
                ]
            },
            {
                label: this.translate.instant('administration'),
                visible: canSeeUserMgmt,
                items: [
                    {
                        label: this.translate.instant('userManagementMenu'),
                        icon: 'pi pi-fw pi-users',
                        routerLink: ['/user-management']
                    }
                ]
            }
        ];
    }
}
