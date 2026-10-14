import { provideHttpClient, withFetch, HttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withEnabledBlockingInitialNavigation, withInMemoryScrolling } from '@angular/router';
import Aura from '@primeng/themes/aura';
import { providePrimeNG } from 'primeng/config';
import { appRoutes } from './app.routes';
import { MainPreset } from './mainpreset';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader, provideTranslateHttpLoader } from '@ngx-translate/http-loader';

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(
            appRoutes,
            withInMemoryScrolling({
                anchorScrolling: 'enabled',
                scrollPositionRestoration: 'enabled'
            }),
            withEnabledBlockingInitialNavigation()
        ),
        provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
        provideAnimationsAsync(),
        ConfirmationService,
        importProvidersFrom(ConfirmDialogModule),
        provideTranslateHttpLoader({
            prefix: '/assets/i18n/',
            suffix: '.json'
        }),
        importProvidersFrom(
            TranslateModule.forRoot({
                defaultLanguage: 'en',
                loader: {
                    provide: TranslateLoader,
                    useClass: TranslateHttpLoader
                }
            })
        ),
        providePrimeNG({
            theme: {
                preset: MainPreset,
                options: {
                    darkModeSelector: '.app-dark'
                }
            }
        })
    ]
};
