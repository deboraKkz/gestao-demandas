import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserService } from '../core/services/user.service';

export const roleGuard: CanActivateFn = (route) => {
  const userService = inject(UserService);
  const router = inject(Router);
  const roles: string[] = route.data?.['roles'] ?? [];
  const user = userService.currentUser();
  if (user && roles.includes(user.role)) {
    return true;
  }
  return router.createUrlTree(['/']);
};
