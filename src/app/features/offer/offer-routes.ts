import { Routes } from "@angular/router";
import { roleGuard } from "../../core/guards/role.guard";

export const OFFER_ROUTES: Routes = [
    {
      path: '',
      loadComponent: () =>
        import('./components/offer-list/offer-list.component').then(m => m.OfferListComponent),
      title: 'Offer List'
    },


    {
        path : 'new-offer' ,
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'RECRUITER', 'manager', 'admin_bsa'] },
        loadComponent : ()=>
            import('./components/new-offer/new-offer.component').then(m=>m.NewOfferComponent),
        title : 'New Offer'
    },

  ];
